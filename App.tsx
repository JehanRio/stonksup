import React, { useState } from 'react';
import InvestorPage from './pages/investor/InvestorPage';
import CollaboratorPage from './pages/collaborator/CollaboratorPage';

type PageType = 'investor' | 'collaborator';

const getPageFromHash = (): PageType => {
  const hash = window.location.hash || '#/investor/summary';
  return hash.startsWith('#/collaborator') ? 'collaborator' : 'investor';
};

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageType>(getPageFromHash);

  React.useEffect(() => {
    const syncPageWithHash = () => setCurrentPage(getPageFromHash());
    window.addEventListener('hashchange', syncPageWithHash);
    syncPageWithHash();
    return () => window.removeEventListener('hashchange', syncPageWithHash);
  }, []);

  if (currentPage === 'investor') {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-[#05070a] text-white">
        <header className="shrink-0 border-b border-white/10 bg-[#0a0d11]">
          <div className="flex h-14 items-center justify-between px-5">
            <div className="flex items-center gap-4">
              <div className="text-2xl font-semibold tracking-tight">Trading Desk</div>
              <div className="hidden text-sm text-white/35 md:block">Market summary · Detail page · Full chart · 交易日记</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  window.location.hash = '#/investor/summary';
                }}
                className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-[#05070a]"
              >
                投资终端
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.hash = '#/collaborator';
                }}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-white/70 transition hover:bg-white/10"
              >
                协作页面
              </button>
            </div>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">
          <InvestorPage />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.08),_transparent_30%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] text-slate-900">
      <header className="shrink-0 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1680px] items-center justify-between px-6">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Workspace</div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">协作页面</h1>
          </div>
          <button
            type="button"
            onClick={() => {
              window.location.hash = '#/investor/summary';
            }}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm"
          >
            返回投资终端
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        <CollaboratorPage />
      </main>
    </div>
  );
};

export default App;
