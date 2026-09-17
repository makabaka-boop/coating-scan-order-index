import { useCallback, useMemo, useRef, useState } from 'react';
import { parseAndValidate } from './lib/validation';
import { solveFile } from './lib/solve';
import type { QueryAnswer, ValidationIssue } from './lib/types';

type LoadedState =
  | { kind: 'busy'; fileName: string }
  | {
      kind: 'done';
      fileName: string;
      readingCount: number;
      queryCount: number;
      elapsedMs: number;
      answers: QueryAnswer[];
    }
  | { kind: 'error'; fileName: string; issues: ValidationIssue[] }
  | null;

const ROW_HEIGHT = 34;

/** 十万行结果使用绝对定位的虚拟滚动，仅渲染可视区约 20 行。 */
function VirtualResultTable({ answers }: { answers: QueryAnswer[] }) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(520);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const onScroll = useCallback(() => {
    if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
  }, []);

  const onRef = useCallback((el: HTMLDivElement | null) => {
    scrollRef.current = el;
    if (el) setViewportH(el.clientHeight);
  }, []);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 4);
  const end = Math.min(answers.length, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + 4);
  const rows = [];
  for (let i = start; i < end; i++) {
    const a = answers[i];
    rows.push(
      <div
        className="list-row"
        key={a.queryIndex}
        style={{ top: a.queryIndex * ROW_HEIGHT, height: ROW_HEIGHT }}
      >
        <span className="col-idx">#{a.queryIndex}</span>
        <span className="col-range">
          [{a.start}, {a.end})
        </span>
        <span className="col-k">k={a.k}</span>
        <span className="col-value">{a.value}</span>
      </div>,
    );
  }

  return (
    <div>
      <div className="list-header">
        <span>查询下标</span>
        <span>半开区间</span>
        <span>k</span>
        <span>第 k 小读数</span>
      </div>
      <div className="virtual-scroll" ref={onRef} onScroll={onScroll}>
        <div className="virtual-inner" style={{ height: answers.length * ROW_HEIGHT }}>
          {rows}
        </div>
      </div>
    </div>
  );
}

export function App() {
  const [state, setState] = useState<LoadedState>(null);

  const loadFile = useCallback(async (file: File) => {
    // 先进入 busy，并立即清除上一份结果（换卷不留旧答案）。
    setState({ kind: 'busy', fileName: file.name });
    // 让 loading 状态先绘制，再执行重计算，避免长时间阻塞时界面无反馈。
    await new Promise((r) => setTimeout(r, 0));
    const text = await file.text();
    const result = parseAndValidate(text);
    if (!result.ok || !result.file) {
      // 任一非法查询：整体拒绝，不保留任何部分答案。
      setState({ kind: 'error', fileName: file.name, issues: result.issues });
      return;
    }
    const t0 = performance.now();
    const answers = solveFile(result.file);
    const elapsedMs = performance.now() - t0;
    // 原子式一次性替换结果。
    setState({
      kind: 'done',
      fileName: file.name,
      readingCount: result.file.readings.length,
      queryCount: result.file.queries.length,
      elapsedMs,
      answers,
    });
  }, []);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void loadFile(file);
      e.target.value = '';
    },
    [loadFile],
  );

  const loadSample = useCallback(async () => {
    const resp = await fetch('/sample-data.json');
    const blob = new File([await resp.blob()], 'sample-data.json', { type: 'application/json' });
    await loadFile(blob);
  }, [loadFile]);

  const visibleIssues = useMemo(
    () => (state?.kind === 'error' ? state.issues.slice(0, 500) : []),
    [state],
  );

  return (
    <div className="app">
      <h1>涂层线扫窗口第 k 小复核台</h1>
      <p className="subtitle">
        本地 JSON（readings 整数数组 0..65535，长度 ≤ 200000；queries 含 start/end/k，半开区间，数量 ≤
        100000）。全程离线计算，不上传任何数据。
      </p>

      <div className="panel">
        <div className="file-row">
          <input
            type="file"
            accept="application/json,.json"
            onChange={onInputChange}
          />
          <button className="secondary" type="button" onClick={loadSample}>
            载入示例
          </button>
        </div>

        {state?.kind === 'busy' && (
          <div className="status busy">正在解析并计算 {state.fileName} …</div>
        )}

        {state?.kind === 'done' && (
          <>
            <div className="meta">
              <span>
                文件：<b>{state.fileName}</b>
              </span>
              <span>
                读数条数：<b>{state.readingCount}</b>
              </span>
              <span>
                查询条数：<b>{state.queryCount}</b>
              </span>
              <span>
                构建 + 全部查询耗时：<b>{state.elapsedMs.toFixed(1)} ms</b>
              </span>
            </div>
            <div className="status ok">载入成功：下列结果严格按原查询顺序排列。</div>
          </>
        )}

        {state?.kind === 'error' && (
          <>
            <div className="status err">
              文件 {state.fileName} 校验失败，已整体拒绝并清除旧结果，未产生任何部分答案。
            </div>
            <div className="issues">
              <div className="issue-head">错误明细（按下标定位，最多展示前 500 条）</div>
              {visibleIssues.map((iss, i) => (
                <div className="issue" key={i}>
                  <span className="path">{iss.at}</span>：{iss.message}
                </div>
              ))}
              {state.issues.length > visibleIssues.length && (
                <div className="issue">… 其余 {state.issues.length - visibleIssues.length} 条错误已省略</div>
              )}
            </div>
          </>
        )}
      </div>

      {state?.kind === 'done' &&
        (state.answers.length === 0 ? (
          <div className="panel empty-hint">该文件没有查询（queries 为空），载入成功，无结果需要展示。</div>
        ) : (
          <div className="panel">
            <p className="section-title">复核结果（{state.answers.length} 条，按原查询顺序）</p>
            <VirtualResultTable answers={state.answers} />
          </div>
        ))}
    </div>
  );
}
