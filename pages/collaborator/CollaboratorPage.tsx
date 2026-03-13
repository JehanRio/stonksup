
import React, { useState } from 'react';

export const CollaboratorPage: React.FC = () => {
  const [count, setCount] = useState(0);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gradient-to-br from-purple-50 to-pink-50">
      <div className="h-12 bg-white border-b border-purple-200 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-tr from-purple-600 to-pink-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-700 to-pink-700">
            协作页面
          </span>
        </div>
        <span className="text-xs text-purple-500 font-medium">v1.0</span>
      </div>

      <main className="flex-1 flex items-center justify-center overflow-y-auto">
        <div className="max-w-lg w-full mx-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="w-20 h-20 bg-gradient-to-tr from-purple-100 to-pink-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            
            <h1 className="text-2xl font-bold text-gray-800 mb-2">你好，开发者！</h1>
            <p className="text-gray-600 mb-8">这是您的协作页面模板，可以自由发挥创意。</p>

            <div className="bg-gray-50 rounded-xl p-6 mb-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">示例组件</h2>
              <div className="flex items-center justify-center gap-4">
                <button 
                  onClick={() => setCount(c => c - 1)}
                  className="w-12 h-12 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xl font-bold transition-colors"
                >
                  -
                </button>
                <span className="text-4xl font-bold text-purple-600 w-20 text-center">{count}</span>
                <button 
                  onClick={() => setCount(c => c + 1)}
                  className="w-12 h-12 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xl font-bold transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            <div className="space-y-3 text-left">
              <h3 className="text-sm font-semibold text-gray-700">开发建议：</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• 编辑 `pages/collaborator/CollaboratorPage.tsx` 来自定义内容</li>
                <li>• 在 `pages/collaborator/` 目录下添加您的组件</li>
                <li>• 使用顶部的按钮在两个页面间切换</li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      <div className="h-8 bg-white border-t border-purple-200 px-4 flex items-center justify-between shrink-0 text-[9px] text-purple-400 font-medium">
        <span>协作者页面</span>
        <span>{new Date().toLocaleTimeString('zh-CN', {hour12: false})}</span>
      </div>
    </div>
  );
};

export default CollaboratorPage;

