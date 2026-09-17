/**
 * Wavelet Matrix（小波矩阵）
 *
 * 值域固定为 16 位无符号整数 0..65535。用每层的稳定 0/1 分组排列，
 * 配合零位前缀计数，可在 O(16) 时间内回答任意区间 [l, r) 的第 k 小值。
 *
 * 对比逐窗口复制排序（20 万读数 × 10 万窗口会直接卡死浏览器），
 * 构建为 O(16·n)、所有查询合计 O(16·q)。
 *
 * 内存：每层一个零位/一位前缀计数 Uint32Array，共约 13MB（n=20万）；
 * 稳定排列只在构建过程中保留两层。
 */
const BITS = 16;

export class WaveletMatrix {
  /** prefix[b][i]：第 b 层排列前 i 个元素中 1 的个数（长度 n+1）。 */
  private readonly prefix: Uint32Array[] = new Array(BITS);
  /** 第 b 层排列中 0 的总数（等于 1 区间的起点）。 */
  private readonly zeros: Uint32Array = new Uint32Array(BITS);

  constructor(values: ArrayLike<number>) {
    const n = values.length;
    let cur = Uint32Array.from(values as ArrayLike<number>);

    for (let b = BITS - 1; b >= 0; b--) {
      const li = BITS - 1 - b;
      const pref = new Uint32Array(n + 1);
      const zeroPart = new Uint32Array(n);
      const onePart = new Uint32Array(n);
      let zc = 0;
      let oc = 0;

      for (let i = 0; i < n; i++) {
        const v = cur[i];
        const bit = (v >>> b) & 1;
        pref[i + 1] = pref[i] + bit;
        if (bit === 0) zeroPart[zc++] = v;
        else onePart[oc++] = v;
      }

      const next = new Uint32Array(n);
      next.set(zeroPart.subarray(0, zc), 0);
      next.set(onePart.subarray(0, oc), zc);

      this.prefix[li] = pref;
      this.zeros[li] = zc;
      cur = next;
    }
  }

  /** 半开区间 [l, r) 内第 k 小（k 从 1 开始）。 */
  kth(l: number, r: number, k: number): number {
    let result = 0;
    for (let li = 0; li < BITS; li++) {
      const pref = this.prefix[li];
      const onesL = pref[l];
      const onesR = pref[r];
      const zerosL = l - onesL;
      const zerosR = r - onesR;
      const zeroCount = zerosR - zerosL;
      const z = this.zeros[li];

      if (k <= zeroCount) {
        // 落入 0 子区间（位于该层排列的前 z 个位置）
        l = zerosL;
        r = zerosR;
      } else {
        k -= zeroCount;
        result |= 1 << (BITS - 1 - li);
        // 落入 1 子区间（起始偏移为 z）
        l = z + onesL;
        r = z + onesR;
      }
    }
    return result >>> 0;
  }
}
