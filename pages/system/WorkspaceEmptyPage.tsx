import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  FlaskConical,
  Plus,
} from 'lucide-react';
import { navigateTo, type WorkspaceRoute } from '../../app/navigation';

type EmptyRoute = Extract<WorkspaceRoute, 'research' | 'strategy' | 'agent-runs'>;

const pageConfig: Record<EmptyRoute, {
  code: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyText: string;
  action: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}> = {
  research: {
    code: 'RESEARCH / EVIDENCE',
    title: 'Research Workspace',
    description: '研究任务、证据、论点和 Agent 轨迹将在这里形成可审计的工作流。',
    emptyTitle: '尚无持久化研究任务',
    emptyText: '后端接入前，先保留明确的任务入口和状态结构。',
    action: '建立 MU 研究草稿',
    icon: BookOpenText,
  },
  strategy: {
    code: 'STRATEGY / BACKTEST',
    title: 'Strategy Lab',
    description: '确定性策略计算与 Agent 研究分离，保证回测结果可以复现。',
    emptyTitle: '尚无回测运行',
    emptyText: '第一条基线策略将在行情数据落库后启用。',
    action: '查看开发顺序',
    icon: FlaskConical,
  },
  'agent-runs': {
    code: 'RUNTIME / AUDIT',
    title: 'Agent Runs',
    description: '节点、工具调用、模型版本、延迟和失败原因统一进入审计轨迹。',
    emptyTitle: '运行时尚未连接',
    emptyText: 'FastAPI 与 Agent State 将在下一阶段接入。',
    action: '返回决策总览',
    icon: Activity,
  },
};

const WorkspaceEmptyPage: React.FC<{ route: EmptyRoute }> = ({ route }) => {
  const config = pageConfig[route];
  const Icon = config.icon;
  const [draft, setDraft] = useState<string | null>(() =>
    route === 'research' ? window.localStorage.getItem('stonksup_research_draft') : null
  );

  useEffect(() => {
    setDraft(route === 'research' ? window.localStorage.getItem('stonksup_research_draft') : null);
  }, [route]);

  const handleAction = () => {
    if (route === 'research') {
      const nextDraft = JSON.stringify({
        symbol: 'MU',
        horizon: '6-12 months',
        question: '美光财报后，现在上车是否还来得及？重点验证 HBM、存储周期与风险收益比。',
        status: 'draft',
        updatedAt: new Date().toISOString(),
      });
      window.localStorage.setItem('stonksup_research_draft', nextDraft);
      setDraft(nextDraft);
      window.dispatchEvent(new CustomEvent('stonksup:research-draft'));
      return;
    }
    navigateTo(route === 'agent-runs' ? '#/dashboard' : '#/research');
  };


  return (
    <div className="workspace-empty-page">
      <header>
        <span>{config.code}</span>
        <h1>{config.title}</h1>
        <p>{config.description}</p>
      </header>

      <section className="workspace-ledger">
        <div className="workspace-ledger-head">
          <span>Name</span>
          <span>Status</span>
          <span>Updated</span>
          <span>Owner</span>
        </div>
        {draft && route === 'research' ? (
          <button type="button" className="workspace-ledger-row">
            <span>
              <strong>MU · Earnings follow-through</strong>
              <small>6-12 month horizon</small>
            </span>
            <span className="draft-status">DRAFT</span>
            <span>just now</span>
            <span>Henry</span>
          </button>
        ) : (
          <div className="workspace-empty-state">
            <span className="workspace-empty-icon"><Icon size={24} strokeWidth={1.5} /></span>
            <h2>{config.emptyTitle}</h2>
            <p>{config.emptyText}</p>
            <button type="button" onClick={handleAction}>
              {route === 'research' ? <Plus size={15} /> : <ArrowRight size={15} />}
              {config.action}
            </button>
          </div>
        )}
      </section>

      <footer className="workspace-phase-strip">
        <span><CheckCircle2 size={15} /> App shell</span>
        <span><CheckCircle2 size={15} /> Stable routes</span>
        <span className="is-next"><Activity size={15} /> Backend foundation next</span>
      </footer>
    </div>
  );
};

export default WorkspaceEmptyPage;
