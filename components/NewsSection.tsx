
import React from 'react';
import { NewsItem } from '../types';

interface NewsSectionProps {
  news: NewsItem[];
  onInterpret: (news: NewsItem) => void;
  loading?: boolean;
}

const NewsSection: React.FC<NewsSectionProps> = ({ news, onInterpret, loading }) => {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mt-6">
      <div className="p-4 bg-slate-50/50 border-b border-slate-200 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-pulse"></span>
          <h3 className="font-bold text-slate-800 text-sm">全球财经实时头条</h3>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-slate-400 font-medium">聚合 Seeking Alpha, Fox Business, Reuters</span>
          {loading && <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>}
        </div>
      </div>
      
      <div className="divide-y divide-slate-100">
        {loading && news.length === 0 ? (
          <div className="p-8 space-y-4">
            {[1,2,3].map(i => (
              <div key={i} className="animate-pulse space-y-2">
                <div className="h-3 w-24 bg-slate-100 rounded"></div>
                <div className="h-4 w-full bg-slate-50 rounded"></div>
              </div>
            ))}
          </div>
        ) : news.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs italic">
            暂未抓取到最新市场消息
          </div>
        ) : (
          news.slice(0, 8).map((item) => (
            <div key={item.id} className="p-5 hover:bg-blue-50/30 transition-all group relative">
              <div className="flex justify-between items-start gap-6">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[9px] font-black px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-md uppercase tracking-tight">
                      {item.source}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">{item.time}</span>
                  </div>
                  <h4 className="font-bold text-slate-900 leading-snug text-sm group-hover:text-blue-600 transition-colors line-clamp-2">
                    {item.title}
                  </h4>
                </div>
                <button
                  onClick={() => onInterpret(item)}
                  className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-blue-600 text-xs font-bold rounded-xl hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all shadow-sm active:scale-95"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  AI 解读
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      
      <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
        <button className="text-[10px] font-bold text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-widest">
          查看更多全球动态
        </button>
      </div>
    </div>
  );
};

export default NewsSection;
