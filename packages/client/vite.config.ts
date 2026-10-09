import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(import.meta.dirname),
  envDir: resolve(import.meta.dirname, '../..'),
  server: { port: 5174, strictPort: true, proxy: { '/api': 'http://localhost:3000' } },
  preview: { port: 4173 },
  resolve: { alias: [
    { find: '@/shared', replacement: resolve(import.meta.dirname, '../shared/src') },
    { find: '@', replacement: resolve(import.meta.dirname, 'src') },
  ] },
  build: { outDir: '../../dist/client', emptyOutDir: true },
});
