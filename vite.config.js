import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const webRoot = fileURLToPath(new URL('./src/web', import.meta.url));
const outDir = fileURLToPath(new URL('./dist/admin', import.meta.url));

export default defineConfig({
  root: webRoot,
  // 相对基址：构建产物由 Express 挂载在随机管理路径下
  base: './',
  plugins: [vue(), tailwindcss()],
  build: {
    outDir,
    emptyOutDir: true,
    assetsDir: 'assets',
    chunkSizeWarningLimit: 900,
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
