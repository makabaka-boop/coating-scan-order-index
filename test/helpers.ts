/**
 * 确定性伪随机数（mulberry32）。满规模样本的生成必须跨运行、
 * 跨机器可复现，这样核对结果摘要才有意义。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 小样本预言机：直接复制窗口内读数并排序，取第 k 小（k 从 1 开始）。 */
export function oracleKth(readings: readonly number[], start: number, end: number, k: number): number {
  const window = readings.slice(start, end).sort((a, b) => a - b);
  return window[k - 1];
}

/** 对一组答案计算确定性 32 位摘要（FNV-1a 风格）。 */
export function digestAnswers(
  answers: ReadonlyArray<{ queryIndex: number; start: number; end: number; k: number; value: number }>,
): number {
  let h = 0x811c9dc5;
  for (const a of answers) {
    const packed =
      (((a.queryIndex * 31 + a.start) * 31 + a.end) * 31 + a.k) * 131 + a.value;
    h = Math.imul(h ^ (packed >>> 24), 0x01000193);
    h = Math.imul(h ^ ((packed >>> 8) & 0xffff), 0x01000193);
    h = Math.imul(h ^ (packed & 0xff), 0x01000193);
  }
  return h >>> 0;
}

export const MAX_READINGS = 200_000;
export const MAX_QUERIES = 100_000;

/**
 * 生成确定性满规模样本：200000 读数 + 100000 查询。
 * 读数故意集中在少数桶并混入大量重复值，再叠加低频全范围值。
 */
export function buildFullScaleSample(seed = 20260917): {
  readings: number[];
  queries: { start: number; end: number; k: number }[];
} {
  const rng = mulberry32(seed);
  const readings = new Array<number>(MAX_READINGS);
  for (let i = 0; i < MAX_READINGS; i++) {
    const u = rng();
    let v: number;
    if (u < 0.4) v = (rng() * 16) | 0; // 0..15 极密重复
    else if (u < 0.7) v = ((rng() * 256) | 0) * 256; // 256 的倍数
    else if (u < 0.95) v = (rng() * 4096) | 0;
    else v = (rng() * 65536) | 0;
    readings[i] = Math.max(0, Math.min(65535, v | 0));
  }
  // 钉住两个值域端点，使全范围 k=1 / k=n 的答案确定可复现
  readings[0] = 0;
  readings[MAX_READINGS - 1] = 65535;
  // 再撒一些 65535 与 0，保证它们在重复值场景中也出现
  for (let i = 0; i < 50; i++) {
    readings[1 + ((rng() * (MAX_READINGS - 2)) | 0)] = 65535;
    readings[1 + ((rng() * (MAX_READINGS - 2)) | 0)] = 0;
  }

  const queries: { start: number; end: number; k: number }[] = [];
  // 1) 首窗口、尾窗口（满长、单元素）及 k 的两端
  queries.push({ start: 0, end: MAX_READINGS, k: 1 });
  queries.push({ start: 0, end: MAX_READINGS, k: MAX_READINGS });
  queries.push({ start: 0, end: 1, k: 1 });
  queries.push({ start: MAX_READINGS - 1, end: MAX_READINGS, k: 1 });
  queries.push({ start: MAX_READINGS - 2, end: MAX_READINGS, k: 1 });
  queries.push({ start: MAX_READINGS - 2, end: MAX_READINGS, k: 2 });

  // 2) 首尾相邻窗口（窗口长度 1，逐格平移）
  for (let i = 0; i < 100; i++) {
    queries.push({ start: i, end: i + 1, k: 1 });
    queries.push({ start: MAX_READINGS - 1 - i, end: MAX_READINGS - i, k: 1 });
  }

  // 3) 随机窗口 + 随机/边界 k，直到 100000
  while (queries.length < MAX_QUERIES) {
    const start = (rng() * MAX_READINGS) | 0;
    const maxLen = MAX_READINGS - start;
    const len = 1 + ((rng() * Math.min(maxLen, 5000)) | 0);
    const end = start + len;
    const pick = rng();
    let k: number;
    if (pick < 0.15) k = 1;
    else if (pick < 0.3) k = len;
    else k = 1 + ((rng() * len) | 0);
    queries.push({ start, end, k });
  }

  return { readings, queries };
}
