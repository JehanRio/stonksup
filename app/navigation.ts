import {
  Activity,
  BookOpenText,
  ChartCandlestick,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type WorkspaceRoute =
  | 'dashboard'
  | 'market'
  | 'research'
  | 'strategy'
  | 'portfolio'
  | 'journal'
  | 'agent-runs';

export type WorkspaceNavItem = {
  id: WorkspaceRoute;
  label: string;
  caption: string;
  hash: string;
  icon: LucideIcon;
};

export const workspaceNavItems: WorkspaceNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', caption: '决策总览', hash: '#/dashboard', icon: LayoutDashboard },
  { id: 'market', label: 'Market', caption: '行情与标的', hash: '#/investor/summary', icon: ChartCandlestick },
  { id: 'research', label: 'Research', caption: '证据研究', hash: '#/research', icon: BookOpenText },
  { id: 'strategy', label: 'Strategy', caption: '策略实验室', hash: '#/strategy', icon: FlaskConical },
  { id: 'portfolio', label: 'Portfolio', caption: '资产与敞口', hash: '#/overview', icon: Gauge },
  { id: 'journal', label: 'Journal', caption: '计划与复盘', hash: '#/journal', icon: ShieldCheck },
  { id: 'agent-runs', label: 'Agent Runs', caption: '执行与审计', hash: '#/agent-runs', icon: Activity },
];

const ledgerRoutes = new Set(['overview', 'stats', 'bills', 'assets', 'report']);

export const getWorkspaceRoute = (): WorkspaceRoute => {
  const rawHash = window.location.hash || '#/dashboard';
  const [path] = rawHash.replace(/^#\//, '').split('?');
  const [segment] = path.split('/').filter(Boolean);

  if (!segment || segment === 'dashboard') return 'dashboard';
  if (segment === 'investor' || segment === 'market') return 'market';
  if (segment === 'research') return 'research';
  if (segment === 'strategy') return 'strategy';
  if (segment === 'risk' || segment === 'portfolio') return 'portfolio';
  if (segment === 'journal') return 'journal';
  if (segment === 'agent-runs' || segment === 'runs') return 'agent-runs';
  if (ledgerRoutes.has(segment)) return 'portfolio';
  return 'dashboard';
};

export const navigateTo = (hash: string) => {
  if (window.location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  window.location.hash = hash;
};
