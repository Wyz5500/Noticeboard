/** PostgreSQL contract-test runner with serialized database mutations. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['apps/**/*.contract.spec.ts'],
    restoreMocks: true,
  },
});
