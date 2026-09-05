/** Serializes HTTP suites sharing the verification database because integration tests reset demo data. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['apps/**/*.http.spec.ts', 'tests/**/*.http.spec.ts'],
    restoreMocks: true,
  },
});
