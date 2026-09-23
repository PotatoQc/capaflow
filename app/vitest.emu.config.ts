import { defineConfig } from 'vitest/config';

// Tests contre l'émulateur Firebase : `npm run test:emu` (PLAN §13, A1.1–A1.3).
export default defineConfig({
  test: {
    include: ['src/**/*.emu.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
