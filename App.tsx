
import React, { useState } from 'react';
import InvestorPage from './pages/investor/InvestorPage';
import CollaboratorPage from './pages/collaborator/CollaboratorPage';

type PageType = 'investor' | 'collaborator';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageType>('investor');

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 overflow-hidden">
      {/* Global Header with Page Switch */}
      <header className="h-14 bg-gradient-to-r from-slate-800 to-slate-900 flex items-center justify-between px-6 shrink-0 z-40 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-xl font-bold text-white tracking-tight">
              联合开发平台
            </span>
          </div>
        </div>

        {/* Page Switcher */}
        <nav className="flex items-center bg-slate-700/50 rounded-xl p-1.5 gap-1">
          <button 
            onClick={() => setCurrentPage('investor')}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${currentPage === 'investor' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-300 hover:text-white hover:bg-slate-600/50'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            AI 投资 Agent
          </button>
          <button 
            onClick={() => setCurrentPage('collaborator')}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${currentPage === 'collaborator' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20' : 'text-slate-300 hover:text-white hover:bg-slate-600/50'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            协作页面
          </button>
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {currentPage === 'investor' ? (
          <InvestorPage />
        ) : (
          <CollaboratorPage />
        )}
      </main>

      {/* Global Footer */}
      <footer className="h-8 bg-slate-800 px-6 flex items-center justify-between shrink-0 text-[10px] text-slate-400 font-medium">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
            当前页面: {currentPage === 'investor' ? 'AI 投资 Agent' : '协作页面'}
          </span>
        </div>
        <div className="flex gap-6 items-center">
          <span>使用顶部按钮切换页面</span>
          <span className="text-slate-600">|</span>
          <span>{new Date().toLocaleTimeString('zh-CN', {hour12: false})}</span>
        </div>
      </footer>
    </div>
  );
};

export default App;

