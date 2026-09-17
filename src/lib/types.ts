/** 单个局部窗口查询，半开区间 [start, end)，k 从 1 开始。 */
export interface Query {
  start: number;
  end: number;
  k: number;
}

/** 文件中允许的唯一顶层结构：readings 整数数组 + queries 查询数组。 */
export interface ScannerFile {
  readings: number[];
  queries: Query[];
}

/** 单个查询的答案，queryIndex 保留该查询在原文件中的下标。 */
export interface QueryAnswer {
  queryIndex: number;
  start: number;
  end: number;
  k: number;
  value: number;
}

/** 结构或边界校验失败项；at 给出数组下标路径，便于按数组下标反馈。 */
export interface ValidationIssue {
  at: string;
  message: string;
}
