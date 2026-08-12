import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Database,
  Play,
  RefreshCw,
  Wrench,
} from 'lucide-react';

import {
  createAgentRun,
  getAgentCapability,
  getAgentRun,
  getAgentRuns,
  type AgentCapability,
  type AgentRunDetail,
  type AgentRunSummary,
} from '../../services/agentRunsApi';
import '../../styles/agent-runs.css';


const DEFAULT_PROMPT = '验证 MU 的策略：回踩 EMA20 并重新站稳时买入，收盘跌破 EMA5 时卖出，止损 8%。先跑单次回测，再做样本外验证，最后告诉我是否值得继续研究。';

const formatTime = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(value));

const AgentRunsPage: React.FC = () => {
  const [capability, setCapability] = useState<AgentCapability | null>(null);
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [selected, setSelected] = useState<AgentRunDetail | null>(null);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    const [nextCapability, nextRuns] = await Promise.all([
      getAgentCapability(),
      getAgentRuns(),
    ]);
    setCapability(nextCapability);
    setRuns(nextRuns);
    if (!selected && nextRuns[0]) setSelected(await getAgentRun(nextRuns[0].runId));
  };

  useEffect(() => {
    refresh().catch((reason) => setError(reason instanceof Error ? reason.message : '无法加载 Agent Runs'))
      .finally(() => setLoading(false));
  }, []);

  const totals = useMemo(() => ({
    completed: runs.filter((run) => run.status === 'completed').length,
    tools: runs.reduce((sum, run) => sum + run.toolCallCount, 0),
    models: runs.reduce((sum, run) => sum + run.modelCallCount, 0),
  }), [runs]);

  const handleRun = async () => {
    if (!prompt.trim()) return;
    setRunning(true);
    setError('');
    try {
      const run = await createAgentRun(prompt.trim());
      setSelected(run);
      setRuns(await getAgentRuns());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Agent 运行失败');
    } finally {
      setRunning(false);
    }
  };

  const openRun = async (runId: string) => {
    try {
      setSelected(await getAgentRun(runId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法打开运行记录');
    }
  };

  return (
    <main className="agent-runs-page">
      <header className="agent-runs-header">
        <div>
          <span>AGENT / EXECUTION TRACE</span>
          <h1>Quant Research Agent</h1>
          <p>由模型编排确定性金融工具，保存每一步输入、输出、耗时与失败原因。</p>
        </div>
        <div className={`agent-provider-status ${capability?.configured ? 'is-ready' : 'is-missing'}`}>
          <Bot size={19} />
          <span>
            <small>MODEL PROVIDER</small>
            <strong>{capability ? `DeepSeek · ${capability.model}` : 'Checking runtime'}</strong>
          </span>
        </div>
      </header>

      <section className="agent-run-metrics">
        <article><small>历史任务</small><strong>{runs.length}</strong><span>persisted runs</span></article>
        <article><small>成功完成</small><strong>{totals.completed}</strong><span>auditable outputs</span></article>
        <article><small>工具调用</small><strong>{totals.tools}</strong><span>deterministic tools</span></article>
        <article><small>模型调用</small><strong>{totals.models}</strong><span>provider turns</span></article>
      </section>

      <div className="agent-runs-workspace">
        <aside className="agent-run-sidebar">
          <section className="agent-run-compose">
            <div className="agent-panel-title"><Activity size={17} /><span>NEW RESEARCH RUN</span></div>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            <button type="button" onClick={() => void handleRun()} disabled={running || !capability?.configured}>
              {running ? <RefreshCw className="is-spinning" size={18} /> : <Play size={18} fill="currentColor" />}
              {running ? 'Agent 正在执行' : '启动研究 Agent'}
            </button>
            {!capability?.configured && !loading && <p className="agent-config-note">服务器尚未配置新的 DeepSeek API Key。</p>}
          </section>

          <section className="agent-run-history">
            <div className="agent-panel-title"><Database size={17} /><span>RUN HISTORY</span></div>
            {runs.map((run) => (
              <button key={run.runId} type="button" className={selected?.runId === run.runId ? 'is-active' : ''} onClick={() => void openRun(run.runId)}>
                <span><strong>{run.symbol || 'PENDING'} · {run.runId}</strong><small>{run.userPrompt}</small></span>
                <span><small>{formatTime(run.createdAt)}</small><ChevronRight size={16} /></span>
              </button>
            ))}
            {!runs.length && !loading && <p className="agent-empty-copy">第一条研究任务会出现在这里。</p>}
          </section>
        </aside>

        <section className="agent-run-output">
          {error && <div className="agent-error"><CircleAlert size={18} />{error}</div>}
          {selected ? (
            <>
              <div className="agent-output-heading">
                <span><small>RUN ID</small><strong>{selected.runId}</strong></span>
                <span className={`agent-run-status is-${selected.status}`}>{selected.status}</span>
              </div>
              <article className="agent-request-block">
                <small>USER OBJECTIVE</small>
                <p>{selected.userPrompt}</p>
              </article>
              <article className="agent-conclusion-block">
                <small>FINAL OUTPUT</small>
                <p>{selected.finalOutput || selected.errorMessage || 'Agent 正在形成结论。'}</p>
              </article>
            </>
          ) : (
            <div className="agent-no-selection"><Bot size={34} /><p>创建或选择一次 Agent Run 查看研究结论。</p></div>
          )}
        </section>

        <aside className="agent-trace-panel">
          <div className="agent-panel-title"><Wrench size={17} /><span>EXECUTION TRACE</span></div>
          {selected?.steps.map((step) => {
            const call = selected.toolCalls.find((item) => item.sequence === step.sequence);
            return (
              <details className="agent-trace-item" key={`${step.sequence}-${step.name}`} open={step.sequence === 1}>
                <summary>
                  <span>{step.status === 'completed' ? <CheckCircle2 size={17} /> : <CircleAlert size={17} />}<strong>{String(step.sequence).padStart(2, '0')} · {step.name}</strong></span>
                  <small>{call ? `${call.durationMs} ms` : step.status}</small>
                </summary>
                <p>{step.summary}</p>
                {call && <pre>{JSON.stringify({ arguments: call.arguments, result: call.result }, null, 2)}</pre>}
              </details>
            );
          })}
          {selected && (
            <section className="agent-model-ledger">
              <small>MODEL LEDGER</small>
              {selected.modelCalls.map((call) => (
                <div key={call.sequence}>
                  <span>TURN {String(call.sequence).padStart(2, '0')}</span>
                  <strong>{call.inputTokens + call.outputTokens} tokens</strong>
                  <small>{call.durationMs} ms</small>
                </div>
              ))}
            </section>
          )}
        </aside>
      </div>
    </main>
  );
};

export default AgentRunsPage;
