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

/** Restores deterministic server and browser state before each independent UI flow. */
test.beforeEach(async ({ page, request }) => {
  await request.post('/api/v1/demo/reset', {
    headers: { 'X-Demo-User-Id': 'guild-master' },
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

/** Proves entering the task page leaves the title visible and preserves smooth scrolling. */
test('opens the task page expanded with smooth scrolling enabled', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.getByRole('link', { name: '任务页' }).click();

  await expect
    .poll(() =>
      page.evaluate(
        () => getComputedStyle(document.documentElement).scrollBehavior,
      ),
    )
    .toBe('smooth');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
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
  await switchUserAndOpenTask(page, 'guild-master', '替换接取者任务');
  await page.getByRole('button', { name: /重新接取任务/ }).click();
  await page.getByRole('button', { name: /标记为已完成/ }).click();
  await switchUserAndOpenTask(page, 'adventurer-a', '替换接取者任务');
  await page.getByRole('button', { name: /验收通过并关闭/ }).click();

  await expect(
    page.locator('.detail-fact').filter({ hasText: '当前状态' }),
  ).toContainText('关闭');
  await expect(page.locator('.timeline-action').first()).toHaveText('关闭任务');
});

/** Proves identity and style preferences survive refresh while legacy task storage is removed. */
test('persists identity and visual style without local task data', async ({
  page,
}) => {
  await page.evaluate(
    () => (
      localStorage.removeItem('minecraft-guild-board-user'),
      localStorage.setItem(
        'minecraft-guild-board-state',
        JSON.stringify({
          currentUserId: 'adventurer-b',
          tasks: [{ title: '不得保留' }],
        }),
      )
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
    page.evaluate(() => localStorage.getItem('minecraft-guild-board-state')),
  ).resolves.toBeNull();
});

/** Proves notifications stay at the top, use the highest layer, and stack newest first. */
test('stacks notifications from the top', async ({ page }) => {
  await page.locator('#profileButton').click();
  await page.locator('#identitySelect').selectOption('adventurer-b');
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
