import React from 'react';
import { NewsItem } from '../types';

interface NewsSectionProps {
  news: NewsItem[];
  onInterpret: (news: NewsItem) => void;
  loading?: boolean;
}

const NewsSection: React.FC<NewsSectionProps> = ({ news, onInterpret, loading }) => {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[30px] border border-slate-200 bg-white/88 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)] backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-6 py-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Market News</div>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-slate-900">全球财经实时线索</h3>
          <p className="mt-1 text-sm text-slate-500">用于盘后复盘和盘前推演，不替代原始公告与官方披露。</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500">
            Reuters / Seeking Alpha / Yahoo
          </div>
          {loading && <div className="h-4 w-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div>}
        </div>
      </div>

      <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
        {loading && news.length === 0 ? (
          <div className="space-y-4 p-6">
            {[1, 2, 3].map((item) => (
              <div key={item} className="animate-pulse rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <div className="h-3 w-28 rounded bg-slate-200"></div>
                <div className="mt-3 h-4 w-full rounded bg-slate-100"></div>
                <div className="mt-2 h-4 w-4/5 rounded bg-slate-100"></div>
              </div>
            ))}
          </div>
        ) : news.length === 0 ? (
          <div className="px-8 py-16 text-center text-sm text-slate-500">暂未抓取到最新市场消息。</div>
        ) : (
          news.slice(0, 8).map((item, index) => (
            <div key={item.id} className="group px-6 py-5 transition hover:bg-slate-50/80">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
                      {item.source}
                    </span>
                    <span className="text-[11px] text-slate-400">{item.time}</span>
                    <span className="text-[11px] text-slate-300">#{String(index + 1).padStart(2, '0')}</span>
                  </div>
                  <h4 className="text-base font-bold leading-7 text-slate-900 transition group-hover:text-blue-600">{item.title}</h4>
                </div>

                <button
                  type="button"
                  onClick={() => onInterpret(item)}
                  className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-600"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  AI 解读
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NewsSection;
