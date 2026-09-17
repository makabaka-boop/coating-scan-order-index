# 涂层线扫窗口第 k 小复核台

涂层线扫仪一次产生最多 **200,000** 条强度读数（0..65535），质检员同时复核最多
**100,000** 个局部窗口的第 k 小值。逐窗口复制排序是 O(q·w log w)，十万个窗口会让
浏览器在换卷前算不完；本项目用 **Wavelet Matrix（小波矩阵）** 一次构建、按查询顺序
精确回答，纯前端实现，不调用任何业务后端或在线服务。

## 性能

| 项目 | 复杂度 | 满规模实测 |
| --- | --- | --- |
| 构建 | O(16·n) | 合计约 170ms |
| 全部 100,000 查询 | O(16·q) | （同一计时内，远低于 4 秒预算） |
| 内存 | 16 × (n+1) × 4 字节 | ≈ 12.8MB |

结果为精确值（不是近似/采样）。实现见 `src/lib/waveletMatrix.ts`。

## 数据文件格式

只接受一个 JSON 对象，且**只允许**两个顶层字段：

```json
{
  "readings": [0, 65535, 2048],
  "queries": [{ "start": 0, "end": 10, "k": 3 }]
}
```

约束（任何不符都**拒绝整个文件**、按数组下标列出全部错误、清除旧结果，不留部分答案）：

- `readings`：长度 1..200000；每项必须是整数且 0 ≤ v ≤ 65535。
- `queries`：长度 0..100000；每项只允许 `start` / `end` / `k`：
  - `0 ≤ start < end ≤ readings.length`（半开区间 `[start, end)`）
  - `1 ≤ k ≤ end - start`
- JSON 语法错误、顶层结构错误、多余字段同样整体拒绝。

载入成功后，结果**严格按原查询顺序**展示，并显示查询下标、区间、k 与精确读数；
十万行结果用虚拟滚动渲染，首尾相邻窗口（单格平移）逐项核对不偏移。

## 本地开发

```bash
npm ci
npm run dev        # 本地开发
npm test           # Vitest 一次性运行
npm run build      # 类型检查 + 产物到 dist/
npm run preview    # 预览生产构建
```

## 测试（Vitest）

- `test/waveletMatrix.test.ts`：以**直接排序为小样本预言机**，对重复值、全相等、
  单元素、2 的幂边界值、首尾窗口、k 的两端做全子区间 × 全 k 穷举，并对确定性随机
  小样本多组穷举。
- `test/validation.test.ts`：结构/边界非法输入全部拒绝，错误定位到
  `$.readings[i]` / `$.queries[i].field` 这样的数组下标路径。
- `test/fullScale.test.ts`：确定性满规模样本（种子固定）200,000 × 100,000：
  - 构建 + 全部查询 **< 4000ms**；
  - 结果 **FNV 摘要锁定**（`GOLDEN_DIGEST`）防止静默漂移；
  - 抽样 300 条与排序预言机交叉核对；
  - 首尾单格相邻窗口答案必须等于对应位置读数。

## Docker Compose 发布

```bash
docker compose up -d --build                    # 默认宿主端口 8080
WEB_PORT=9000 docker compose up -d --build      # 覆盖宿主端口
curl http://localhost:8080/

# 一次性验收服务：运行 Vitest 全套，退出码即结论
docker compose build verify
docker compose run --rm verify
```

- `web`：多阶段构建，nginx 托管 `dist/` 纯静态页面。
- `verify`：一次性容器，跑完测试即退出，不监听端口、不依赖业务后端。
