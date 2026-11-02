import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { host: '0.0.0.0', allowedHosts: true },
  build: { rollupOptions: { input: { dashboard: 'index.html', popup: 'popup.html' } } },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
});
