import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootNodeModules = path.resolve(__dirname, '..', 'node_modules');

export default defineConfig({
  plugins: [react(), basicSsl()],
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
