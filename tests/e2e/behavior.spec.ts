/** Exercises the migrated UI's preserved navigation, state flow, overlays, and persistence behavior. */
import { expect, test, type Page } from '@playwright/test';

/** Closes the covering drawer, switches demo identity, and reopens the named task. */
async function switchUserAndOpenTask(
  page: Page,
  actorId: string,
  title: string,
): Promise<void> {
  await expect(page.locator('#detailDrawer')).toHaveClass(/is-open/);
  await page.locator('[data-close-drawer]').click();
  await expect(page.locator('#detailDrawer')).not.toHaveClass(/is-open/);
  await page
    .locator('#detailDrawer, #drawerBackdrop')
    .evaluateAll(async (elements) => {
      await Promise.all(
        elements.flatMap((element) =>
          element.getAnimations().map((animation) => animation.finished),
        ),
      );
    });
  await page.locator('#profileButton').click();
  await page.locator('#identitySelect').selectOption(actorId);
  await page.keyboard.press('Escape');
  await page.locator('.task-card').filter({ hasText: title }).click();
}

/** Changes the hash through the SPA route boundary without browser fragment scrolling. */
async function navigateToHash(page: Page, hash: string): Promise<void> {
  await page.evaluate((nextHash) => {
    window.history.pushState(null, '', nextHash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, hash);
  const viewSelector = hash.startsWith('#tasks')
    ? '#tasksView'
    : hash.startsWith('#admin')
      ? '#adminView'
      : '#homeView';
  await expect(page.locator(viewSelector)).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

/** Opens the responsive task filter disclosure before mobile-only filter interactions. */
async function openMobileTaskFilters(
  page: Page,
  isMobile: boolean,
): Promise<void> {
  if (!isMobile) return;
  const disclosure = page.locator('#taskFilterDisclosure');
  const isOpen = await disclosure.evaluate(
    (element) => (element as HTMLDetailsElement).open,
  );
  if (!isOpen) await page.locator('.mobile-filter-toggle').click();
}

/** Restores deterministic server and browser state before each independent UI flow. */
test.beforeEach(async ({ page, request }) => {
  await request.post('/api/v1/demo/reset', {
    headers: { 'X-Demo-User-Id': 'noticeboard-admin' },
  });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#taskGrid')).toBeAttached();
});

/** Proves navigation, mine-scoped statistics, status, and search remain client-side. */
test('navigates and filters the in-memory task board', async ({
  page,
  isMobile,
}) => {
  await expect(page.locator('.home-stats')).toHaveAttribute(
    'aria-label',
    '个人任务概览',
  );
  await expect(page.locator('#homeView')).not.toContainText('冒险家工会');
  await expect(page.locator('#homeView')).not.toContainText('个人任务概览');
  await expect(page.locator('#homeView')).not.toContainText('状态概览');
  await expect(page.locator('#homeView')).not.toContainText('任务状态概览');
  await expect(page.locator('#statTotal')).toHaveText('5');
  await expect(page.locator('.stat-card')).toHaveCount(6);
  await expect(page.locator('.stat-foot')).toHaveCount(0);
  await expect(page.locator('.stat-label')).toHaveText([
    '我的任务',
    '未开始',
    '进行中',
    '已完成',
    '重新打开',
    '已关闭',
  ]);
  const desktopStatusColumns = await page
    .locator('.home-status-rail .stats-row')
    .evaluate(
      (row) => getComputedStyle(row).gridTemplateColumns.split(' ').length,
    );
  expect(desktopStatusColumns).toBe(isMobile ? 2 : 1);
  await expect(page.locator('.home-summary .stat-card')).toHaveCount(1);
  await expect(page.locator('.home-status-rail .stat-card')).toHaveCount(5);
  if (isMobile) {
    await page.locator('.home-summary .stat-card-total').click();
    await expect(
      page.evaluate(() => decodeURI(window.location.hash)),
    ).resolves.toBe('#tasks?scope=mine&filter=全部');
  } else {
    await page.locator('.stat-card').nth(1).click();
    await expect(
      page.evaluate(() => decodeURI(window.location.hash)),
    ).resolves.toBe('#tasks?scope=mine&filter=未开始');
  }
  await page.goto('/#tasks?scope=all&filter=全部&q=北境');
  await page.locator('.brand').click();
  await page.locator('.stat-card').first().click();
  await expect(
    page.evaluate(() => decodeURI(window.location.hash)),
  ).resolves.toBe('#tasks?scope=mine&filter=全部');
  await page.getByRole('link', { name: '任务页' }).click();
  await expect(
    page.evaluate(() => decodeURI(window.location.hash)),
  ).resolves.toBe('#tasks?scope=all&filter=全部');
  await expect(page.locator('.task-card')).toHaveCount(12);
  const desktopTaskColumns = await page
    .locator('.task-grid')
    .evaluate(
      (grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length,
    );
  expect(desktopTaskColumns).toBe(isMobile ? 1 : 3);
  await openMobileTaskFilters(page, isMobile);
  await page.getByRole('button', { name: '进行中 3' }).click();
  await expect(page.locator('.task-card')).toHaveCount(3);
  await page.locator('#searchInput').fill('北境');
  await expect(page.locator('.task-card h3')).toHaveText('北境哨站补给护送');
  await page.getByRole('button', { name: '我的任务' }).click();
  await expect(page).toHaveURL(/scope=mine/);
});

/** Proves the action-first home overview keeps one primary summary and a separate status rail. */
test('renders the action-first home overview layout', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.home-layout')).toBeVisible();
  await expect(page.locator('.home-summary .stat-card')).toHaveCount(1);
  await expect(page.locator('.home-status-rail .stat-card')).toHaveCount(5);
  await expect(page.locator('.home-primary-action')).toHaveAttribute(
    'href',
    '#tasks?scope=mine&filter=全部',
  );
  await expect(page.locator('.home-summary #statTotal')).toHaveText('5');
  await expect(page.locator('#statTotalDescription')).toHaveText(
    '你当前有 5 个委托任务待处理。',
  );
  await expect(page.locator('.home-status-rail #statNotStarted')).toHaveText(
    '1',
  );
  await page.locator('.home-primary-action').click();
  await expect(
    page.evaluate(() => decodeURI(window.location.hash)),
  ).resolves.toBe('#tasks?scope=mine&filter=全部');
});

/** Reads the rendered home modules and document overflow without coupling tests to breakpoint constants. */
async function readHomeLayout(page: Page): Promise<{
  viewportHeight: number;
  scrollHeight: number;
  overflowY: string;
  hero: { x: number; y: number; width: number; height: number };
  summary: { x: number; y: number; width: number; height: number };
  nextStep: { x: number; y: number; width: number; height: number };
  status: { x: number; y: number; width: number; height: number };
  statusColumns: number;
}> {
  return page.evaluate(() => {
    const box = (selector: string): DOMRect => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) {
        throw new Error(`Missing home layout element: ${selector}`);
      }
      return element.getBoundingClientRect();
    };
    const hero = box('.hero-section');
    const summary = box('.home-summary .stat-card-total');
    const nextStep = box('.home-next-step');
    const status = box('.home-status-rail');
    const statusRow = document.querySelector('.home-status-rail .stats-row');
    if (!(statusRow instanceof HTMLElement)) {
      throw new Error('Missing home status row');
    }
    const serialize = (rect: DOMRect) => ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
    return {
      viewportHeight: document.documentElement.clientHeight,
      scrollHeight: document.documentElement.scrollHeight,
      overflowY: getComputedStyle(document.body).overflowY,
      hero: serialize(hero),
      summary: serialize(summary),
      nextStep: serialize(nextStep),
      status: serialize(status),
      statusColumns:
        getComputedStyle(statusRow).gridTemplateColumns.split(' ').length,
    };
  });
}

/** Proves every responsive home composition forms one connected frame with singly owned shared edges. */
test('closes every major home cell into one continuous grid', async ({
  page,
}) => {
  const viewports = [
    { width: 1440, height: 1000, state: 'wide' },
    { width: 1280, height: 650, state: 'compact' },
    { width: 800, height: 700, state: 'flow' },
    { width: 412, height: 915, state: 'mobile' },
  ] as const;

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const grid = await page.evaluate(() => {
      const element = (selector: string): HTMLElement => {
        const match = document.querySelector(selector);
        if (!(match instanceof HTMLElement)) {
          throw new Error(`Missing grid element: ${selector}`);
        }
        return match;
      };
      const geometry = (selector: string) => {
        const rect = element(selector).getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        };
      };
      const borders = (selector: string) => {
        const style = getComputedStyle(element(selector));
        return {
          top: parseFloat(style.borderTopWidth),
          right: parseFloat(style.borderRightWidth),
          bottom: parseFloat(style.borderBottomWidth),
          left: parseFloat(style.borderLeftWidth),
        };
      };
      return {
        documentHeight: document.documentElement.scrollHeight,
        topbar: geometry('.topbar'),
        layout: geometry('.home-layout'),
        hero: geometry('.hero-section'),
        summary: geometry('.home-summary'),
        summaryBody: geometry('.home-summary-body'),
        myTasks: geometry('.home-summary .stat-card-total'),
        nextStep: geometry('.home-next-step'),
        status: geometry('.home-status-rail'),
        statusRow: geometry('.home-status-rail .stats-row'),
        topbarBorders: borders('.topbar'),
        layoutBorders: borders('.home-layout'),
        heroBorders: borders('.hero-section'),
        summaryBorders: borders('.home-summary'),
        myTasksBorders: borders('.home-summary .stat-card-total'),
        nextStepBorders: borders('.home-next-step'),
        statusBorders: borders('.home-status-rail'),
        statusRowBorders: borders('.home-status-rail .stats-row'),
      };
    });
    const connected = (first: number, second: number): void => {
      expect(Math.abs(first - second)).toBeLessThanOrEqual(2);
    };

    connected(grid.topbar.left, grid.layout.left);
    connected(grid.topbar.right, grid.layout.right);
    connected(grid.topbar.bottom, grid.layout.top);
    expect(grid.topbarBorders.bottom).toBe(1);
    expect(grid.layoutBorders).toEqual({
      top: 0,
      right: 1,
      bottom: 1,
      left: 1,
    });
    expect(grid.documentHeight - grid.layout.bottom).toBeLessThanOrEqual(24);
    connected(grid.statusRow.left, grid.status.left);
    connected(grid.statusRow.right, grid.status.right);
    connected(grid.statusRow.top, grid.status.top);
    connected(grid.statusRow.bottom, grid.status.bottom);
    expect(grid.statusRowBorders).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
    connected(grid.summaryBody.left, grid.summary.left);
    connected(grid.summaryBody.right, grid.summary.right);
    connected(grid.summaryBody.top, grid.summary.top);
    connected(grid.summaryBody.bottom, grid.summary.bottom);
    expect(grid.summaryBorders).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });

    if (viewport.state === 'wide') {
      connected(grid.hero.right, grid.status.left);
      connected(grid.hero.bottom, grid.summary.top);
      connected(grid.summary.right, grid.status.left);
      connected(grid.summary.bottom, grid.layout.bottom);
      connected(grid.status.bottom, grid.layout.bottom);
      expect(grid.heroBorders.bottom).toBe(1);
      expect(grid.statusBorders.left).toBe(1);
      expect(grid.statusBorders.top).toBe(0);
    } else if (viewport.state === 'compact') {
      connected(grid.hero.bottom, grid.status.top);
      connected(grid.status.bottom, grid.summary.top);
      connected(grid.summary.bottom, grid.layout.bottom);
      expect(grid.heroBorders.bottom).toBe(1);
      expect(grid.statusBorders).toEqual({
        top: 0,
        right: 0,
        bottom: 1,
        left: 0,
      });
    } else {
      connected(grid.hero.bottom, grid.summary.top);
      connected(grid.summary.bottom, grid.status.top);
      connected(grid.status.bottom, grid.layout.bottom);
      expect(grid.heroBorders.bottom).toBe(1);
      expect(grid.statusBorders.top).toBe(1);
      expect(grid.summaryBorders.bottom).toBe(0);
    }

    if (viewport.state === 'mobile') {
      connected(grid.myTasks.bottom, grid.nextStep.top);
      expect(grid.myTasksBorders.bottom).toBe(0);
      expect(grid.myTasksBorders.right).toBe(0);
      expect(grid.nextStepBorders.top).toBe(1);
      expect(grid.nextStepBorders.left).toBe(0);
    } else {
      connected(grid.myTasks.right, grid.nextStep.left);
      expect(grid.myTasksBorders.right).toBe(0);
      expect(grid.myTasksBorders.bottom).toBe(0);
      expect(grid.nextStepBorders.left).toBe(1);
      expect(grid.nextStepBorders.top).toBe(0);
    }
  }
});

/** Proves the poster dashboard fills a tall viewport with its complete vertical status rail. */
test('keeps the wide-high home as a complete single-screen dashboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');

  const layout = await readHomeLayout(page);

  expect(layout.scrollHeight).toBe(layout.viewportHeight);
  expect(layout.overflowY).toBe('hidden');
  expect(layout.status.x).toBeGreaterThanOrEqual(
    layout.hero.x + layout.hero.width - 2,
  );
  expect(layout.statusColumns).toBe(1);
  expect(layout.summary.y).toBeGreaterThanOrEqual(
    layout.hero.y + layout.hero.height - 2,
  );
  expect(layout.summary.y + layout.summary.height).toBeGreaterThan(
    layout.viewportHeight - 4,
  );
  await expect(page.locator('.hero-copy')).toBeVisible();
  await expect(page.locator('.home-next-step')).toBeVisible();
  await expect(page.locator('.home-status-rail .stat-card')).toHaveCount(5);
});

/** Proves a representative wide-short viewport becomes a complete three-row compact dashboard. */
test('recomposes the wide-short home into a complete single-screen dashboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  await page.goto('/');

  const layout = await readHomeLayout(page);

  expect(layout.scrollHeight).toBe(layout.viewportHeight);
  expect(layout.overflowY).toBe('hidden');
  expect(layout.statusColumns).toBe(5);
  expect(layout.status.y).toBeGreaterThanOrEqual(
    layout.hero.y + layout.hero.height - 2,
  );
  expect(layout.summary.y).toBeGreaterThanOrEqual(
    layout.status.y + layout.status.height - 2,
  );
  expect(layout.summary.y + layout.summary.height).toBeLessThanOrEqual(
    layout.viewportHeight + 2,
  );
  expect(Math.abs(layout.summary.y - layout.nextStep.y)).toBeLessThan(2);
  await expect(page.locator('.hero-copy')).toBeVisible();
  await expect(page.locator('.home-next-step')).toBeVisible();
  await expect(page.locator('.home-status-rail .stat-card')).toHaveCount(5);
  const statusOverview = page.getByRole('complementary', {
    name: '任务状态概览',
  });
  await expect(statusOverview).toBeVisible();
  await statusOverview.getByRole('button', { name: /未开始/ }).click();
  await expect(page).toHaveURL(/filter=%E6%9C%AA%E5%BC%80%E5%A7%8B/);
});

/** Proves a narrow viewport is an intentional scrollable information flow with every module present. */
test('stacks the narrow home into a complete scrollable flow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto('/');

  const layout = await readHomeLayout(page);

  expect(layout.scrollHeight).toBeGreaterThan(layout.viewportHeight);
  expect(layout.overflowY).not.toBe('hidden');
  expect(layout.summary.y).toBeGreaterThanOrEqual(
    layout.hero.y + layout.hero.height - 2,
  );
  expect(layout.nextStep.y).toBeGreaterThanOrEqual(layout.summary.y - 2);
  expect(layout.status.y).toBeGreaterThanOrEqual(
    layout.nextStep.y + layout.nextStep.height - 2,
  );
  expect(layout.statusColumns).toBe(3);
  await expect(page.locator('.hero-copy')).toBeVisible();
  await expect(page.locator('.home-next-step')).toBeVisible();
  await expect(page.locator('.home-status-rail .stat-card')).toHaveCount(5);
});

/** Proves an extremely short window falls back to complete scrolling instead of clipping or hiding content. */
test('keeps every home module reachable in an extremely short window', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 420 });
  await page.goto('/');

  const layout = await readHomeLayout(page);

  expect(layout.scrollHeight).toBeGreaterThan(layout.viewportHeight);
  expect(layout.overflowY).not.toBe('hidden');
  expect(layout.status.y).toBeGreaterThanOrEqual(
    layout.nextStep.y + layout.nextStep.height - 2,
  );
  await expect(page.locator('.hero-copy')).toBeVisible();
  await expect(page.locator('.home-next-step')).toBeVisible();
  await expect(page.locator('.home-status-rail .stat-card')).toHaveCount(5);
});

/** Proves the smallest supported phone width keeps the poster headline readable without horizontal overflow. */
test('keeps the home headline composed at an extreme phone width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');

  const headline = await page
    .locator('.hero-section h1')
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        renderedLines:
          element.getBoundingClientRect().height / parseFloat(style.lineHeight),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    });

  expect(headline.renderedLines).toBeLessThanOrEqual(3.1);
  expect(headline.scrollWidth).toBe(headline.clientWidth);
  await expect(page.locator('.hero-copy')).toBeVisible();
  await expect(page.locator('.home-next-step')).toBeVisible();
  await expect(page.locator('.home-status-rail')).toBeVisible();
});

/** Proves viewport neighborhoods around both state changes remain complete whichever valid composition is active. */
test('keeps home compositions stable around responsive boundaries', async ({
  page,
}) => {
  const boundaryNeighborhood = [
    { width: 1064, height: 740 },
    { width: 1096, height: 740 },
    { width: 1064, height: 764 },
    { width: 1096, height: 764 },
    { width: 1096, height: 510 },
    { width: 1096, height: 490 },
  ];

  for (const viewport of boundaryNeighborhood) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const layout = await readHomeLayout(page);
    const horizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );

    expect(horizontalOverflow).toBe(0);
    await expect(page.locator('.hero-copy')).toBeVisible();
    await expect(page.locator('.home-next-step')).toBeVisible();
    await expect(page.locator('.home-status-rail')).toHaveAttribute(
      'aria-label',
      '任务状态概览',
    );

    if (layout.overflowY === 'hidden' && layout.statusColumns === 1) {
      expect(layout.status.x).toBeGreaterThanOrEqual(
        layout.hero.x + layout.hero.width - 2,
      );
      expect(layout.summary.y + layout.summary.height).toBeLessThanOrEqual(
        layout.viewportHeight + 2,
      );
    } else if (layout.overflowY === 'hidden') {
      expect(layout.statusColumns).toBe(5);
      expect(layout.status.y).toBeGreaterThanOrEqual(
        layout.hero.y + layout.hero.height - 2,
      );
      expect(layout.summary.y).toBeGreaterThanOrEqual(
        layout.status.y + layout.status.height - 2,
      );
      expect(layout.summary.y + layout.summary.height).toBeLessThanOrEqual(
        layout.viewportHeight + 2,
      );
    } else {
      expect(layout.scrollHeight).toBeGreaterThan(layout.viewportHeight);
      expect(layout.status.y).toBeGreaterThanOrEqual(
        layout.nextStep.y + layout.nextStep.height - 2,
      );
    }
  }
});

/** Proves administrators can manage roles and users while ordinary users cannot enter the route. */
test('manages roles and users from the admin view', async ({
  page,
  isMobile,
}) => {
  await expect(page.locator('#adminNavLink')).toBeHidden();
  await page.locator('#profileButton').click();
  await page.locator('#identitySelect').selectOption('noticeboard-admin');
  await page.keyboard.press('Escape');
  await expect(page.locator('#adminNavLink')).toBeVisible();
  await page.locator('#adminNavLink').click();
  await expect(page.locator('#adminView')).toBeVisible();
  await expect(page.locator('.admin-entry-link')).toHaveCount(2);
  const visibleRecords = isMobile
    ? '.admin-mobile-card:visible'
    : '.admin-table:visible tr';
  await page.getByRole('link', { name: '用户管理' }).click();
  await expect(page).toHaveURL(/#admin\/users\?sort=updatedAt&direction=desc/);
  await expect(
    page.locator('.admin-table:visible, .admin-mobile-list:visible').first(),
  ).toBeVisible();

  const overviewRequests: string[] = [];
  await page.route('**/api/v1/admin/overview', async (route) => {
    overviewRequests.push(route.request().url());
    await route.continue();
  });
  if (isMobile) {
    await page
      .locator('.admin-user-mobile-sort [data-admin-sort="name"]')
      .click();
  } else {
    await page.locator('.admin-table:visible [data-admin-sort="name"]').click();
  }
  await expect(page).toHaveURL(/sort=name&direction=asc/);
  expect(overviewRequests).toHaveLength(0);

  const userName = `网页测试用户-${Date.now()}`;
  await page.locator('[data-admin-open="create-user"]').click();
  const userDialog = page.locator('dialog[open]');
  await userDialog.locator('input[name="name"]').fill(userName);
  await userDialog.locator('button[type="submit"]').click();
  await expect(userDialog).toHaveCount(0);
  await expect(
    page.locator('.admin-table:visible, .admin-mobile-list:visible'),
  ).toContainText(userName);

  const userRecord = page
    .locator(visibleRecords)
    .filter({ hasText: userName })
    .first();
  await userRecord.locator('.admin-more-actions summary').click();
  page.once('dialog', (dialog) => dialog.accept());
  await userRecord.locator('[data-admin-action="delete-user"]').click();
  await expect(
    page.locator(visibleRecords).filter({ hasText: userName }),
  ).toHaveCount(0);
  await page.locator('[data-admin-user-status]').selectOption('deleted');
  const deletedUserRecord = page
    .locator(visibleRecords)
    .filter({ hasText: userName })
    .first();
  await expect(deletedUserRecord).toBeVisible();
  await deletedUserRecord.locator('.admin-more-actions summary').click();
  await deletedUserRecord.locator('[data-admin-action="restore-user"]').click();
  await expect(deletedUserRecord).toHaveCount(0);
  await page.locator('[data-admin-user-status]').selectOption('active');
  await expect(
    page.locator(visibleRecords).filter({ hasText: userName }).first(),
  ).toBeVisible();

  await page
    .getByRole('navigation', { name: '面包屑' })
    .getByRole('link', { name: '管理', exact: true })
    .click();
  await page.getByRole('link', { name: '角色管理' }).click();
  await page.locator('[data-admin-open="create-role"]').click();
  const roleDialog = page.locator('dialog[open]');
  const roleName = `网页测试角色-${Date.now()}`;
  await roleDialog.locator('input[name="name"]').fill(roleName);
  await roleDialog.locator('input[value="tasks.view"]').check();
  await roleDialog.locator('button[type="submit"]').click();
  await expect(roleDialog).toHaveCount(0);
  await expect(
    page.locator('.admin-table:visible, .admin-mobile-list:visible'),
  ).toContainText(roleName);

  const roleRecord = page
    .locator(visibleRecords)
    .filter({ hasText: roleName })
    .first();
  await roleRecord.locator('[data-admin-open="role"]').click();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.locator('dialog[open] [data-admin-close="dialog"]').click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);

  const roleAction = page
    .locator(visibleRecords)
    .filter({ hasText: roleName })
    .first()
    .locator('[data-admin-action="delete-role"]');
  await roleAction.click();
  await expect(
    page
      .locator(visibleRecords)
      .filter({ hasText: roleName })
      .locator('[data-admin-action="restore-role"]'),
  ).toBeVisible();
  await page
    .locator(visibleRecords)
    .filter({ hasText: roleName })
    .first()
    .locator('[data-admin-action="restore-role"]')
    .click();
  await expect(
    page
      .locator(visibleRecords)
      .filter({ hasText: roleName })
      .locator('[data-admin-action="delete-role"]'),
  ).toBeVisible();

  await page.locator('#profileButton').click();
  await page.locator('#identitySelect').selectOption('noticeboard-master');
  await expect(page.locator('#adminNavLink')).toBeHidden();
  await page.goto('/#admin');
  await expect(page.locator('#homeView')).toBeVisible();
});

/** Reads the management landing geometry and overflow at the active viewport. */
async function readAdminLandingLayout(page: Page): Promise<{
  columns: number;
  cardWidths: number[];
  linksFillCards: boolean;
  horizontalOverflow: number;
  scrollHeight: number;
  viewportHeight: number;
}> {
  return page.evaluate(() => {
    const landing = document.querySelector('.admin-landing');
    const cards = Array.from(document.querySelectorAll('.admin-entry-card'));
    const links = Array.from(document.querySelectorAll('.admin-entry-link'));
    if (!(landing instanceof HTMLElement) || cards.length !== 2) {
      throw new Error('Expected the management landing and two cards');
    }
    const cardRects = cards.map((card) => card.getBoundingClientRect());
    const linkRects = links.map((link) => link.getBoundingClientRect());
    const [firstCard, secondCard] = cardRects;
    if (!firstCard || !secondCard) {
      throw new Error('Expected both management card rectangles');
    }
    return {
      columns: Math.abs(firstCard.y - secondCard.y) < 1 ? 2 : 1,
      cardWidths: cardRects.map((rect) => rect.width),
      linksFillCards: cardRects.every((card, index) => {
        const link = linkRects[index];
        return (
          link !== undefined &&
          Math.abs(card.width - link.width) < 1 &&
          Math.abs(card.height - link.height) < 1
        );
      }),
      horizontalOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    };
  });
}

/** Proves the management landing reflows by available space without clipping content or interactions. */
test('keeps the management landing fluid across width and height changes', async ({
  page,
}) => {
  await page.locator('#profileButton').click();
  await page.locator('#identitySelect').selectOption('noticeboard-admin');
  await page.keyboard.press('Escape');
  await page.goto('/#admin');
  await expect(page.locator('#adminView h1')).toHaveText('管理');
  await expect(page.locator('.admin-entry-link')).toHaveCount(2);

  for (const viewport of [
    { width: 1440, height: 900, columns: 2 },
    { width: 1280, height: 720, columns: 2 },
    { width: 1024, height: 768, columns: 2 },
    { width: 900, height: 720, columns: 2 },
    { width: 430, height: 840, columns: 1 },
    { width: 375, height: 667, columns: 1 },
  ]) {
    await page.setViewportSize(viewport);
    const layout = await readAdminLandingLayout(page);
    expect(layout.columns).toBe(viewport.columns);
    expect(layout.cardWidths.every((width) => width >= 300)).toBe(true);
    expect(layout.linksFillCards).toBe(true);
    expect(layout.horizontalOverflow).toBeLessThanOrEqual(0);
  }

  const sampledColumns: number[] = [];
  for (let width = 920; width >= 820; width -= 10) {
    await page.setViewportSize({ width, height: 700 });
    const layout = await readAdminLandingLayout(page);
    sampledColumns.push(layout.columns);
    expect(layout.horizontalOverflow).toBeLessThanOrEqual(0);
    expect(layout.cardWidths.every((cardWidth) => cardWidth >= 300)).toBe(true);
  }
  expect(sampledColumns[0]).toBe(2);
  expect(sampledColumns.at(-1)).toBe(1);
  expect(
    sampledColumns.filter(
      (columns, index) => index > 0 && columns !== sampledColumns[index - 1],
    ),
  ).toHaveLength(1);

  await page.setViewportSize({ width: 1280, height: 600 });
  const lowLayout = await readAdminLandingLayout(page);
  expect(lowLayout.columns).toBe(2);
  expect(lowLayout.scrollHeight).toBeGreaterThan(lowLayout.viewportHeight);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);

  await page.setViewportSize({ width: 1280, height: 720 });
  const firstLink = page.locator('.admin-entry-link').first();
  const arrow = firstLink.locator('.admin-entry-arrow');
  const initialTransform = await arrow.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  await firstLink.hover();
  await expect(firstLink).toHaveCSS('background-color', 'rgb(17, 17, 17)');
  await expect(firstLink).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect
    .poll(() =>
      arrow.evaluate((element) => getComputedStyle(element).transform),
    )
    .not.toBe(initialTransform);
  await firstLink.focus();
  await expect(firstLink).toBeFocused();
  await expect(firstLink).toHaveCSS('outline-style', 'solid');
});

/** Proves mobile user management stacks complete records below a responsive sticky toolbar. */
test('renders mobile admin cards and sorting controls', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, '仅在移动端检查管理卡片');
  await page.locator('#profileButton').click();
  await page.locator('#identitySelect').selectOption('noticeboard-admin');
  await page.keyboard.press('Escape');
  await page.locator('#adminNavLink').click();
  await page.getByRole('link', { name: '用户管理' }).click();
  await expect(page.locator('.admin-mobile-list')).toBeVisible();
  await expect(page.locator('.admin-table')).toBeHidden();
  const sortBar = page.locator('.admin-user-toolbar');
  await expect(sortBar).toBeVisible();
  await expect(sortBar).toHaveCSS('position', 'sticky');
  await expect(sortBar).toHaveCSS('top', '99px');
  await expect(
    page.locator('.admin-mobile-card .admin-record-actions').first(),
  ).toHaveCSS('justify-content', 'flex-start');
  const actionAlignment = await page
    .locator('.admin-mobile-card')
    .first()
    .evaluate((card) => {
      const info = card.querySelector('.admin-record-info');
      const actions = card.querySelector('.admin-record-actions');
      if (!info || !actions) {
        throw new Error('Expected mobile record info and actions');
      }
      const cardStyle = getComputedStyle(card);
      const infoBox = info.getBoundingClientRect();
      const actionsBox = actions.getBoundingClientRect();
      const buttonHeights = Array.from(actions.querySelectorAll('button')).map(
        (button) => button.getBoundingClientRect().height,
      );
      return {
        display: cardStyle.display,
        gridTracks: cardStyle.gridTemplateColumns.split(' ').length,
        alignItems: cardStyle.alignItems,
        actionsBelow: actionsBox.top >= infoBox.bottom,
        buttonHeights: buttonHeights.filter((height) => height > 0),
      };
    });
  expect(actionAlignment.display).toBe('grid');
  expect(actionAlignment.gridTracks).toBe(1);
  expect(actionAlignment.alignItems).toBe('start');
  expect(actionAlignment.actionsBelow).toBe(true);
  expect(
    actionAlignment.buttonHeights.every(
      (height) => height >= 32 && height <= 38,
    ),
  ).toBe(true);
  await page
    .locator('.admin-user-mobile-sort [data-admin-sort="updatedAt"]')
    .click();
  await expect(page).toHaveURL(/sort=updatedAt&direction=asc/);
  await expect(
    page.locator('.admin-mobile-card .admin-user-status'),
  ).toHaveCount(await page.locator('.admin-mobile-card').count());

  await page
    .getByRole('navigation', { name: '面包屑' })
    .getByRole('link', { name: '管理', exact: true })
    .click();
  await page.getByRole('link', { name: '角色管理' }).click();
  await expect(page.locator('.admin-mobile-list')).toBeVisible();
  const roleStatusTexts = await page
    .locator('.admin-mobile-card .admin-status')
    .allTextContents();
  expect(roleStatusTexts).toContain('内置角色');
});

/** Proves the user list stays dense, filterable, and free of horizontal overflow across target viewports. */
test('keeps user management responsive across width and height changes', async ({
  page,
}) => {
  await page.locator('#profileButton').click();
  await page.locator('#identitySelect').selectOption('noticeboard-admin');
  await page.keyboard.press('Escape');
  await page.locator('#adminNavLink').click();
  await page.getByRole('link', { name: '用户管理' }).click();
  await page.setViewportSize({ width: 1440, height: 900 });

  const search = page.locator('[data-admin-user-query]');
  await search.fill('公会管理员');
  await expect(
    page.locator('.admin-table:visible tbody tr, .admin-mobile-card:visible'),
  ).toHaveCount(1);
  await page
    .locator('[data-admin-user-role]')
    .selectOption('role-system-admin');
  await expect(
    page.locator('.admin-table:visible tbody tr, .admin-mobile-card:visible'),
  ).toHaveCount(1);
  await page.locator('[data-admin-user-query]').fill('');
  await page.locator('[data-admin-user-role]').selectOption('all');

  await expect(page.locator('[data-admin-direction]')).toHaveCount(0);
  for (const field of ['name', 'role', 'status', 'updatedAt']) {
    await page.locator(`.admin-table [data-admin-sort="${field}"]`).click();
    await expect(page).toHaveURL(new RegExp(`sort=${field}&direction=`));
  }

  const rowLineOffsets = await page
    .locator('.admin-table:visible tbody tr')
    .first()
    .locator('td')
    .evaluateAll((cells) =>
      cells.map((cell) => cell.getBoundingClientRect().bottom),
    );
  expect(
    Math.max(...rowLineOffsets) - Math.min(...rowLineOffsets),
  ).toBeLessThan(0.1);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 900, height: 700 },
    { width: 700, height: 700 },
    { width: 620, height: 800 },
    { width: 375, height: 667 },
    { width: 1280, height: 600 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    if (viewport.width <= 620) {
      await expect(page.locator('.admin-mobile-list')).toBeVisible();
      await expect(page.locator('.admin-table')).toBeHidden();
    } else {
      await expect(page.locator('.admin-table')).toBeVisible();
      await expect(page.locator('.admin-mobile-list')).toBeHidden();
    }
    const layout = await page.evaluate(() => {
      const header = document.querySelector('.admin-user-header');
      const toolbar = document.querySelector('.admin-user-toolbar');
      const searchInput = document.querySelector('[data-admin-user-query]');
      const firstRecord = Array.from(
        document.querySelectorAll('.admin-table tbody tr, .admin-mobile-card'),
      ).find((record) => record.getClientRects().length > 0);
      if (!header || !toolbar || !searchInput || !firstRecord)
        throw new Error('Expected the complete user management layout');
      return {
        horizontalOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        headerHeight: header.getBoundingClientRect().height,
        firstRecordTop: firstRecord.getBoundingClientRect().top,
        toolbarWidth: toolbar.getBoundingClientRect().width,
        searchWidth: searchInput.getBoundingClientRect().width,
        scrollHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
      };
    });
    expect(layout.horizontalOverflow).toBeLessThanOrEqual(0);
    expect(layout.headerHeight).toBeGreaterThanOrEqual(100);
    expect(layout.headerHeight).toBeLessThanOrEqual(130);
    expect(layout.firstRecordTop).toBeLessThan(viewport.height);
    if (viewport.width <= 620) {
      expect(layout.searchWidth).toBeGreaterThanOrEqual(
        layout.toolbarWidth - 2,
      );
    }
    if (viewport.height === 600)
      expect(layout.scrollHeight).toBeGreaterThan(layout.viewportHeight);
  }
});

/** Proves built-in role names stay immutable while their supported permissions remain editable. */
test('edits permissions on a built-in role', async ({ page }) => {
  await page.locator('#profileButton').click();
  await page.locator('#identitySelect').selectOption('noticeboard-admin');
  await page.keyboard.press('Escape');
  await page.locator('#adminNavLink').click();
  await page.getByRole('link', { name: '角色管理' }).click();

  const editButton = page
    .locator(
      '.admin-mobile-card:visible [data-admin-open="role"][data-admin-id="role-user"], .admin-table:visible [data-admin-open="role"][data-admin-id="role-user"]',
    )
    .first();
  await editButton.click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog.locator('input[name="name"]')).toHaveAttribute(
    'readonly',
    '',
  );
  const permission = dialog.locator('input[value="tasks.accept"]');
  await expect(permission).toBeEnabled();
  await expect(dialog.locator('button[type="submit"]')).toBeEnabled();
  const originalChecked = await permission.isChecked();
  await permission.setChecked(!originalChecked);
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toHaveCount(0);

  await editButton.click();
  const restoredDialog = page.locator('dialog[open]');
  const restoredPermission = restoredDialog.locator(
    'input[value="tasks.accept"]',
  );
  await restoredPermission.setChecked(originalChecked);
  await restoredDialog.locator('button[type="submit"]').click();
  await expect(restoredDialog).toHaveCount(0);
});

/** Proves failed admin mutations reopen the editor with the submitted values intact. */
test('preserves admin form values after a failed submission', async ({
  page,
}) => {
  await page.locator('#profileButton').click();
  await page.locator('#identitySelect').selectOption('noticeboard-admin');
  await page.keyboard.press('Escape');
  await page.locator('#adminNavLink').click();
  await page.getByRole('link', { name: '角色管理' }).click();
  await page.route('**/api/v1/admin/roles', async (route) => {
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'CONFLICT', message: '角色名称已存在' },
      }),
    });
  });

  await page.locator('[data-admin-open="create-role"]').click();
  const dialog = page.locator('dialog[open]');
  const name = '失败后保留的角色';
  await dialog.locator('input[name="name"]').fill(name);
  await dialog.locator('input[value="tasks.view"]').check();
  await dialog.locator('input[value="tasks.review"]').check();
  await dialog.locator('button[type="submit"]').click();

  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[name="name"]')).toHaveValue(name);
  await expect(dialog.locator('input[value="tasks.view"]')).toBeChecked();
  await expect(dialog.locator('input[value="tasks.review"]')).toBeChecked();
  await page.unroute('**/api/v1/admin/roles');
});

/** Proves home summary copy stays inset from the divider and surrounding edges. */
test('pads home summary content around its copy', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');

  const padding = await page
    .locator('.home-summary .stat-card-total, .home-next-step')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          top: style.paddingTop,
          left: style.paddingLeft,
          right: style.paddingRight,
          bottom: style.paddingBottom,
        };
      }),
    );

  expect(padding).toEqual(
    isMobile
      ? [
          { top: '28px', left: '16px', right: '16px', bottom: '28px' },
          { top: '28px', left: '16px', right: '16px', bottom: '28px' },
        ]
      : [
          { top: '28px', left: '20px', right: '26px', bottom: '28px' },
          { top: '28px', left: '28px', right: '26px', bottom: '28px' },
        ],
  );
});

/** Proves every home status arrow matches the task-card bottom-right treatment. */
test('aligns home arrows to the bottom right of their cards', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');

  const taskCardArrowStyle = await page
    .locator('.task-card-arrow')
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        color: style.color,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
      };
    });
  const arrows = await page
    .locator('.home-layout .stat-arrow')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          position: style.position,
          right: style.right,
          bottom: style.bottom,
          color: style.color,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
        };
      }),
    );

  expect(arrows).toEqual([
    {
      position: 'absolute',
      right: isMobile ? '16px' : '26px',
      bottom: '28px',
      ...taskCardArrowStyle,
    },
    ...Array.from({ length: 5 }, () => ({
      position: 'absolute',
      right: isMobile ? '15px' : '26px',
      bottom: isMobile ? '14px' : '19px',
      ...taskCardArrowStyle,
    })),
  ]);
});

/** Proves the action-first home status rail collapses to two columns on narrow screens. */
test('uses responsive home status-rail columns', async ({ page }) => {
  await page.goto('/');

  const columnsAt = async (width: number): Promise<number> => {
    await page.setViewportSize({ width, height: 915 });
    return page
      .locator('.home-status-rail .stats-row')
      .evaluate(
        (row) => getComputedStyle(row).gridTemplateColumns.split(' ').length,
      );
  };

  await expect(page.locator('.home-status-rail .stat-card')).toHaveCount(5);
  await expect.poll(() => columnsAt(1440)).toBe(1);
  await expect.poll(() => columnsAt(840)).toBe(3);
  await expect.poll(() => columnsAt(620)).toBe(2);
});

/** Proves the task grid reduces columns as the available desktop space narrows. */
test('uses responsive task-grid columns', async ({ page }) => {
  await page.goto('/#tasks?scope=all&filter=全部');

  const columnsAt = async (width: number): Promise<number> => {
    await page.setViewportSize({ width, height: 915 });
    return page
      .locator('.task-grid')
      .evaluate(
        (grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      );
  };

  await expect(page.locator('.task-card')).toHaveCount(12);
  await expect.poll(() => columnsAt(1440)).toBe(3);
  await expect.poll(() => columnsAt(1280)).toBe(3);
  await expect.poll(() => columnsAt(1200)).toBe(2);
  await expect.poll(() => columnsAt(1000)).toBe(2);
  await expect.poll(() => columnsAt(900)).toBe(1);
  await expect.poll(() => columnsAt(840)).toBe(2);
  await expect.poll(() => columnsAt(620)).toBe(1);
});

/** Proves mobile task filters collapse out of the board flow and remain open during filter changes. */
test('collapses mobile task filters to reveal task cards', async ({
  page,
  isMobile,
}) => {
  test.skip(
    !isMobile,
    'Mobile filter disclosure is covered by the mobile project.',
  );
  await page.goto('/#tasks?scope=all&filter=全部');

  const disclosure = page.locator('#taskFilterDisclosure');
  const metrics = () =>
    page.locator('#taskGrid').evaluate((grid) => ({
      clientHeight: grid.clientHeight,
      cardTop: grid
        .querySelector<HTMLElement>('.task-card')
        ?.getBoundingClientRect().top,
    }));

  await expect(disclosure).toBeAttached();
  await expect(disclosure).not.toHaveAttribute('open', '');
  await expect(page.locator('.mobile-filter-toggle')).toBeVisible();
  await expect(page.locator('#scopeSwitcher')).toBeHidden();
  await expect(page.locator('#filterList')).toBeHidden();
  const collapsed = await metrics();
  if (collapsed.cardTop === undefined) throw new Error('Task card is missing');
  expect(collapsed.cardTop).toBeLessThan(460);

  await page.locator('.mobile-filter-toggle').click();
  await expect(disclosure).toHaveAttribute('open', '');
  await expect(page.locator('#scopeSwitcher')).toBeVisible();
  await expect(page.locator('#filterList')).toBeVisible();
  const expanded = await metrics();
  if (expanded.cardTop === undefined) throw new Error('Task card is missing');
  expect(collapsed.cardTop).toBeLessThan(expanded.cardTop - 80);

  await page.locator('[data-scope="mine"]').click();
  await expect(disclosure).toHaveAttribute('open', '');
  await page.locator('[data-filter="进行中"]').click();
  await expect(disclosure).toHaveAttribute('open', '');

  await page.locator('.mobile-filter-toggle').click();
  await expect(disclosure).not.toHaveAttribute('open', '');
});

/** Proves desktop task filters stay expanded without showing the mobile disclosure trigger. */
test('keeps task filters expanded on desktop', async ({ page, isMobile }) => {
  test.skip(
    isMobile,
    'Desktop filter layout is covered by the desktop project.',
  );
  await page.goto('/#tasks?scope=all&filter=全部');

  await expect(page.locator('#taskFilterDisclosure')).toHaveAttribute(
    'open',
    '',
  );
  await expect(page.locator('.mobile-filter-toggle')).toBeHidden();
  await expect(page.locator('#scopeSwitcher')).toBeVisible();
  await expect(page.locator('#filterList')).toBeVisible();
});

/** Proves one or two visible tasks keep the standard desktop card width instead of filling the row. */
test('keeps sparse task-grid cards at the standard desktop width', async ({
  page,
  isMobile,
}) => {
  test.skip(
    isMobile,
    'Sparse desktop card sizing is covered by the desktop project.',
  );
  await page.setViewportSize({ width: 1440, height: 915 });
  await page.goto('/#tasks?scope=all&filter=全部');

  const standard = await page.locator('.task-grid').evaluate((grid) => ({
    columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
    gridWidth: grid.clientWidth,
    cardWidth: grid.querySelector<HTMLElement>('.task-card')?.clientWidth ?? 0,
  }));

  await page.goto('/#tasks?scope=all&filter=关闭');
  await expect(page.locator('.task-card')).toHaveCount(2);
  const twoCardLayout = await page.locator('.task-grid').evaluate((grid) => ({
    columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
    gridWidth: grid.clientWidth,
    cardWidth: grid.querySelector<HTMLElement>('.task-card')?.clientWidth ?? 0,
  }));

  await page.goto('/#tasks?scope=all&filter=全部&q=赤岩');
  await expect(page.locator('.task-card')).toHaveCount(1);
  const oneCardLayout = await page.locator('.task-grid').evaluate((grid) => ({
    columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
    gridWidth: grid.clientWidth,
    cardWidth: grid.querySelector<HTMLElement>('.task-card')?.clientWidth ?? 0,
  }));

  for (const layout of [twoCardLayout, oneCardLayout]) {
    expect(layout.columns).toBe(standard.columns);
    expect(Math.abs(layout.cardWidth - standard.cardWidth)).toBeLessThan(2);
    expect(layout.cardWidth).toBeLessThan(layout.gridWidth / 2);
  }
});

/** Proves long task content grows its row and remains inside every card boundary. */
test('keeps task-card content inside its card at narrow widths', async ({
  page,
}) => {
  await page.goto('/#tasks?scope=all&filter=全部');
  await page
    .locator('.task-card')
    .first()
    .locator('h3')
    .evaluate((heading) => {
      heading.textContent =
        '这是一项用于验证窄屏换行、长标题高度与卡片对齐方式的超长冒险家工会任务';
    });
  await page
    .locator('.task-card')
    .first()
    .locator('.task-summary')
    .evaluate((summary) => {
      summary.textContent =
        'unbroken-content-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    });

  for (const width of [1000, 900, 840, 620, 412]) {
    await page.setViewportSize({ width, height: 915 });
    const cardsFit = await page.locator('.task-card').evaluateAll((cards) =>
      cards.every((card) => {
        const cardRect = card.getBoundingClientRect();
        const descendantsFit = [...card.querySelectorAll('*')].every((node) => {
          const rect = node.getBoundingClientRect();
          return (
            rect.left >= cardRect.left - 1 &&
            rect.right <= cardRect.right + 1 &&
            rect.top >= cardRect.top - 1 &&
            rect.bottom <= cardRect.bottom + 1
          );
        });
        return (
          descendantsFit &&
          card.scrollWidth <= card.clientWidth &&
          card.scrollHeight <= card.clientHeight
        );
      }),
    );

    expect(cardsFit, `cards overflow at ${width}px`).toBe(true);
  }
});

/** Proves task copy and cards belong to the document instead of nested or snapping scroll layers. */
test('scrolls task copy and cards with the document', async ({ page }) => {
  await page.goto('/#tasks?scope=all&filter=全部');
  await expect(page.locator('.task-card')).toHaveCount(12);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

  const readLayout = () =>
    page.evaluate(() => {
      const intro = document.querySelector<HTMLElement>('.tasks-intro');
      const board = document.querySelector<HTMLElement>('.board-layout');
      const grid = document.querySelector<HTMLElement>('#taskGrid');
      const card = document.querySelector<HTMLElement>('.task-card');
      if (!intro || !board || !grid || !card)
        throw new Error('Task layout is missing');
      return {
        scrollY: window.scrollY,
        introTop: intro.getBoundingClientRect().top,
        cardTop: card.getBoundingClientRect().top,
        boardPosition: getComputedStyle(board).position,
        gridOverflowY: getComputedStyle(grid).overflowY,
        gridScrollTop: grid.scrollTop,
        documentHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
      };
    });
  const initial = await readLayout();
  expect(initial.boardPosition).not.toBe('sticky');
  expect(initial.gridOverflowY).toBe('visible');
  expect(initial.documentHeight).toBeGreaterThan(initial.viewportHeight);

  await page.locator('#taskGrid').evaluate((grid) => {
    grid.scrollTop = 120;
  });
  await expect.poll(async () => (await readLayout()).gridScrollTop).toBe(0);

  await page.evaluate(() => window.scrollTo({ top: 360, behavior: 'instant' }));
  await expect.poll(async () => (await readLayout()).scrollY).toBe(360);
  const scrolled = await readLayout();
  expect(scrolled.introTop).toBeLessThan(initial.introTop - 300);
  expect(scrolled.cardTop).toBeLessThan(initial.cardTop - 300);
});

/** Proves the desktop task controls stick together below the compact topbar while cards keep moving. */
test('keeps the desktop task controls visible during document scrolling', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Mobile filters remain in normal document flow');
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto('/#tasks?scope=all&filter=全部');
  await expect(page.locator('.task-card')).toHaveCount(12);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

  const stickyStart = await page.evaluate(() => {
    const board = document.querySelector<HTMLElement>('.board-layout');
    const topbar = document.querySelector<HTMLElement>('.topbar');
    if (!board || !topbar) throw new Error('Task layout is missing');
    return (
      board.getBoundingClientRect().top +
      window.scrollY -
      topbar.getBoundingClientRect().bottom +
      120
    );
  });
  await page.evaluate((top) => {
    window.scrollTo({ top, behavior: 'instant' });
  }, stickyStart);

  const readPositions = () =>
    page.evaluate(() => {
      const topbar = document.querySelector<HTMLElement>('.topbar');
      const sidebar = document.querySelector<HTMLElement>('.board-sidebar');
      const toolbar = document.querySelector<HTMLElement>('.board-toolbar');
      const card = document.querySelector<HTMLElement>('.task-card');
      if (!topbar || !sidebar || !toolbar || !card)
        throw new Error('Task layout is missing');
      return {
        scrollY: window.scrollY,
        topbarHeight: topbar.getBoundingClientRect().height,
        topbarBottom: topbar.getBoundingClientRect().bottom,
        sidebarTop: sidebar.getBoundingClientRect().top,
        toolbarTop: toolbar.getBoundingClientRect().top,
        cardTop: card.getBoundingClientRect().top,
      };
    });
  expect((await readPositions()).topbarHeight).toBe(72);
  await expect
    .poll(async () => (await readPositions()).sidebarTop)
    .toBeCloseTo((await readPositions()).topbarBottom + 16, 0);
  await expect
    .poll(async () => (await readPositions()).toolbarTop)
    .toBeCloseTo((await readPositions()).topbarBottom + 16, 0);
  const first = await readPositions();

  await page.evaluate(() => window.scrollBy({ top: 180, behavior: 'instant' }));
  await expect
    .poll(async () => (await readPositions()).scrollY)
    .toBe(first.scrollY + 180);
  const second = await readPositions();
  expect(second.sidebarTop).toBeCloseTo(second.topbarBottom + 16, 0);
  expect(second.toolbarTop).toBeCloseTo(second.topbarBottom + 16, 0);
  expect(second.cardTop).toBeLessThan(first.cardTop - 150);
});

/** Proves each responsive home mode and the task view restore their own document positions. */
test('restores responsive home and task view positions', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  await expect(page.locator('.task-card')).toHaveCount(12);

  const homeScrollY = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    return window.scrollY;
  });
  if (isMobile) expect(homeScrollY).toBeGreaterThan(0);
  else expect(homeScrollY).toBe(0);

  await navigateToHash(page, '#tasks?scope=all&filter=全部');
  await expect(page.locator('#tasksView')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.waitForTimeout(100);

  const taskScrollY = await page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>('#taskGrid');
    const board = document.querySelector<HTMLElement>('.board-layout');
    const topbar = document.querySelector<HTMLElement>('.topbar');
    if (!grid || !board || !topbar) throw new Error('Task layout is missing');
    const boardScrollY = Math.max(
      0,
      board.getBoundingClientRect().top +
        window.scrollY -
        topbar.getBoundingClientRect().height,
    );
    window.scrollTo(0, boardScrollY);
    grid.scrollTop = 120;
    if (grid.scrollTop !== 0)
      throw new Error('Task grid unexpectedly owns a scroll layer');
    return window.scrollY;
  });
  expect(taskScrollY).toBeGreaterThan(0);

  await navigateToHash(page, '#home');
  await expect(page.locator('#homeView')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(homeScrollY);

  await navigateToHash(page, '#tasks?scope=all&filter=全部');
  await expect(page.locator('#tasksView')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(taskScrollY);
});

/** Proves active task controls use canonical hash deduplication without growing browser history. */
test('does not add history for active task filters or navigation', async ({
  page,
  isMobile,
}) => {
  await page.goto('/#tasks?scope=all&filter=全部');
  await expect(page.locator('.task-card')).toHaveCount(12);
  const initialHistoryLength = await page.evaluate(() => history.length);

  await openMobileTaskFilters(page, isMobile);
  await page.locator('[data-filter="全部"]').click();
  await page.getByRole('link', { name: '任务页' }).click();

  await expect
    .poll(() => page.evaluate(() => history.length))
    .toBe(initialHistoryLength);
  await expect(page).toHaveURL(/#tasks\?scope=all&filter=%E5%85%A8%E9%83%A8/);
});

/** Proves modified and non-primary hash clicks remain native and do not mutate SPA history. */
test('does not intercept modified or non-primary hash clicks', async ({
  page,
}) => {
  await page.goto('/#tasks?scope=all&filter=全部');
  const link = page.locator('a[href="#home"]').first();
  const initialHash = await page.evaluate(() => window.location.hash);
  const initialHistoryLength = await page.evaluate(() => history.length);

  await link.click({ modifiers: ['Meta'] });
  await link.click({ modifiers: ['Control'] });
  await link.click({ button: 'middle' });

  await expect
    .poll(() => page.evaluate(() => window.location.hash))
    .toBe(initialHash);
  await expect
    .poll(() => page.evaluate(() => history.length))
    .toBe(initialHistoryLength);
});

/** Proves an active primary hash link preserves either fixed or Flow home scroll positions. */
test('prevents native scrolling for an active hash link', async ({
  page,
  isMobile,
}) => {
  await page.goto('/#home');
  const homeScrollY = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    return window.scrollY;
  });
  if (isMobile) expect(homeScrollY).toBeGreaterThan(0);
  else expect(homeScrollY).toBe(0);
  const initialHistoryLength = await page.evaluate(() => history.length);
  await page.evaluate(() => {
    document.addEventListener(
      'click',
      (event) => {
        const link = (event.target as Element | null)?.closest(
          'a[href="#home"]',
        );
        if (link)
          document.documentElement.dataset.activeHashPrevented = String(
            event.defaultPrevented,
          );
      },
      { once: true },
    );
  });

  await page.getByRole('link', { name: '首页', exact: true }).click();

  await expect(page.locator('html')).toHaveAttribute(
    'data-active-hash-prevented',
    'true',
  );
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(homeScrollY);
  await expect
    .poll(() => page.evaluate(() => history.length))
    .toBe(initialHistoryLength);
});

/** Proves in-place search updates keep the current task route eligible for later scroll restoration. */
test('restores task scroll after an in-place search route update', async ({
  page,
}) => {
  await page.goto('/#tasks?scope=all&filter=全部');
  await expect(page.locator('.task-card')).toHaveCount(12);
  await page.locator('#searchInput').fill('用户');
  await expect
    .poll(() => page.locator('.task-card').count())
    .toBeGreaterThan(1);

  const taskScrollY = await page.evaluate(() => {
    const board = document.querySelector<HTMLElement>('.board-layout');
    const topbar = document.querySelector<HTMLElement>('.topbar');
    if (!board || !topbar) throw new Error('Task layout is missing');
    const boardScrollY = Math.max(
      0,
      board.getBoundingClientRect().top +
        window.scrollY -
        topbar.getBoundingClientRect().height,
    );
    window.scrollTo(0, boardScrollY);
    return window.scrollY;
  });
  expect(taskScrollY).toBeGreaterThan(0);

  await navigateToHash(page, '#home');
  await expect(page.locator('#homeView')).toBeVisible();
  await navigateToHash(
    page,
    '#tasks?scope=all&filter=全部&q=%E7%94%A8%E6%88%B7',
  );
  await expect(page.locator('#tasksView')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(taskScrollY);
});

/** Proves task and management positions remain isolated from either responsive home mode. */
test('isolates task and admin positions from the responsive home', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  await expect(page.locator('.task-card')).toHaveCount(12);

  await page.locator('#profileButton').click();
  await page.locator('#identitySelect').selectOption('noticeboard-admin');
  await page.keyboard.press('Escape');
  await expect(page.locator('#adminNavLink')).toBeVisible();
  await expect(page.locator('.task-card')).toHaveCount(12);
  const homeScrollY = await page.evaluate(() => {
    window.scrollTo(
      0,
      Math.min(120, document.documentElement.scrollHeight - window.innerHeight),
    );
    return window.scrollY;
  });
  expect(homeScrollY).toBe(isMobile ? 120 : 0);

  await navigateToHash(page, '#tasks?scope=all&filter=全部');
  await expect(page.locator('#tasksView')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.waitForTimeout(100);
  const taskScrollY = await page.evaluate(() => {
    const board = document.querySelector<HTMLElement>('.board-layout');
    const topbar = document.querySelector<HTMLElement>('.topbar');
    if (!board || !topbar) throw new Error('Task layout is missing');
    const collapsedScrollY = Math.max(
      0,
      board.getBoundingClientRect().top +
        window.scrollY -
        topbar.getBoundingClientRect().height,
    );
    window.scrollTo(0, collapsedScrollY);
    return window.scrollY;
  });
  expect(taskScrollY).toBeGreaterThan(0);

  if (!isMobile) await page.setViewportSize({ width: 1280, height: 600 });
  await navigateToHash(page, '#admin/users');
  await expect(page.locator('#adminView')).toBeVisible();
  await expect(
    page.locator('.admin-table:visible, .admin-mobile-list:visible').first(),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const adminScrollY = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    return window.scrollY;
  });
  expect(adminScrollY).toBeGreaterThan(0);

  await navigateToHash(page, '#tasks?scope=all&filter=全部');
  await expect(page.locator('#tasksView')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(taskScrollY);

  await navigateToHash(page, '#home');
  await expect(page.locator('#homeView')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(homeScrollY);
});

/** Proves browser hash history restores the cached position of each top-level view. */
test('restores isolated positions while traversing hash history', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.task-card')).toHaveCount(12);
  const homeScrollY = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    return window.scrollY;
  });
  await navigateToHash(page, '#tasks?scope=all&filter=全部');
  await expect(page.locator('#tasksView')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.waitForTimeout(100);
  const taskScrollY = await page.evaluate(() => {
    const board = document.querySelector<HTMLElement>('.board-layout');
    const topbar = document.querySelector<HTMLElement>('.topbar');
    if (!board || !topbar) throw new Error('Task layout is missing');
    const collapsedScrollY = Math.max(
      0,
      board.getBoundingClientRect().top +
        window.scrollY -
        topbar.getBoundingClientRect().height,
    );
    window.scrollTo(0, collapsedScrollY);
    return window.scrollY;
  });
  await navigateToHash(page, '#home');
  await expect(page.locator('#homeView')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(homeScrollY);

  await page.goBack();
  await expect(page.locator('#tasksView')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(taskScrollY);
  await page.goForward();
  await expect(page.locator('#homeView')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(homeScrollY);
});

/** Proves task controls preserve the current document position while replacing cards. */
test('keeps the task page position while filtering, changing scope, and searching', async ({
  page,
  isMobile,
}) => {
  if (!isMobile) await page.setViewportSize({ width: 1440, height: 400 });
  await page.goto('/#tasks?scope=all&filter=全部');
  await expect(page.locator('.task-card')).toHaveCount(12);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await openMobileTaskFilters(page, isMobile);

  const activate = async (selector: string): Promise<void> => {
    await page.locator(selector).evaluate((element) => {
      (element as HTMLElement).click();
    });
  };
  const readTaskScroll = () => page.evaluate(() => window.scrollY);
  const initial = await page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>('#taskGrid');
    const board = document.querySelector<HTMLElement>('.board-layout');
    const topbar = document.querySelector<HTMLElement>('.topbar');
    if (!grid || !board || !topbar) throw new Error('Task layout is missing');
    const boardScrollY = Math.max(
      0,
      board.getBoundingClientRect().top +
        window.scrollY -
        topbar.getBoundingClientRect().height,
    );
    window.scrollTo({ top: boardScrollY, behavior: 'instant' });
    grid.scrollTop = 40;
    if (grid.scrollTop !== 0)
      throw new Error('Task grid unexpectedly owns a scroll layer');
    return window.scrollY;
  });
  expect(initial).toBeGreaterThan(0);
  await page.waitForTimeout(120);

  await activate('[data-filter="进行中"]');
  await expect(page.locator('.task-card')).toHaveCount(3);
  await expect.poll(() => readTaskScroll()).toEqual(initial);

  await expect
    .poll(() => page.locator('[data-scope="all"]').getAttribute('aria-pressed'))
    .toBe('true');
  await activate('[data-scope="mine"]');
  await expect(page.locator('[data-scope="mine"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect.poll(() => readTaskScroll()).toEqual(initial);

  await activate('[data-filter="全部"]');
  await expect
    .poll(() =>
      page.locator('[data-filter="全部"]').getAttribute('aria-pressed'),
    )
    .toBe('true');
  await expect.poll(() => readTaskScroll()).toEqual(initial);

  await page.locator('#searchInput').fill('用户');
  await expect(page.locator('#searchInput')).toHaveValue('用户');
  await expect
    .poll(() => page.locator('.task-card').count())
    .toBeGreaterThan(0);
  await expect.poll(() => readTaskScroll()).toEqual(initial);
});

/** Proves the mobile two-column status rail keeps its middle vertical separators. */
test('keeps mobile status rail separators between both columns', async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.reload();

  const borderWidths = await page
    .locator('.home-status-rail .stat-card')
    .evaluateAll((cards) =>
      cards.map((card) => getComputedStyle(card).borderRightWidth),
    );

  expect(borderWidths).toEqual(['1px', '0px', '1px', '0px', '1px']);
});

/** Proves create, accept, complete, reopen, replacement acceptance, and approval traverse the API. */
test('completes a reopened task with a replacement assignee', async ({
  page,
}) => {
  await page.locator('#profileButton').click();
  await page.locator('#identitySelect').selectOption('adventurer-a');
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: '任务页' }).click();
  await page.locator('#newTaskButton').click();
  await page.locator('[name="title"]').fill('替换接取者任务');
  await page.locator('[name="type"]').selectOption('bounty');
  await page.locator('[name="dueDate"]').fill('2026-09-12');
  await page
    .locator('textarea[name="description"]')
    .fill('验证重新打开后替换接取者');
  await page.locator('[name="reward"]').fill('60 金币');
  await page.getByRole('button', { name: /^发布任务/ }).click();
  await expect(page.locator('#drawerTitle')).toHaveText('替换接取者任务');

  await switchUserAndOpenTask(page, 'adventurer-b', '替换接取者任务');
  await page.getByRole('button', { name: /接取任务/ }).click();
  await page.getByRole('button', { name: /标记为已完成/ }).click();
  await switchUserAndOpenTask(page, 'adventurer-a', '替换接取者任务');
  await page.getByRole('button', { name: '验收不通过，重新打开' }).click();
  await switchUserAndOpenTask(page, 'noticeboard-master', '替换接取者任务');
  await page.getByRole('button', { name: /重新接取任务/ }).click();
  await page.getByRole('button', { name: /标记为已完成/ }).click();
  await switchUserAndOpenTask(page, 'adventurer-a', '替换接取者任务');
  await page.getByRole('button', { name: /验收通过并关闭/ }).click();

  await expect(
    page.locator('.detail-fact').filter({ hasText: '当前状态' }),
  ).toContainText('关闭');
  await expect(page.locator('.timeline-action').first()).toHaveText('关闭任务');
});

/** Proves comments remain safe, do not change task ownership, and preserve deletion attribution. */
test('comments on an open task and keeps deleted tombstones', async ({
  page,
  request,
  isMobile,
}) => {
  await page.locator('#profileButton').click();
  await page.locator('#identitySelect').selectOption('adventurer-a');
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: '任务页' }).click();
  await page.locator('#newTaskButton').click();
  await page.locator('[name="title"]').fill('评论协作任务');
  await page.locator('[name="type"]').selectOption('exploration');
  await page.locator('[name="dueDate"]').fill('2026-09-12');
  await page
    .locator('textarea[name="description"]')
    .fill('验证评论、删除占位和任务归属');
  await page.locator('[name="reward"]').fill('30 金币');
  await page.getByRole('button', { name: /^发布任务/ }).click();

  await switchUserAndOpenTask(page, 'adventurer-b', '评论协作任务');
  const commentInput = page.locator('[data-comment-input]');
  await expect(commentInput).toHaveAttribute('maxlength', '1000');
  await commentInput.fill('<img src=x onerror=alert(1)>\n第二行');
  await page.getByRole('button', { name: '发表评论' }).click();

  const newestComment = page.locator('.timeline-comment').first();
  await expect(newestComment.locator('.timeline-action')).toHaveText(
    '@adventurer-b',
  );
  await expect(newestComment.locator('.comment-content')).toHaveText(
    '<img src=x onerror=alert(1)>\n第二行',
  );
  await expect(newestComment.locator('img')).toHaveCount(0);
  await expect(
    page.evaluate(() => (window as Window & { hacked?: boolean }).hacked),
  ).resolves.toBeUndefined();
  await expect(
    page.evaluate(() => Object.keys(localStorage).sort()),
  ).resolves.toEqual(['noticeboard-user']);

  await page.locator('[data-close-drawer]').click();
  await openMobileTaskFilters(page, isMobile);
  await page.locator('[data-scope="mine"]').click();
  await expect(
    page.locator('.task-card').filter({ hasText: '评论协作任务' }),
  ).toHaveCount(0);
  await page.locator('[data-scope="all"]').click();
  await page.locator('.task-card').filter({ hasText: '评论协作任务' }).click();

  await page.getByRole('button', { name: '删除评论' }).click();
  await expect(page.locator('.comment-deleted').first()).toHaveText(
    '该评论已被@adventurer-b删除',
  );
  await expect(page.locator('#detailDrawer')).not.toContainText(
    '<img src=x onerror=alert(1)>',
  );

  await commentInput.fill('请管理员删除这条评论');
  await page.getByRole('button', { name: '发表评论' }).click();
  await switchUserAndOpenTask(page, 'noticeboard-admin', '评论协作任务');
  await page.getByRole('button', { name: '删除评论' }).click();
  await expect(page.locator('.comment-deleted').first()).toHaveText(
    '该评论已被@noticeboard-admin删除',
  );

  const tasksResponse = await request.get('/api/v1/tasks', {
    headers: { 'X-Demo-User-Id': 'noticeboard-master' },
  });
  const closedTask = (
    (await tasksResponse.json()) as Array<{
      id: string;
      title: string;
      status: string;
      version: number;
    }>
  ).find((task) => task.status === 'closed');
  expect(closedTask).toBeDefined();
  const closedComment = await request.post(
    `/api/v1/tasks/${closedTask!.id}/comments`,
    {
      headers: { 'X-Demo-User-Id': 'noticeboard-master' },
      data: { content: '关闭后不可评论', expectedVersion: closedTask!.version },
    },
  );
  expect(closedComment.status()).toBe(409);
  await switchUserAndOpenTask(page, 'noticeboard-master', closedTask!.title);
  await expect(page.locator('[data-comment-form]')).toHaveCount(0);
});

/** Proves identity and style preferences survive refresh without task data in browser storage. */
test('persists identity and visual style without local task data', async ({
  page,
}) => {
  await page.evaluate(() =>
    localStorage.setItem(
      'noticeboard-user',
      JSON.stringify({
        currentUserId: 'adventurer-b',
      }),
    ),
  );
  await page.reload();
  await page.locator('#profileButton').click();
  await expect(page.locator('#identitySelect')).toHaveValue('adventurer-b');
  await page.locator('#styleSelect').selectOption('pixel-retro');
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute(
    'data-style',
    'pixel-retro',
  );
  await expect(
    page.evaluate(() => Object.keys(localStorage).sort()),
  ).resolves.toEqual(['noticeboard-style', 'noticeboard-user']);
});

/** Proves notifications stay at the top, use the highest layer, and stack newest first. */
test('stacks notifications from the top', async ({ page }) => {
  await page.locator('#profileButton').click();
  await page.locator('#identitySelect').selectOption('noticeboard-admin');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#resetButton').click();

  const notifications = page.locator('#toast .toast-item');
  await expect(notifications).toHaveCount(2);
  await expect(notifications).toHaveText(['演示数据已恢复', '已切换当前身份']);

  const toastPosition = await page.locator('#toast').evaluate((toast) => ({
    position: getComputedStyle(toast).position,
    rect: toast.getBoundingClientRect().toJSON(),
    viewportWidth: window.innerWidth,
    zIndex: getComputedStyle(toast).zIndex,
  }));
  expect(toastPosition.position).toBe('fixed');
  expect(toastPosition.rect.top).toBeLessThan(30);
  expect(
    Math.abs(
      toastPosition.rect.left +
        toastPosition.rect.width / 2 -
        toastPosition.viewportWidth / 2,
    ),
  ).toBe(0);
  expect(toastPosition.zIndex).toBe('1000');
});

/** Proves menu, modal, and drawer preserve outside-click and Escape closing behavior. */
test('closes overlays with outside clicks and Escape priority', async ({
  page,
}) => {
  await page.locator('#profileButton').click();
  await expect(page.locator('#profilePanel')).toBeVisible();
  await page.locator('.brand').click();
  await expect(page.locator('#profilePanel')).toBeHidden();
  await page.getByRole('link', { name: '任务页' }).click();
  await page.locator('#newTaskButton').click();
  await expect(page.locator('#taskModal')).toHaveClass(/is-open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#taskModal')).not.toHaveClass(/is-open/);
  await page.locator('.task-card').first().click();
  await expect(page.locator('#detailDrawer')).toHaveClass(/is-open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#detailDrawer')).not.toHaveClass(/is-open/);
});

/** Proves hostile task text is rendered as text nodes rather than executable markup. */
test('renders user-provided task text safely', async ({ page }) => {
  await page.getByRole('link', { name: '任务页' }).click();
  await page.locator('#newTaskButton').click();
  await page.locator('[name="title"]').fill('<img src=x onerror=alert(1)>');
  await page.locator('[name="type"]').selectOption('exploration');
  await page.locator('[name="dueDate"]').fill('2026-09-12');
  await page
    .locator('textarea[name="description"]')
    .fill('<script>window.hacked=true</script>');
  await page.locator('[name="reward"]').fill('10 金币');
  await page.getByRole('button', { name: /^发布任务/ }).click();

  await expect(page.locator('#drawerTitle')).toHaveText(
    '<img src=x onerror=alert(1)>',
  );
  await expect(page.locator('#detailDrawer img')).toHaveCount(0);
  await expect(
    page.evaluate(() => (window as Window & { hacked?: boolean }).hacked),
  ).resolves.toBeUndefined();
});
