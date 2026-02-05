import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    fileParallelism: false,
    include: ['src/tests/emulators/**/*.cases.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage/emulators',
      all: true,
      include: [
        'src/features/posts/api/**/*.{ts,tsx}',
        'src/features/chat/api/**/*.{ts,tsx}',
        'src/features/groups/api/**/*.{ts,tsx}',
        'src/features/notifications/api/**/*.{ts,tsx}',
        'src/features/profile/api/queries.ts',
        'src/features/profile/api/types.ts',
      ],
      exclude: ['src/**/*.d.ts', 'src/**/__mocks__/**'],
    },
  },
});
