import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// shared/networks.js는 CJS(module.exports)이므로 Vite dev/build 모두에서 ESM 변환 필요
function sharedCjsToEsm() {
  return {
    name: 'shared-cjs-to-esm',
    transform(code, id) {
      if (id.includes('shared/networks.js') && !id.includes('node_modules')) {
        return code.replace(
          /module\.exports\s*=\s*\{([\s\S]*?)\};/,
          (_, inner) => {
            const names = inner.split(',').map(s => s.trim()).filter(Boolean);
            return `export { ${names.join(', ')} };`;
          }
        );
      }
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [react(), basicSsl(), sharedCjsToEsm()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{js,jsx,ts,tsx}'],
    setupFiles: ['./src/setupTests.js'],
  },
  server: {
    https: true,
    host: true,
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:5002',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
