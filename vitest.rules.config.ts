import { defineConfig } from 'vitest/config';

/** Security-rules tests. They talk to the Firestore emulator, so run them with `npm run test:rules`. */
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
