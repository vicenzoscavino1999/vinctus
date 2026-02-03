import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: [
      'src/tests/firestore-rules/**/*.rules.cases.ts',
      'src/tests/storage-rules/**/*.rules.cases.ts',
    ],
  },
});
