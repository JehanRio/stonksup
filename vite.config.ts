import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const deepSeekBaseUrl = env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
    const deepSeekModel = env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      base: '/stonksup/',  // GitHub Pages 基础路径
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.DEEPSEEK_API_KEY': JSON.stringify(env.DEEPSEEK_API_KEY),
        'process.env.DEEPSEEK_BASE_URL': JSON.stringify(deepSeekBaseUrl),
        'process.env.DEEPSEEK_MODEL': JSON.stringify(deepSeekModel)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
