import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE_FILE=1 inlines all JS/CSS into one index.html (used for the hosted preview).
export default defineConfig({
  base: './',
  plugins: [react(), ...(process.env.SINGLE_FILE ? [viteSingleFile()] : [])],
  build: { outDir: process.env.SINGLE_FILE ? 'dist-single' : 'dist', chunkSizeWarningLimit: 2000 },
  test: { globals: true, environment: 'node' },
});
