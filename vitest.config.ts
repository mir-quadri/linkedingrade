import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  // Next.js's PostCSS config uses @tailwindcss/postcss which doesn't load
  // through Vite's plugin shape. Tests don't touch CSS, so skip processing.
  css: { postcss: { plugins: [] } },
  test: {
    include: ['lib/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
