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
  await expect(page.locator('.stat-label')).toHaveText([
    '我的任务',
    '未开始',
    '进行中',
    '已完成',
    '重新打开',
    '已关闭',
  ]);
  await expect(page.locator('.stat-foot').first()).toHaveText('MY QUESTS');
  const desktopStatusColumns = await page
    .locator('.stats-row')
    .evaluate(
      (row) => getComputedStyle(row).gridTemplateColumns.split(' ').length,
    );
  expect(desktopStatusColumns).toBe(isMobile ? 2 : 3);
  const statPaddings = await page
    .locator('.stat-card')
    .evaluateAll((cards) =>
      cards.slice(0, 2).map((card) => getComputedStyle(card).paddingLeft),
    );
  expect(statPaddings[0]).toBe(statPaddings[1]);
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

/** Proves the home status shortcuts use three desktop columns and preserve responsive breakpoints. */
test('uses responsive home status-grid columns', async ({ page }) => {
  await page.goto('/');

  const columnsAt = async (width: number): Promise<number> => {
    await page.setViewportSize({ width, height: 915 });
    return page
      .locator('.stats-row')
      .evaluate(
        (row) => getComputedStyle(row).gridTemplateColumns.split(' ').length,
      );
  };

  await expect(page.locator('.stat-card')).toHaveCount(6);
  await expect.poll(() => columnsAt(1440)).toBe(3);
  await expect.poll(() => columnsAt(840)).toBe(3);
  await expect.poll(() => columnsAt(620)).toBe(2);
});

/** Proves the task grid keeps three desktop columns, two tablet columns, and one mobile column. */
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
  await expect.poll(() => columnsAt(840)).toBe(2);
  await expect.poll(() => columnsAt(620)).toBe(1);
});

/** Proves the mobile two-column status grid keeps its middle vertical separators. */
test('keeps mobile status grid separators between both columns', async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.reload();

  const borderWidths = await page
    .locator('.stat-card')
    .evaluateAll((cards) =>
      cards.slice(0, 5).map((card) => getComputedStyle(card).borderRightWidth),
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
