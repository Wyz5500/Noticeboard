/** Unit-test runner contract for pure domain, application, and browser modules. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: { reporter: ['text', 'html'] },
    environment: 'node',
    exclude: ['**/*.contract.spec.ts', '**/*.http.spec.ts', 'tests/e2e/**'],
    include: ['apps/**/*.spec.ts'],
    restoreMocks: true,
  },
});
