import { describe, expect, it } from 'vitest';
import { WaveletMatrix } from '../src/lib/waveletMatrix';
import { solveFile } from '../src/lib/solve';
import type { ScannerFile } from '../src/lib/types';
import { mulberry32, oracleKth } from './helpers';

function solveAll(readings: number[], queries: { start: number; end: number; k: number }[]) {
  const file: ScannerFile = { readings, queries };
  return solveFile(file);
}

/** 穷举所有非空子区间 × 所有合法 k，与直接排序预言机逐一核对。 */
function exhaustiveAgainstOracle(readings: number[]) {
  const wm = new WaveletMatrix(readings);
  for (let l = 0; l < readings.length; l++) {
    for (let r = l + 1; r <= readings.length; r++) {
      for (let k = 1; k <= r - l; k++) {
        expect(wm.kth(l, r, k)).toBe(oracleKth(readings, l, r, k));
      }
    }
  }
}

describe('WaveletMatrix 与排序预言机：小样本全覆盖', () => {
  it('重复值', () => {
    exhaustiveAgainstOracle([5, 1, 5, 3, 5, 1, 3, 0, 65535, 3]);
  });

  it('全相等', () => {
    exhaustiveAgainstOracle(new Array(40).fill(4242));
  });

  it('单元素（最小值 0 与最大值 65535）', () => {
    exhaustiveAgainstOracle([0]);
    exhaustiveAgainstOracle([65535]);
  });

  it('首尾窗口与长度 2 边界', () => {
    exhaustiveAgainstOracle([65535, 0]);
    exhaustiveAgainstOracle([0, 65535]);
  });

  it('2 的幂附近的值都能正确还原（0、255、256、32767、32768、65535）', () => {
    const readings = [65535, 0, 32768, 1, 32767, 256, 255, 257, 128, 16384, 49152, 65534];
    exhaustiveAgainstOracle(readings);
  });

  it('确定性随机小样本，多组穷举', () => {
    const rng = mulberry32(7);
    for (let t = 0; t < 40; t++) {
      const n = 1 + ((rng() * 60) | 0);
      const readings = new Array<number>(n);
      for (let i = 0; i < n; i++) {
        const u = rng();
        readings[i] =
          u < 0.3 ? ((rng() * 4) | 0) : u < 0.6 ? ((rng() * 256) | 0) : (rng() * 65536) | 0;
      }
      exhaustiveAgainstOracle(readings);
    }
  });
});

describe('solveFile：顺序、下标与 k 的两端', () => {
  const readings = [9, 9, 1, 9, 1, 5, 9, 1, 5, 9];

  it('首窗口 / 尾窗口 / 相邻单格窗口', () => {
    const queries = [
      { start: 0, end: 10, k: 1 },
      { start: 0, end: 10, k: 10 },
      { start: 0, end: 1, k: 1 },
      { start: 1, end: 2, k: 1 },
      { start: 8, end: 9, k: 1 },
      { start: 9, end: 10, k: 1 },
    ];
    const answers = solveAll(readings, queries);
    expect(answers.map((a) => a.value)).toEqual([1, 9, 9, 9, 5, 9]);
    // queryIndex 严格等于原下标，防止首尾相邻窗口偏移
    answers.forEach((a, i) => expect(a.queryIndex).toBe(i));
  });

  it('空查询数组合法且返回空结果', () => {
    expect(solveAll([1, 2, 3], [])).toEqual([]);
  });

  it('与预言机对随机窗口比对', () => {
    const rng = mulberry32(99);
    const queries = [];
    for (let i = 0; i < 300; i++) {
      const l = (rng() * readings.length) | 0;
      const r = l + 1 + ((rng() * (readings.length - l)) | 0);
      const k = 1 + ((rng() * (r - l)) | 0);
      queries.push({ start: l, end: r, k });
    }
    const answers = solveAll(readings, queries);
    for (const a of answers) {
      expect(a.value).toBe(oracleKth(readings, a.start, a.end, a.k));
    }
  });
});
