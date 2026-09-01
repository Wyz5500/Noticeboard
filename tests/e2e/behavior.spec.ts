/** Exercises the migrated UI's preserved navigation, state flow, overlays, and persistence behavior. */
import { expect, test, type Page } from '@playwright/test';

/** Closes the covering drawer, switches demo identity, and reopens the named task. */
async function switchUserAndOpenTask(
  page: Page,
  actorId: string,
  title: string,
): Promise<void> {
  if (
    await page
      .locator('#detailDrawer')
      .evaluate((drawer) => drawer.classList.contains('is-open'))
  ) {
    await page.locator('[data-close-drawer]').click();
  }
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
  await expect(page.locator('.home-stats .section-kicker')).toContainText(
    '个人任务概览',
  );
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
  await page.locator('.stat-card').nth(1).click();
  await expect(
    page.evaluate(() => decodeURI(window.location.hash)),
  ).resolves.toBe('#tasks?scope=mine&filter=未开始');
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
    await page.locator('[data-admin-sort-select="users"]').selectOption('name');
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

  await page.getByRole('link', { name: '返回管理首页' }).click();
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

/** Proves mobile management uses cards and a sticky sort control below the fixed topbar. */
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
  const sortBar = page.locator('.admin-sort-bar');
  await expect(sortBar).toBeVisible();
  await expect(sortBar).toHaveCSS('position', 'sticky');
  await expect(sortBar).toHaveCSS('top', '99px');
  await expect(
    page.locator('.admin-mobile-card .admin-record-actions').first(),
  ).toHaveCSS('justify-content', 'flex-end');
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
        sameRow: Math.abs(infoBox.top - actionsBox.top) <= 1,
        infoRight: infoBox.right,
        actionsLeft: actionsBox.left,
        buttonHeights,
      };
    });
  expect(actionAlignment.display).toBe('grid');
  expect(actionAlignment.gridTracks).toBe(2);
  expect(actionAlignment.alignItems).toBe('start');
  expect(actionAlignment.sameRow).toBe(true);
  expect(actionAlignment.infoRight).toBeLessThanOrEqual(
    actionAlignment.actionsLeft,
  );
  expect(actionAlignment.buttonHeights.every((height) => height === 38)).toBe(
    true,
  );
  const directionMarginLeft = await sortBar
    .locator('.admin-direction')
    .evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).marginLeft),
    );
  expect(directionMarginLeft).toBeGreaterThan(0);
  await sortBar
    .locator('[data-admin-sort-select="users"]')
    .selectOption('name');
  await expect(page).toHaveURL(/sort=name&direction=asc/);
  await sortBar.locator('[data-admin-direction]').click();
  await expect(page).toHaveURL(/sort=name&direction=desc/);
  await expect(page.locator('.admin-mobile-card .admin-status')).toHaveCount(
    await page.locator('.admin-mobile-card').count(),
  );

  await page.getByRole('link', { name: '返回管理首页' }).click();
  await page.getByRole('link', { name: '角色管理' }).click();
  await expect(page.locator('.admin-mobile-list')).toBeVisible();
  const roleStatusTexts = await page
    .locator('.admin-mobile-card .admin-status')
    .allTextContents();
  expect(roleStatusTexts).toContain('内置角色');
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
  expect(collapsed.clientHeight).toBeGreaterThan(expanded.clientHeight + 80);
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

/** Proves the task board opens expanded and snaps the outer page between both title states. */
test('snaps the task page between expanded and collapsed title states', async ({
  page,
}) => {
  await page.goto('/#tasks?scope=all&filter=全部');

  const layoutState = () =>
    page.evaluate(() => {
      const topbar = document.querySelector<HTMLElement>('.topbar');
      const intro = document.querySelector<HTMLElement>('.tasks-intro');
      const board = document.querySelector<HTMLElement>('.board-layout');
      if (!topbar || !intro || !board)
        throw new Error('Task layout is missing');
      return {
        scrollY: window.scrollY,
        topbarBottom: topbar.getBoundingClientRect().bottom,
        introBottom: intro.getBoundingClientRect().bottom,
        boardTop: board.getBoundingClientRect().top,
      };
    });

  await expect
    .poll(async () => (await layoutState()).boardTop)
    .toBeGreaterThan(0);
  const expanded = await layoutState();
  expect(expanded.scrollY).toBe(0);
  expect(expanded.introBottom).toBeGreaterThan(expanded.topbarBottom);
  expect(expanded.boardTop).toBeGreaterThan(expanded.topbarBottom);

  await page.locator('.board-sidebar').hover();
  await page.mouse.wheel(0, 1000);
  await expect
    .poll(async () => (await layoutState()).scrollY)
    .toBeGreaterThan(0);
  const recollapsed = await layoutState();
  expect(recollapsed.introBottom).toBeLessThanOrEqual(
    recollapsed.topbarBottom + 3,
  );
  expect(recollapsed.boardTop).toBeCloseTo(recollapsed.topbarBottom, 0);

  await page.mouse.wheel(0, -1000);
  await expect.poll(async () => (await layoutState()).scrollY).toBe(0);
  const reexpanded = await layoutState();
  expect(reexpanded.introBottom).toBeGreaterThan(reexpanded.topbarBottom);
  expect(reexpanded.boardTop).toBeGreaterThan(reexpanded.topbarBottom);
});

/** Proves entering the task page positions instantly while preserving smooth manual scrolling. */
test('opens the task page expanded with smooth scrolling enabled', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const homeScrollY = await page.evaluate(() => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: 'instant',
    });
    return window.scrollY;
  });
  expect(homeScrollY).toBeGreaterThan(0);
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const samples: number[] = [];
    window.addEventListener('scroll', () => samples.push(window.scrollY));
    (
      window as Window & { taskEntryScrollSamples?: number[] }
    ).taskEntryScrollSamples = samples;
  });
  await page.getByRole('link', { name: '任务页' }).click();

  await expect
    .poll(() =>
      page.evaluate(
        () => getComputedStyle(document.documentElement).scrollBehavior,
      ),
    )
    .toBe('smooth');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const entryScrollSamples = await page.evaluate(
    () =>
      (window as Window & { taskEntryScrollSamples?: number[] })
        .taskEntryScrollSamples ?? [],
  );
  expect(entryScrollSamples.every((scrollY) => scrollY === 0)).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const intro = document.querySelector<HTMLElement>('.tasks-intro');
        const topbar = document.querySelector<HTMLElement>('.topbar');
        if (!intro || !topbar) throw new Error('Task layout is missing');
        return (
          intro.getBoundingClientRect().bottom -
          topbar.getBoundingClientRect().bottom
        );
      }),
    )
    .toBeGreaterThan(3);
});

/** Proves leaving and re-entering the task page keeps its title visible by default. */
test('re-enters the task page with its intro expanded', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.getByRole('link', { name: '任务页' }).click();
  await expect(page.locator('.tasks-intro')).toBeVisible();

  await page.getByRole('link', { name: '首页', exact: true }).click();
  await expect(page.locator('#homeView')).toBeVisible();
  await page.getByRole('link', { name: '任务页' }).click();

  await expect
    .poll(() =>
      page.evaluate(
        () => getComputedStyle(document.documentElement).scrollBehavior,
      ),
    )
    .toBe('smooth');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const intro = document.querySelector<HTMLElement>('.tasks-intro');
        const topbar = document.querySelector<HTMLElement>('.topbar');
        if (!intro || !topbar) throw new Error('Task layout is missing');
        return (
          intro.getBoundingClientRect().bottom -
          topbar.getBoundingClientRect().bottom
        );
      }),
    )
    .toBeGreaterThan(3);
});

/** Proves arbitrary outer-page scrolling settles at the expanded or collapsed endpoint. */
test('settles intermediate outer task-page scroll positions', async ({
  page,
}) => {
  await page.goto('/#tasks?scope=all&filter=全部');
  await expect(page.locator('.task-card')).toHaveCount(12);
  await expect(page.locator('.tasks-intro')).toBeVisible();
  await expect(page.locator('.board-layout')).toBeVisible();
  await expect(page.locator('#taskGrid')).toBeVisible();
  const collapsedScrollY = await page.evaluate(() => {
    const topbar = document.querySelector<HTMLElement>('.topbar');
    const board = document.querySelector<HTMLElement>('.board-layout');
    if (!topbar || !board) throw new Error('Task layout is missing');
    return Math.max(
      0,
      board.getBoundingClientRect().top +
        window.scrollY -
        topbar.getBoundingClientRect().height,
    );
  });
  expect(collapsedScrollY).toBeGreaterThan(0);

  await page.evaluate(
    (scrollY) => window.scrollTo(0, scrollY / 2),
    collapsedScrollY,
  );
  await expect
    .poll(() =>
      page.evaluate(
        (collapsedY) =>
          Math.min(
            Math.abs(window.scrollY),
            Math.abs(window.scrollY - collapsedY),
          ),
        collapsedScrollY,
      ),
    )
    .toBeLessThan(1);
});

/** Proves the task list scrolls independently while the board chrome stays in place. */
test('scrolls task cards without moving board chrome', async ({ page }) => {
  await page.goto('/#tasks?scope=all&filter=全部');
  await expect(page.locator('.task-card')).toHaveCount(12);

  const before = await page
    .locator('.board-sidebar, .board-toolbar')
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().top),
    );
  const listMetrics = await page.locator('#taskGrid').evaluate((grid) => ({
    clientHeight: grid.clientHeight,
    scrollHeight: grid.scrollHeight,
    overflowY: getComputedStyle(grid).overflowY,
  }));

  expect(listMetrics.overflowY).toBe('auto');
  expect(listMetrics.scrollHeight).toBeGreaterThan(listMetrics.clientHeight);
  await page.locator('#taskGrid').evaluate((grid) => {
    grid.scrollTop = grid.scrollHeight;
  });
  await expect
    .poll(() => page.locator('#taskGrid').evaluate((grid) => grid.scrollTop))
    .toBeGreaterThan(0);

  const after = await page
    .locator('.board-sidebar, .board-toolbar')
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().top),
    );
  expect(after).toEqual(before);
});

/** Proves top-level view scroll positions and the task list position stay isolated across navigation. */
test('isolates scroll positions between home and task views', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.task-card')).toHaveCount(12);

  const homeScrollY = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    return window.scrollY;
  });
  expect(homeScrollY).toBeGreaterThan(0);

  await navigateToHash(page, '#tasks?scope=all&filter=全部');
  await expect(page.locator('#tasksView')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.waitForTimeout(100);

  const taskScrollState = await page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>('#taskGrid');
    const sidebar = document.querySelector<HTMLElement>('.board-sidebar');
    const board = document.querySelector<HTMLElement>('.board-layout');
    const topbar = document.querySelector<HTMLElement>('.topbar');
    if (!grid || !sidebar || !board || !topbar)
      throw new Error('Task layout is missing');
    const collapsedScrollY = Math.max(
      0,
      board.getBoundingClientRect().top +
        window.scrollY -
        topbar.getBoundingClientRect().height,
    );
    window.scrollTo(0, collapsedScrollY);
    grid.scrollTop = Math.min(120, grid.scrollHeight - grid.clientHeight);
    sidebar.scrollTop = Math.min(
      40,
      sidebar.scrollHeight - sidebar.clientHeight,
    );
    return {
      windowY: window.scrollY,
      gridY: grid.scrollTop,
      sidebarY: sidebar.scrollTop,
    };
  });
  expect(taskScrollState.windowY).toBeGreaterThan(0);
  expect(taskScrollState.gridY).toBeGreaterThan(0);

  await navigateToHash(page, '#home');
  await expect(page.locator('#homeView')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(homeScrollY);

  await navigateToHash(page, '#tasks?scope=all&filter=全部');
  await expect(page.locator('#tasksView')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(taskScrollState.windowY);
  await expect
    .poll(() => page.locator('#taskGrid').evaluate((grid) => grid.scrollTop))
    .toBe(taskScrollState.gridY);
  await expect
    .poll(() =>
      page.locator('.board-sidebar').evaluate((sidebar) => sidebar.scrollTop),
    )
    .toBe(taskScrollState.sidebarY);
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

/** Proves an active primary hash link is prevented before canonical deduplication can expose native fragment scrolling. */
test('prevents native scrolling for an active hash link', async ({ page }) => {
  await page.goto('/#home');
  const homeScrollY = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    return window.scrollY;
  });
  expect(homeScrollY).toBeGreaterThan(0);
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
  await page.locator('#searchInput').fill('北境');
  await expect(page.locator('.task-card')).toHaveCount(1);

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

  await navigateToHash(page, '#home');
  await expect(page.locator('#homeView')).toBeVisible();
  await navigateToHash(
    page,
    '#tasks?scope=all&filter=全部&q=%E5%8C%97%E5%A2%83',
  );
  await expect(page.locator('#tasksView')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(taskScrollY);
});

/** Proves the management view has its own window position instead of inheriting the task board position. */
test('isolates scroll positions across home, tasks, and admin views', async ({
  page,
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
  expect(homeScrollY).toBeGreaterThan(0);

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

/** Proves task filters, scope, and search share all current task-page scroll layers. */
test('keeps task scroll positions while filtering, changing scope, and searching', async ({
  page,
  isMobile,
}) => {
  await page.goto('/#tasks?scope=all&filter=全部');
  await expect(page.locator('.task-card')).toHaveCount(12);
  await openMobileTaskFilters(page, isMobile);

  const activate = async (selector: string): Promise<void> => {
    await page.locator(selector).evaluate((element) => {
      (element as HTMLElement).click();
    });
  };
  const readTaskScroll = () =>
    page.evaluate(() => ({
      windowY: window.scrollY,
      gridY: document.querySelector<HTMLElement>('#taskGrid')?.scrollTop ?? 0,
      sidebarY:
        document.querySelector<HTMLElement>('.board-sidebar')?.scrollTop ?? 0,
    }));
  const initial = await page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>('#taskGrid');
    const sidebar = document.querySelector<HTMLElement>('.board-sidebar');
    const board = document.querySelector<HTMLElement>('.board-layout');
    const topbar = document.querySelector<HTMLElement>('.topbar');
    if (!grid || !sidebar || !board || !topbar)
      throw new Error('Task layout is missing');
    grid.style.height = '240px';
    grid.style.maxHeight = '240px';
    sidebar.style.height = '120px';
    sidebar.style.maxHeight = '120px';
    sidebar.style.overflowY = 'auto';
    if (!sidebar.querySelector('[data-scroll-test-spacer]')) {
      const spacer = document.createElement('div');
      spacer.dataset.scrollTestSpacer = 'true';
      spacer.style.height = '400px';
      sidebar.append(spacer);
    }
    if (grid.scrollHeight <= grid.clientHeight)
      throw new Error('Task grid is not scrollable');
    if (sidebar.scrollHeight <= sidebar.clientHeight)
      throw new Error('Task sidebar is not scrollable');
    const collapsedScrollY = Math.max(
      0,
      board.getBoundingClientRect().top +
        window.scrollY -
        topbar.getBoundingClientRect().height,
    );
    window.scrollTo({ top: collapsedScrollY, behavior: 'instant' });
    grid.scrollTop = Math.min(40, grid.scrollHeight - grid.clientHeight);
    sidebar.scrollTop = Math.min(
      25,
      sidebar.scrollHeight - sidebar.clientHeight,
    );
    return {
      windowY: window.scrollY,
      gridY: grid.scrollTop,
      sidebarY: sidebar.scrollTop,
    };
  });
  expect(initial.windowY).toBeGreaterThan(0);
  expect(initial.gridY).toBeGreaterThan(0);
  expect(initial.sidebarY).toBeGreaterThan(0);
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
