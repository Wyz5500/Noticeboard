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
  section: 'users' | 'roles',
): Promise<void> {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#adminView h1')).toBeVisible();
  await expect(page.locator('.admin-sort-bar')).toBeVisible();
  const keepCount = section === 'users' ? 4 : 2;
  const records = page.locator(
    isMobile ? '.admin-mobile-card:visible' : '.admin-table:visible tbody tr',
  );
  const recordCount = await records.count();
  expect(recordCount).toBeGreaterThanOrEqual(keepCount);
  for (let index = recordCount - 1; index >= keepCount; index -= 1)
    await records.nth(index).evaluate((record) => record.remove());
  await expect(records).toHaveCount(keepCount);

  if (isMobile) {
    await expect(page.locator('.admin-mobile-list:visible')).toBeVisible();
    await records.evaluateAll((cards, kind) => {
      cards.forEach((card, index) => {
        card.querySelector('strong')!.textContent =
          kind === 'users' ? `用户 ${index + 1}` : `角色 ${index + 1}`;
        card.querySelector('.admin-meta')!.textContent =
          kind === 'users' ? '角色：用户' : `代码：role-${index + 1}`;
        card.querySelector('.admin-updated-at')!.textContent =
          '修改时间：2026-08-31 00:00';
        if (kind === 'roles') {
          // Role baselines model seeded built-in roles, which have no lifecycle actions.
          card
            .querySelectorAll('[data-admin-action]')
            .forEach((action) => action.remove());
        }
      });
    }, section);
    await expect(records.first()).toBeVisible();
    const editSelector = `[data-admin-open="${section === 'users' ? 'user' : 'role'}"]`;
    const editCounts = await records.evaluateAll(
      (cards, selector) =>
        cards.map((card) => card.querySelectorAll(selector).length),
      editSelector,
    );
    expect(editCounts).toEqual(Array.from({ length: keepCount }, () => 1));
    const lifecycle = records.locator('[data-admin-action]');
    if (section === 'roles') {
      await expect(lifecycle).toHaveCount(0);
    } else if ((await lifecycle.count()) > 0) {
      const labels = await lifecycle.allTextContents();
      expect(labels.every((label) => /^(逻辑删除|恢复)$/.test(label))).toBe(
        true,
      );
    }
    return;
  }

  await expect(page.locator('.admin-table:visible')).toBeVisible();
  const table = page.locator('.admin-table:visible');
  await expect(table.locator('thead th').first()).toBeVisible();
  await expect(table.locator('thead th')).toHaveCount(
    section === 'users' ? 5 : 6,
  );
  await records.evaluateAll((rows, kind) => {
    rows.forEach((row, index) => {
      const cells = Array.from(row.querySelectorAll('td'));
      const requiredCellCount = kind === 'users' ? 5 : 6;
      if (cells.length < requiredCellCount) {
        throw new Error(
          `Expected ${requiredCellCount} table cells, found ${cells.length}`,
        );
      }
      const nameCell = cells[0];
      const roleOrCodeCell = cells[1];
      const statusOrPermissionCell = cells[kind === 'users' ? 2 : 3];
      const updatedAtCell = cells[kind === 'users' ? 3 : 4];
      if (
        !nameCell ||
        !roleOrCodeCell ||
        !statusOrPermissionCell ||
        !updatedAtCell
      ) {
        throw new Error('Expected management table cells to be present');
      }
      const name = nameCell.querySelector('strong');
      const updatedAt = updatedAtCell.querySelector('.admin-updated-at');
      if (!name || !updatedAt) {
        throw new Error('Expected management table content to be present');
      }
      name.textContent =
        kind === 'users' ? `用户 ${index + 1}` : `角色 ${index + 1}`;
      roleOrCodeCell.textContent =
        kind === 'users' ? '用户' : `role-${index + 1}`;
      if (kind === 'roles') {
        const permissionCell = cells[2];
        if (!permissionCell) throw new Error('Expected role permission cell');
        permissionCell.textContent = String(index + 1);
      }
      statusOrPermissionCell.textContent =
        kind === 'users' ? '活跃' : '自定义角色';
      updatedAt.textContent = '修改时间：2026-08-31 00:00';
      if (kind === 'roles') {
        // Role baselines model seeded built-in roles, which have no lifecycle actions.
        row
          .querySelectorAll('[data-admin-action]')
          .forEach((action) => action.remove());
      }
    });
  }, section);
  await expect(records.first()).toBeVisible();
  const editSelector = `[data-admin-open="${section === 'users' ? 'user' : 'role'}"]`;
  const editCounts = await records.evaluateAll(
    (rows, selector) =>
      rows.map((row) => row.querySelectorAll(selector).length),
    editSelector,
  );
  expect(editCounts).toEqual(Array.from({ length: keepCount }, () => 1));
  const lifecycle = records.locator('[data-admin-action]');
  if (section === 'roles') {
    await expect(lifecycle).toHaveCount(0);
  } else if ((await lifecycle.count()) > 0) {
    const labels = await lifecycle.allTextContents();
    expect(labels.every((label) => /^(逻辑删除|恢复)$/.test(label))).toBe(true);
  }
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
  /** Captures home, profile, tasks, drawer, modal, admin landing, users, and roles states for one visual theme. */
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
    await stabilizeDynamicAdminRecords(page, isMobile, 'users');
    await expect(page.locator('#adminView')).toHaveScreenshot(
      `${themeId}-admin-users.png`,
    );

    await page.getByRole('link', { name: '返回管理首页' }).click();
    await page.getByRole('link', { name: '角色管理' }).click();
    await expect(page).toHaveURL(
      /#admin\/roles\?sort=updatedAt&direction=desc/,
    );
    await stabilizeDynamicAdminRecords(page, isMobile, 'roles');
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
