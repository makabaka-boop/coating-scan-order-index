import { describe, expect, it } from 'vitest';
import { parseAndValidate, validateScannerFile } from '../src/lib/validation';

function badIssues(data: unknown) {
  const r = validateScannerFile(data);
  expect(r.ok).toBe(false);
  return r.issues;
}

describe('合法文件', () => {
  it('最小文件、全相等、空 queries', () => {
    expect(validateScannerFile({ readings: [0], queries: [] }).ok).toBe(true);
    expect(
      validateScannerFile({ readings: [65535, 65535, 65535], queries: [{ start: 0, end: 3, k: 2 }] })
        .ok,
    ).toBe(true);
  });

  it('边界值恰好合法：65535、end=n、k=len', () => {
    expect(
      validateScannerFile({ readings: [1, 2, 3, 4], queries: [{ start: 0, end: 4, k: 4 }] }).ok,
    ).toBe(true);
  });
});

describe('结构错误', () => {
  it('顶层不是对象 / 是数组 / 为 null', () => {
    expect(badIssues([1, 2, 3])[0].at).toBe('$');
    expect(badIssues(null)[0].at).toBe('$');
    expect(badIssues('x')[0].at).toBe('$');
  });

  it('多余顶层字段被拒绝', () => {
    const issues = badIssues({ readings: [1], queries: [], secret: 0 });
    expect(issues.some((i) => i.at === '$.secret')).toBe(true);
  });

  it('缺少 readings 或 queries', () => {
    expect(badIssues({ queries: [] }).some((i) => i.at === '$.readings')).toBe(true);
    expect(badIssues({ readings: [1] }).some((i) => i.at === '$.queries')).toBe(true);
  });

  it('queries 元素不是对象、含多余字段', () => {
    expect(badIssues({ readings: [1], queries: [5] })[0].at).toBe('$.queries[0]');
    const issues = badIssues({ readings: [1, 2], queries: [{ start: 0, end: 1, k: 1, x: 2 }] });
    expect(issues.some((i) => i.at === '$.queries[0].x')).toBe(true);
  });

  it('JSON 语法错误整体拒绝', () => {
    const r = parseAndValidate('{ readings: [');
    expect(r.ok).toBe(false);
    expect(r.issues[0].at).toBe('$');
  });
});

describe('读数边界', () => {
  it('空 readings', () => {
    expect(badIssues({ readings: [], queries: [] }).some((i) => i.at === '$.readings')).toBe(true);
  });

  it('非整数、浮点、越界值按下标反馈', () => {
    const issues = badIssues({
      readings: [1, -1, 2.5, 65536, '3', true],
      queries: [],
    });
    const paths = issues.map((i) => i.at);
    expect(paths).toContain('$.readings[1]');
    expect(paths).toContain('$.readings[2]');
    expect(paths).toContain('$.readings[3]');
    expect(paths).toContain('$.readings[4]');
    expect(paths).toContain('$.readings[5]');
  });

  it('readings 超过 200000', () => {
    const issues = badIssues({ readings: new Array(200001).fill(0), queries: [] });
    expect(issues.some((i) => i.at === '$.readings')).toBe(true);
  });
});

describe('查询边界：0≤start<end≤n 且 1≤k≤end-start', () => {
  const n4 = { readings: [1, 2, 3, 4], queries: [] as unknown[] };

  it('start 为负、end 超长、start==end、start>end 各自定位到下标', () => {
    n4.queries = [
      { start: -1, end: 2, k: 1 },
      { start: 0, end: 5, k: 1 },
      { start: 2, end: 2, k: 1 },
      { start: 3, end: 2, k: 1 },
    ];
    const paths = badIssues(n4).map((i) => i.at);
    expect(paths.some((p) => p.startsWith('$.queries[0]'))).toBe(true);
    expect(paths.some((p) => p.startsWith('$.queries[1]'))).toBe(true);
    expect(paths.some((p) => p.startsWith('$.queries[2]'))).toBe(true);
    expect(paths.some((p) => p.startsWith('$.queries[3]'))).toBe(true);
  });

  it('k=0 与 k>len 拒绝；字段类型错误拒绝', () => {
    n4.queries = [
      { start: 0, end: 2, k: 0 },
      { start: 0, end: 2, k: 3 },
      { start: 0, end: 2, k: '1' },
      { start: 0.2, end: 2, k: 1 },
    ];
    const paths = badIssues(n4).map((i) => i.at);
    expect(paths).toContain('$.queries[0].k');
    expect(paths).toContain('$.queries[1].k');
    expect(paths).toContain('$.queries[2].k');
    expect(paths).toContain('$.queries[3].start');
  });

  it('queries 超过 100000', () => {
    const issues = badIssues({ readings: [1], queries: new Array(100001).fill({ start: 0, end: 1, k: 1 }) });
    expect(issues.some((i) => i.at === '$.queries')).toBe(true);
  });

  it('一个非法查询不得影响错误收集，全部错误都按下标列出', () => {
    const issues = badIssues({
      readings: [1, 2],
      queries: [
        { start: 0, end: 1, k: 1 },
        { start: 1, end: 1, k: 1 },
        { start: 1, end: 2, k: 1 },
      ],
    });
    // 只有中间非法项报错，合法项不产生错误
    expect(issues.every((i) => i.at.startsWith('$.queries[1]'))).toBe(true);
  });
});
