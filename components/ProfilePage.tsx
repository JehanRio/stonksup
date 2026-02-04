
import React from 'react';

const ProfilePage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto py-12 px-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 h-32 relative">
          <div className="absolute -bottom-10 left-10">
            <div className="w-24 h-24 bg-blue-500 rounded-2xl border-4 border-white shadow-lg flex items-center justify-center text-white text-3xl font-bold">
              U
            </div>
          </div>
        </div>
        <div className="pt-14 pb-8 px-10">
          <h1 className="text-2xl font-bold text-slate-900">核心投资账户</h1>
          <p className="text-slate-500">MVP 阶段：个人偏好管理中心</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10">
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-slate-800 border-b pb-2">基础信息</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">用户昵称</label>
                  <input type="text" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" defaultValue="AlphaTrader_01" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1">绑定邮箱</label>
                  <input type="email" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" defaultValue="investor@example.com" />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-lg font-bold text-slate-800 border-b pb-2">投资偏好 (AI 分析依赖项)</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-2">风险承受能力</label>
                  <div className="flex gap-2">
                    {['保守型', '稳健型', '激进型'].map(v => (
                      <button key={v} className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all ${v === '稳健型' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-2">核心关注赛道</label>
                  <div className="flex flex-wrap gap-2">
                    {['生成式 AI', '半导体', '智能电动车', '生物科技', '清洁能源'].map(tag => (
                      <span key={tag} className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full border border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors">
                        {tag}
                      </span>
                    ))}
                    <button className="px-3 py-1 border-2 border-dashed border-slate-300 text-slate-400 text-xs font-bold rounded-full hover:border-blue-400 hover:text-blue-500 transition-all">
                      + 添加关注
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-12 pt-6 border-t border-slate-100 flex justify-end">
            <button className="px-8 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all">
              保存配置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
