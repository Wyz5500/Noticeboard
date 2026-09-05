/** HTTP-test runner contract for the Fastify presentation boundary. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['apps/**/*.http.spec.ts', 'tests/**/*.http.spec.ts'],
    restoreMocks: true,
  },
});
