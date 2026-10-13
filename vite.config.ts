import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

const root = import.meta.dirname;

// Tauri expects a fixed dev port and no clever host guessing.
export default defineConfig({
  clearScreen: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(root, 'src/controller'),
      '@core': resolve(root, 'src/core'),
      '@app': resolve(root, 'src/app'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // Matches the WebView2 / WKWebView / WebKitGTK baselines Tauri v2 supports.
    target: 'es2022',
    sourcemap: false,
    // One local bundle for a desktop app; there is no network to split it for.
    chunkSizeWarningLimit: 1500,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        present: resolve(root, 'present.html'),
        identify: resolve(root, 'identify.html'),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
});
