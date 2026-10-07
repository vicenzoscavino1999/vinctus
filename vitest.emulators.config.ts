import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// Feature API tests that run the web's queries and mutations against the Firebase emulators
// (Auth, Firestore, Storage and Functions) with the repo's own rules: `npm run test:emulators`.
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
  },
});
