/** Pins browser behavior and visual checks to deterministic Chromium projects and server settings. */
/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test';

const externalBaseUrl = process.env.E2E_BASE_URL?.trim() || undefined;
const standaloneAppUrl = 'http://127.0.0.1:3100';
const databaseUrl =
  process.env.DATABASE_URL_TEST?.trim() ||
  'postgresql://noticeboard:noticeboard@127.0.0.1:54329/noticeboard';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    toHaveScreenshot: { animations: 'disabled', maxDiffPixels: 0 },
  },
  use: {
    baseURL: externalBaseUrl ?? standaloneAppUrl,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
  },
  ...(externalBaseUrl
    ? {}
    : {
        webServer: {
          command: 'npm run build && npm start',
          env: {
            DATABASE_URL: databaseUrl,
            HOST: '127.0.0.1',
            PORT: '3100',
          },
          url: `${standaloneAppUrl}/health/ready`,
          reuseExistingServer: false,
          timeout: 60_000,
        },
      }),
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } },
    },
  ],
});
