import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootNodeModules = path.resolve(__dirname, '..', 'node_modules');

// @base-org/account는 AppKit 내부에서 Coinbase Smart Account용으로
// 동적 import하는 optional 의존성. 실제로 사용하지 않으므로 빈 모듈로 대체.
function stubBaseOrgAccount() {
  const id = '@base-org/account';
  return {
    name: 'stub-base-org-account',
    resolveId(source) {
      if (source === id) return id;
    },
    load(loadedId) {
      if (loadedId === id) return 'export {};';
    },
  };
}

export default defineConfig({
  plugins: [stubBaseOrgAccount(), react(), basicSsl()],
  envDir: path.resolve(__dirname, '..'),
  server: {
    host: '0.0.0.0',
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    root: './client',
    setupFiles: './src/setupTests.js',
    include: ['src/**/*.test.{js,jsx}'],
    server: {
      deps: {
        inline: [/@testing-library/],
      },
    },
    alias: [
      { find: /^react$/, replacement: path.resolve(rootNodeModules, 'react') },
      { find: /^react-dom/, replacement: path.resolve(rootNodeModules, 'react-dom') },
    ],
  },
});
