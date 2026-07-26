import React, { useEffect, useMemo, useState } from 'react';
import { Bell, ChevronRight, Command, Plus, Search, Settings2 } from 'lucide-react';
import {
  navigateTo,
  workspaceNavItems,
  type WorkspaceRoute,
} from '../../app/navigation';

type AppShellProps = {
  activeRoute: WorkspaceRoute;
  children: React.ReactNode;
};

const routeContext: Record<WorkspaceRoute, { title: string; eyebrow: string }> = {
  dashboard: { title: 'Decision Dashboard', eyebrow: 'Today / portfolio command' },
  market: { title: 'Market Terminal', eyebrow: 'Prices / charts / watchlist' },
  research: { title: 'Research Workspace', eyebrow: 'Evidence / thesis / counter case' },
  strategy: { title: 'Strategy Lab', eyebrow: 'Rules / backtest / comparison' },
  portfolio: { title: 'Portfolio & Risk', eyebrow: 'Positions / exposure / guardrails' },
  journal: { title: 'Trade Journal', eyebrow: 'Plan / execution / review' },
  'agent-runs': { title: 'Agent Runs', eyebrow: 'Trace / tools / checkpoints' },
};

const getNewYorkClock = () =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());

const AppShell: React.FC<AppShellProps> = ({ activeRoute, children }) => {
  const [searchValue, setSearchValue] = useState('');
  const [newYorkClock, setNewYorkClock] = useState(getNewYorkClock);
  const context = routeContext[activeRoute];

  useEffect(() => {
    const timer = window.setInterval(() => setNewYorkClock(getNewYorkClock()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const activeItem = useMemo(
    () => workspaceNavItems.find((item) => item.id === activeRoute),
    [activeRoute]
  );

  const openSymbol = () => {
    const symbol = searchValue.trim().toUpperCase();
    if (!symbol) return;
    setSearchValue('');
    navigateTo(`#/investor/stock/${encodeURIComponent(symbol)}?tf=INTRADAY`);
  };

  return (
    <div className="stonksup-shell">
      <header className="stonksup-topbar">
        <button
          type="button"
          className="stonksup-brand"
          onClick={() => navigateTo('#/dashboard')}
          aria-label="打开决策总览"
        >
          <span className="stonksup-brand-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span className="stonksup-brand-copy">
            <strong>StonksUp</strong>
            <small>research os / 0.1</small>
          </span>
        </button>

        <div className="stonksup-commandbar">
          <form
            className="stonksup-symbol-search"
            onSubmit={(event) => {
              event.preventDefault();
              openSymbol();
            }}
          >
            <button type="submit" className="stonksup-search-submit" aria-label="打开标的">
              <Search size={16} aria-hidden="true" />
            </button>
            <input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search symbol, report or run"
              aria-label="搜索股票代码"
            />
            <span className="stonksup-key">
              <Command size={11} />
              K
            </span>
          </form>

          <div className="stonksup-top-actions">
            <span className="stonksup-market-clock">
              <i />
              NY {newYorkClock}
            </span>
            <button
              type="button"
              className="stonksup-icon-button"
              title="通知"
              aria-label="通知"
            >
              <Bell size={17} />
            </button>
            <button
              type="button"
              className="stonksup-primary-button"
              onClick={() => navigateTo('#/research/new')}
            >
              <Plus size={15} />
              New research
            </button>
          </div>
        </div>

        <div className="stonksup-context">
          <span>
            <small>{context.eyebrow}</small>
            <strong>{context.title}</strong>
          </span>
          <ChevronRight size={16} aria-hidden="true" />
        </div>
      </header>

      <aside className="stonksup-sidebar">
        <div className="stonksup-nav-label">Workspace</div>
        <nav aria-label="主导航">
          {workspaceNavItems.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeRoute;
            return (
              <button
                key={item.id}
                type="button"
                className={`stonksup-nav-item${active ? ' is-active' : ''}`}
                onClick={() => navigateTo(item.hash)}
                aria-current={active ? 'page' : undefined}
                title={`${item.label} · ${item.caption}`}
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.caption}</small>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="stonksup-sidebar-spacer" />
        <div className="stonksup-runtime">
          <span className="stonksup-runtime-dot" />
          <span>
            <strong>Runtime ready</strong>
            <small>frontend baseline</small>
          </span>
        </div>
        <button type="button" className="stonksup-user">
          <span className="stonksup-avatar">H</span>
          <span>
            <strong>Henry</strong>
            <small>Personal workspace</small>
          </span>
          <Settings2 size={15} />
        </button>
      </aside>

      <main className="stonksup-content" data-route={activeItem?.id}>
        {children}
      </main>

      <footer className="stonksup-statusbar">
        <span>DATA · DELAYED</span>
        <span>Research and paper-trading only</span>
        <span>Asia/Shanghai</span>
      </footer>
    </div>
  );
};

export default AppShell;
