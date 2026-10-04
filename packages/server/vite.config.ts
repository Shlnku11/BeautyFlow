import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  resolve: { alias: [
    { find: '@/server', replacement: resolve(import.meta.dirname, 'src') },
    { find: '@/shared', replacement: resolve(import.meta.dirname, '../shared/src') },
    { find: '@', replacement: resolve(import.meta.dirname, 'src') },
  ] },
  build: { ssr: 'src/index.ts', outDir: '../../dist/server', emptyOutDir: true, rollupOptions: { output: { format: 'es' } } },
});
