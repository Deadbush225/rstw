import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
    environment: 'node',
    reporters: ['default'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
