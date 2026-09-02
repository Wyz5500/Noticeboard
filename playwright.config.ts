/** Pins browser behavior and visual checks to deterministic Chromium projects and injected instances. */
/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test';

const externalBaseUrl = process.env.E2E_BASE_URL?.trim() || undefined;
const taskBusinessTimeZone =
  process.env.TASK_BUSINESS_TIME_ZONE?.trim() || 'Asia/Shanghai';

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
    baseURL: externalBaseUrl,
    locale: 'zh-CN',
    timezoneId: taskBusinessTimeZone,
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
  },
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
