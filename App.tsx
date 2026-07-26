import React, { useEffect, useState } from 'react';
import { getWorkspaceRoute, type WorkspaceRoute } from './app/navigation';
import AppShell from './components/shell/AppShell';
import DashboardPage from './pages/dashboard/DashboardPage';
import WorkspaceEmptyPage from './pages/system/WorkspaceEmptyPage';

const InvestorPage = React.lazy(() => import('./pages/investor/InvestorPage'));
const LedgerPage = React.lazy(() => import('./pages/ledger/LedgerPage'));
const StrategyLabPage = React.lazy(() => import('./pages/strategy/StrategyLabPage'));

const App: React.FC = () => {
  const [route, setRoute] = useState<WorkspaceRoute>(getWorkspaceRoute);

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#/dashboard');
    }

    const syncRoute = () => setRoute(getWorkspaceRoute());
    window.addEventListener('hashchange', syncRoute);
    syncRoute();
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  const renderPage = () => {
    if (route === 'dashboard') return <DashboardPage />;
    if (route === 'market') return <InvestorPage />;
    if (route === 'strategy') return <StrategyLabPage />;
    if (route === 'portfolio' || route === 'journal') return <LedgerPage />;
    if (route === 'research' || route === 'agent-runs') {
      return <WorkspaceEmptyPage route={route} />;
    }
    return <DashboardPage />;
  };

  return (
    <AppShell activeRoute={route}>
      <React.Suspense fallback={<div className="stonksup-route-loading">Loading workspace...</div>}>
        {renderPage()}
      </React.Suspense>
    </AppShell>
  );
};

export default App;