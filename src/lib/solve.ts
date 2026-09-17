import type { QueryAnswer, ScannerFile } from './types';
import { WaveletMatrix } from './waveletMatrix';

/**
 * 对整份已校验通过的文件一次性求解全部查询。
 *
 * 构建一次 Wavelet Matrix（O(16n)），随后每个查询 O(16)；
 * 答案严格按 queries 原顺序返回，并携带 queryIndex，
 * 因此首尾相邻窗口不会出现下标偏移。
 */
export function solveFile(file: ScannerFile): QueryAnswer[] {
  const wm = new WaveletMatrix(file.readings);
  const answers = new Array<QueryAnswer>(file.queries.length);
  for (let i = 0; i < file.queries.length; i++) {
    const q = file.queries[i];
    answers[i] = {
      queryIndex: i,
      start: q.start,
      end: q.end,
      k: q.k,
      value: wm.kth(q.start, q.end, q.k),
    };
  }
  return answers;
}
