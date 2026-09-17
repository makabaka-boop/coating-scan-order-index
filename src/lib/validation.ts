import type { Query, ScannerFile, ValidationIssue } from './types';

export const MAX_READINGS = 200_000;
export const MAX_QUERIES = 100_000;
export const MIN_VALUE = 0;
export const MAX_VALUE = 65_535;

function isInt32(x: unknown): x is number {
  return typeof x === 'number' && Number.isSafeInteger(x);
}

/**
 * 严格校验整份文件。任何结构或边界错误都会收集到 issues 中：
 * 调用方只要拿到非空 issues，就必须拒绝整个文件、清除旧结果，
 * 绝不允许留下部分答案。
 */
export function validateScannerFile(data: unknown): {
  ok: boolean;
  file?: ScannerFile;
  issues: ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {
      ok: false,
      issues: [{ at: '$', message: '顶层必须是一个对象，且仅含 readings 与 queries 两个字段' }],
    };
  }

  const obj = data as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (key !== 'readings' && key !== 'queries') {
      issues.push({ at: `$.${key}`, message: '存在多余字段，文件只允许 readings 与 queries' });
    }
  }

  // ---- readings ----
  const readings: number[] = [];
  if (!Array.isArray(obj.readings)) {
    issues.push({ at: '$.readings', message: 'readings 必须是数组' });
  } else {
    if (obj.readings.length === 0) {
      issues.push({ at: '$.readings', message: `readings 长度必须在 1 至 ${MAX_READINGS} 之间，实际为空` });
    }
    if (obj.readings.length > MAX_READINGS) {
      issues.push({
        at: '$.readings',
        message: `readings 长度不得超过 ${MAX_READINGS}，实际为 ${obj.readings.length}`,
      });
    }
    for (let i = 0; i < obj.readings.length; i++) {
      const v = obj.readings[i];
      if (!isInt32(v)) {
        issues.push({ at: `$.readings[${i}]`, message: '读数必须是整数' });
      } else if (v < MIN_VALUE || v > MAX_VALUE) {
        issues.push({
          at: `$.readings[${i}]`,
          message: `读数必须在 ${MIN_VALUE} 至 ${MAX_VALUE} 之间，实际为 ${v}`,
        });
      } else {
        readings.push(v);
      }
    }
  }

  // ---- queries ----
  const queries: Query[] = [];
  if (!Array.isArray(obj.queries)) {
    issues.push({ at: '$.queries', message: 'queries 必须是数组' });
  } else {
    if (obj.queries.length > MAX_QUERIES) {
      issues.push({
        at: '$.queries',
        message: `queries 数量不得超过 ${MAX_QUERIES}，实际为 ${obj.queries.length}`,
      });
    }
    const n = Array.isArray(obj.readings) ? obj.readings.length : 0;
    for (let i = 0; i < obj.queries.length; i++) {
      const at = `$.queries[${i}]`;
      const q = obj.queries[i];
      if (typeof q !== 'object' || q === null || Array.isArray(q)) {
        issues.push({ at, message: '查询必须是对象' });
        continue;
      }
      const qo = q as Record<string, unknown>;
      for (const key of Object.keys(qo)) {
        if (key !== 'start' && key !== 'end' && key !== 'k') {
          issues.push({ at: `${at}.${key}`, message: '查询对象存在多余字段，只允许 start、end、k' });
        }
      }

      const startOk = isInt32(qo.start);
      const endOk = isInt32(qo.end);
      const kOk = isInt32(qo.k);

      if (!startOk) issues.push({ at: `${at}.start`, message: 'start 必须是整数' });
      if (!endOk) issues.push({ at: `${at}.end`, message: 'end 必须是整数' });
      if (!kOk) issues.push({ at: `${at}.k`, message: 'k 必须是整数' });

      if (startOk && (qo.start as number) < 0) {
        issues.push({ at: `${at}.start`, message: `start 必须满足 0 ≤ start，实际为 ${qo.start}` });
      }
      if (endOk && (qo.end as number) > n) {
        issues.push({ at: `${at}.end`, message: `end 必须满足 end ≤ ${n}，实际为 ${qo.end}` });
      }
      if (startOk && endOk && !((qo.start as number) < (qo.end as number))) {
        issues.push({
          at,
          message: `必须满足 start < end（半开区间），实际 start=${qo.start}, end=${qo.end}`,
        });
      }
      if (kOk && (qo.k as number) < 1) {
        issues.push({ at: `${at}.k`, message: `k 必须 ≥ 1，实际为 ${qo.k}` });
      }
      if (
        startOk &&
        endOk &&
        kOk &&
        (qo.start as number) < (qo.end as number) &&
        (qo.start as number) >= 0 &&
        (qo.end as number) <= n &&
        (qo.k as number) > (qo.end as number) - (qo.start as number)
      ) {
        issues.push({
          at: `${at}.k`,
          message: `k 必须 ≤ end-start（=${(qo.end as number) - (qo.start as number)}），实际为 ${qo.k}`,
        });
      }

      if (
        startOk &&
        endOk &&
        kOk &&
        (qo.start as number) >= 0 &&
        (qo.start as number) < (qo.end as number) &&
        (qo.end as number) <= n &&
        (qo.k as number) >= 1 &&
        (qo.k as number) <= (qo.end as number) - (qo.start as number)
      ) {
        queries.push({
          start: qo.start as number,
          end: qo.end as number,
          k: qo.k as number,
        });
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, file: { readings, queries }, issues };
}

/** 解析 JSON 文本并校验；JSON 语法错误同样拒绝整个文件。 */
export function parseAndValidate(text: string): {
  ok: boolean;
  file?: ScannerFile;
  issues: ValidationIssue[];
} {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      issues: [{ at: '$', message: `JSON 解析失败：${(err as Error).message}` }],
    };
  }
  return validateScannerFile(data);
}
