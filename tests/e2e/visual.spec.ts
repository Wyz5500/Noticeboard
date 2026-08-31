/** Compares the Swiss International baseline theme and its major overlay states against frozen screenshots. */
import { expect, test, type Page } from '@playwright/test';

const THEME_IDS = ['swiss-international'] as const;

/** Waits for the modal's real CSS transition to finish before taking a stable screenshot. */
async function waitForModalTransition(page: Page): Promise<void> {
  await page
    .locator('#taskModal, #modalBackdrop')
    .evaluateAll(async (elements) => {
      await Promise.all(
        elements.flatMap((element) =>
          element.getAnimations().map((animation) => animation.finished),
        ),
      );
    });
}

/** Stabilizes seeded management records while preserving visible list layout for visual baselines. */
async function stabilizeDynamicAdminRecords(
  page: Page,
  isMobile: boolean,
): Promise<void> {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#adminView h1')).toBeVisible();
  await expect(page.locator('.admin-sort-bar')).toBeVisible();
  await page.locator('.admin-updated-at').evaluateAll((elements) => {
    elements.forEach((element) => {
      element.textContent = '修改时间：2026-08-31 00:00';
    });
  });
  await page.locator('#adminView').evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      node.textContent =
        node.textContent?.replace(
          /网页测试角色-\d+/g,
          '网页测试角色-0000000000000',
        ) ?? '';
      node = walker.nextNode();
    }
  });

  if (isMobile) {
    await expect(page.locator('.admin-mobile-list:visible')).toBeVisible();
    await expect(
      page.locator('.admin-mobile-card:visible').first(),
    ).toBeVisible();
    await expect(
      page
        .locator('.admin-mobile-card:visible')
        .first()
        .locator('[data-admin-open], [data-admin-action]'),
    ).toHaveCount(2);
    return;
  }

  await expect(page.locator('.admin-table:visible')).toBeVisible();
  await expect(
    page.locator('.admin-table:visible thead th').first(),
  ).toBeVisible();
  await expect(
    page.locator('.admin-table:visible tbody tr').first(),
  ).toBeVisible();
  await expect(
    page
      .locator('.admin-table:visible tbody tr')
      .first()
      .locator('[data-admin-open], [data-admin-action]'),
  ).toHaveCount(2);
}

/** Restores deterministic server or legacy local state before each visual scenario. */
test.beforeEach(async ({ page, request }) => {
  const health = await request.get('/health/live');
  if (health.ok()) {
    await request.post('/api/v1/demo/reset', {
      headers: { 'X-Demo-User-Id': 'noticeboard-admin' },
    });
  }
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#styleSelect option')).toHaveCount(10);
});

for (const themeId of THEME_IDS) {
  /** Captures the five stable page and overlay states for one visual theme. */
  test(`${themeId} major states @visual`, async ({ page, isMobile }) => {
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
    await expect(page.locator('.task-card')).toHaveCount(12);
    await expect(page).toHaveScreenshot(`${themeId}-tasks.png`, {
      fullPage: false,
    });

    await page.locator('.task-card').first().click();
    await expect(page).toHaveScreenshot(`${themeId}-drawer.png`, {
      fullPage: false,
    });
    await page.locator('[data-close-drawer]').click();

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('#newTaskButton').click();
    await waitForModalTransition(page);
    await expect(page).toHaveScreenshot(`${themeId}-modal.png`, {
      fullPage: false,
    });

    await page.locator('#closeModalButton').click();
    await page.locator('#profileButton').click();
    await page.locator('#identitySelect').selectOption('noticeboard-admin');
    await page.keyboard.press('Escape');
    await page.goto('/#admin');
    await expect(page.locator('#adminView')).toBeVisible();
    await page
      .locator('.admin-grid')
      .evaluateAll((grids) => grids.forEach((grid) => grid.replaceChildren()));
    await expect(page.locator('#adminView')).toHaveScreenshot(
      `${themeId}-admin.png`,
    );

    await page.getByRole('link', { name: '用户管理' }).click();
    await expect(page).toHaveURL(
      /#admin\/users\?sort=updatedAt&direction=desc/,
    );
    await stabilizeDynamicAdminRecords(page, isMobile);
    await expect(page.locator('#adminView')).toHaveScreenshot(
      `${themeId}-admin-users.png`,
    );

    await page.getByRole('link', { name: '返回管理首页' }).click();
    await page.getByRole('link', { name: '角色管理' }).click();
    await expect(page).toHaveURL(
      /#admin\/roles\?sort=updatedAt&direction=desc/,
    );
    await stabilizeDynamicAdminRecords(page, isMobile);
    await expect(page.locator('#adminView')).toHaveScreenshot(
      `${themeId}-admin-roles.png`,
    );
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
    fullPage: false,
  });

  if (!isMobile) {
    await page.locator('.task-card').first().hover();
    await expect(page).toHaveScreenshot('edge-hover.png', { fullPage: false });
  }

  await page.locator('#searchInput').focus();
  await expect(page).toHaveScreenshot('edge-focus.png', { fullPage: false });

  await page.locator('#searchInput').fill('绝对不存在的任务');
  await expect(page).toHaveScreenshot('edge-empty.png', { fullPage: false });
});
