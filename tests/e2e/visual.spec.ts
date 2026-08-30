/** Compares every preserved theme and major overlay state against the frozen prototype baseline. */
import { expect, test } from '@playwright/test';

const THEME_IDS = [
  'swiss-international',
  'neo-brutalism',
  'bauhaus',
  'y2k-cyber',
  'retro-terminal',
  'memphis',
  'editorial-magazine',
  'glassmorphism',
  'japanese-minimalism',
  'pixel-retro',
] as const;

/** Restores deterministic server or legacy local state before each visual scenario. */
test.beforeEach(async ({ page, request }) => {
  const health = await request.get('/health/live');
  if (health.ok()) {
    await request.post('/api/v1/demo/reset', {
      headers: { 'X-Demo-User-Id': 'guild-master' },
    });
  }
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#styleSelect option')).toHaveCount(10);
});

for (const themeId of THEME_IDS) {
  /** Captures the five stable page and overlay states for one visual theme. */
  test(`${themeId} major states @visual`, async ({ page }) => {
    await page.locator('#profileButton').click();
    await page.locator('#styleSelect').selectOption(themeId);
    await page.keyboard.press('Escape');
    await expect(page).toHaveScreenshot(`${themeId}-home.png`, {
      fullPage: true,
    });

    await page.locator('#profileButton').click();
    await expect(page).toHaveScreenshot(`${themeId}-profile.png`, {
      fullPage: true,
    });
    await page.keyboard.press('Escape');

    await page.getByRole('link', { name: '任务页' }).click();
    await expect(page.locator('.task-card')).toHaveCount(4);
    await expect(page).toHaveScreenshot(`${themeId}-tasks.png`, {
      fullPage: true,
    });

    await page.locator('.task-card').first().click();
    await expect(page).toHaveScreenshot(`${themeId}-drawer.png`, {
      fullPage: true,
    });
    await page.locator('[data-close-drawer]').click();

    await page.locator('#newTaskButton').click();
    await expect(page).toHaveScreenshot(`${themeId}-modal.png`, {
      fullPage: true,
    });
  });
}

/** Captures empty, long-title, hover, and keyboard-focus edge states under reduced motion. */
test('task board edge states @visual', async ({ page, isMobile }) => {
  await page.getByRole('link', { name: '任务页' }).click();
  await page
    .locator('.task-card h3')
    .first()
    .evaluate((heading) => {
      heading.textContent =
        '这是一项用于验证窄屏换行、长标题高度与卡片对齐方式的超长冒险家工会任务';
    });
  await expect(page).toHaveScreenshot('edge-long-title.png', {
    fullPage: true,
  });

  if (!isMobile) {
    await page.locator('.task-card').first().hover();
    await expect(page).toHaveScreenshot('edge-hover.png', { fullPage: true });
  }

  await page.locator('#searchInput').focus();
  await expect(page).toHaveScreenshot('edge-focus.png', { fullPage: true });

  await page.locator('#searchInput').fill('绝对不存在的任务');
  await expect(page).toHaveScreenshot('edge-empty.png', { fullPage: true });
});
