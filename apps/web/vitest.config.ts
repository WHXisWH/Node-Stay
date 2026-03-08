// Vitest 設定ファイル
// jsdom 環境と React JSX の自動インジェクションを設定する

import { defineConfig } from 'vitest/config';

export default defineConfig({
  // esbuild で全 JSX ファイルに React インポートを自動注入
  esbuild: {
    jsxInject: `import React from 'react'`,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
