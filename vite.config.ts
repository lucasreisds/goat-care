import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    target: 'es2022',
    // PixiJS plus the Firebase SDK (auth + Firestore) land in one chunk of a bit over 1 MB
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // Security-rules tests need the Firestore emulator: run them with `npm run test:rules`.
    exclude: ['tests/rules/**'],
    environment: 'node',
  },
});
