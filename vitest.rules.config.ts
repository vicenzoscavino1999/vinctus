import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    fileParallelism: false,
    include: [
      'src/tests/firestore-rules/**/*.rules.cases.ts',
      'src/tests/storage-rules/**/*.rules.cases.ts',
    ],
  },
});
