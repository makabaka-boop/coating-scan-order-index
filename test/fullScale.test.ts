import { describe, expect, it } from 'vitest';
import { solveFile } from '../src/lib/solve';
import { buildFullScaleSample, digestAnswers, MAX_QUERIES, MAX_READINGS, oracleKth } from './helpers';

// 由确定性生成器 + 当前实现产生，用于回归锁定；运行时 console 也会打印实际摘要。
const GOLDEN_DIGEST = 0xbddf6c62;

describe('确定性满规模样本：200000 读数 × 100000 查询', () => {
  const { readings, queries } = buildFullScaleSample();

  it('规模满足合同上限', () => {
    expect(readings.length).toBe(MAX_READINGS);
    expect(queries.length).toBe(MAX_QUERIES);
  });

  it('构建 + 全部查询在 4000ms 内完成，且结果摘要可复现', () => {
    const t0 = performance.now();
    const answers = solveFile({ readings, queries });
    const elapsed = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`满规模耗时: ${elapsed.toFixed(1)} ms；摘要: 0x${digestAnswers(answers).toString(16)}`);
    expect(elapsed).toBeLessThan(4000);

    expect(answers.length).toBe(MAX_QUERIES);
    answers.forEach((a, i) => expect(a.queryIndex).toBe(i));

    // 固定的首/尾窗口（见 helpers 中前 6 条构造查询）
    expect(answers[0]).toMatchObject({ start: 0, end: MAX_READINGS, k: 1 });
    expect(answers[0].value).toBe(0); // 样本中必然存在 0
    expect(answers[1]).toMatchObject({ start: 0, end: MAX_READINGS, k: MAX_READINGS });
    expect(answers[1].value).toBe(65535); // 满量程值必然存在
    expect(answers[2]).toMatchObject({ start: 0, end: 1, k: 1 });
    expect(answers[2].value).toBe(readings[0]);
    expect(answers[3]).toMatchObject({ start: MAX_READINGS - 1, end: MAX_READINGS, k: 1 });
    expect(answers[3].value).toBe(readings[MAX_READINGS - 1]);

    // 确定性摘要：任何实现或生成器的漂移都会被抓住
    expect(digestAnswers(answers)).toBe(GOLDEN_DIGEST);

    // 抽样 300 条与直接排序预言机交叉核对
    for (let i = 0; i < 300; i++) {
      const idx = (i * 7919 + 13) % MAX_QUERIES;
      const a = answers[idx];
      expect(a.queryIndex).toBe(idx);
      expect(a.value).toBe(oracleKth(readings, a.start, a.end, a.k));
    }
  });

  it('单格平移窗口在首尾相邻处不偏移', () => {
    const answers = solveFile({ readings, queries });
    // helpers 中自下标 6 起，每轮 push 首段、尾段各一条，故 i 对应步长为 2
    for (let i = 0; i < 100; i++) {
      expect(answers[6 + i * 2]).toMatchObject({ start: i, end: i + 1, k: 1, value: readings[i] });
      const tailStart = MAX_READINGS - 1 - i;
      expect(answers[7 + i * 2]).toMatchObject({
        start: tailStart,
        end: tailStart + 1,
        k: 1,
        value: readings[tailStart],
      });
    }
  });
});
