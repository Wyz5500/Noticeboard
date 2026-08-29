ObjC.import('Foundation');

function readFile(path) {
  const text = $.NSString.stringWithContentsOfFileEncodingError(
    path,
    $.NSUTF8StringEncoding,
    null
  );
  if (!text) throw new Error('Could not read ' + path);
  return ObjC.unwrap(text);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, message + '\nExpected: ' + expected + '\nActual: ' + actual);
}

eval(readFile('app-state.js'));

const demoUsers = Object.keys(GuildState.USERS).map(key => GuildState.USERS[key]);
const userA = demoUsers[0];
const userB = demoUsers[1];
const userC = demoUsers[2];
const now = '2026-08-29T12:00:00.000Z';

demoUsers.forEach(user => {
  assertEqual(user.role, 'user', 'every demo identity is a regular user');
  assertEqual(user.roleLabel, '普通用户', 'every demo identity uses the regular user label');
  const published = GuildState.createTask({
    title: '统一身份任务',
    type: '探索',
    description: '任何演示用户都可以发布的任务',
    reward: '10 G',
    dueDate: '2026-09-01'
  }, user, now);
  assertEqual(published.publisher.id, user.id, 'task records the actual publishing user');
});

demoUsers.forEach(user => {
  const available = GuildState.createTask({
    title: '接取测试任务',
    type: '采集',
    description: '任何演示用户都可以接取的任务',
    reward: '10 G',
    dueDate: '2026-09-01'
  }, userA, now);
  const accepted = GuildState.applyAction([available], available.id, 'accept', user, now)[0];
  assertEqual(accepted.assignee.id, user.id, 'every demo user can accept a task');
});

function taskWith(publisher) {
  const created = GuildState.createTask({
    title: '测试任务',
    type: '探索',
    description: '测试用任务描述',
    reward: '100 G',
    dueDate: '2026-09-01'
  }, publisher || userA, now);
  return created;
}

const created = taskWith();
assertEqual(created.status, GuildState.STATUS.NOT_STARTED, 'new tasks start as not started');
assertEqual(created.timeline[0].action, '创建任务', 'creation is recorded in timeline');

let tasks = [created];
tasks = GuildState.applyAction(tasks, created.id, 'accept', userB, now);
assertEqual(tasks[0].status, GuildState.STATUS.IN_PROGRESS, 'accepting starts a task');
assertEqual(tasks[0].assignee.id, userB.id, 'accepting records the current user');
assertEqual(tasks[0].timeline[1].action, '接取任务', 'acceptance is recorded in timeline');

tasks = GuildState.applyAction(tasks, created.id, 'complete', userB, now);
assertEqual(tasks[0].status, GuildState.STATUS.COMPLETED, 'assignee can mark in-progress task complete');

tasks = GuildState.applyAction(tasks, created.id, 'approve', userA, now);
assertEqual(tasks[0].status, GuildState.STATUS.CLOSED, 'publisher approval closes a task');
assert(tasks[0].timeline.some(event => event.action === '验收通过'), 'approval is recorded in timeline');
assert(tasks[0].timeline.some(event => event.action === '关闭任务'), 'closing is recorded in timeline');

let retryTask = taskWith();
let retryTasks = GuildState.applyAction([retryTask], retryTask.id, 'accept', userB, now);
retryTasks = GuildState.applyAction(retryTasks, retryTask.id, 'complete', userB, now);
demoUsers.slice(1).forEach(user => {
  ['approve', 'reopen', 'close'].forEach(action => {
    assert(!GuildState.canAct(retryTasks[0], action, user), 'non-publisher cannot ' + action + ' another user\'s task');
  });
});
let reopened = GuildState.applyAction(retryTasks, retryTask.id, 'reopen', userA, now)[0];
assertEqual(reopened.status, GuildState.STATUS.REOPENED, 'task publisher can reopen a completed task');
assertEqual(reopened.assignee.id, userB.id, 'reopening keeps the original assignee');
assert(GuildState.canAct(reopened, 'close', userA), 'task publisher can close a reopened task');

reopened = GuildState.applyAction([reopened], reopened.id, 'accept', userB, now)[0];
assertEqual(reopened.status, GuildState.STATUS.IN_PROGRESS, 'reopened task can continue');

let rejected = false;
try {
  GuildState.applyAction([reopened], reopened.id, 'approve', userB, now);
} catch (error) {
  rejected = true;
}
assert(rejected, 'a non-publisher cannot approve a task');

let reopenedForReplacement = taskWith();
reopenedForReplacement = GuildState.applyAction([reopenedForReplacement], reopenedForReplacement.id, 'accept', userB, now);
reopenedForReplacement = GuildState.applyAction(reopenedForReplacement, reopenedForReplacement[0].id, 'complete', userB, now);
reopenedForReplacement = GuildState.applyAction(reopenedForReplacement, reopenedForReplacement[0].id, 'reopen', userA, now);
reopenedForReplacement = GuildState.applyAction(reopenedForReplacement, reopenedForReplacement[0].id, 'accept', userC, now);
assertEqual(reopenedForReplacement[0].assignee.id, userC.id, 'any regular user can accept a reopened task and replace the assignee');
assertEqual(reopenedForReplacement[0].timeline.length, 5, 'reaccepting preserves the complete prior timeline');
assertEqual(reopenedForReplacement[0].timeline[3].action, '重新打开', 'reopening remains in the timeline before reacceptance');

let publisherTask = taskWith();
publisherTask = GuildState.applyAction([publisherTask], publisherTask.id, 'accept', userA, now);
publisherTask = GuildState.applyAction(publisherTask, publisherTask[0].id, 'complete', userA, now);
publisherTask = GuildState.applyAction(publisherTask, publisherTask[0].id, 'approve', userA, now);
assertEqual(publisherTask[0].status, GuildState.STATUS.CLOSED, 'publisher can accept, complete, and approve their own task');

assertEqual(GuildState.taskRouteHash('进行中'), '#tasks?scope=all&filter=进行中', 'status shortcut creates the expected task route hash');

const route = GuildState.parseTaskRoute('#tasks?scope=all&filter=进行中');
assertEqual(route.view, 'tasks', 'task route parses its view');
assertEqual(route.scope, 'all', 'task route parses its scope');
assertEqual(route.filter, '进行中', 'task route parses its status filter');
assertEqual(GuildState.resetTaskRoute(), '#tasks?scope=all&filter=全部', 'reset returns to the default all-task route');

const seededTasks = GuildState.createSeedTasks();
const globalActive = GuildState.filterTasks(seededTasks, 'all', GuildState.STATUS.IN_PROGRESS, userB);
assertEqual(globalActive.length, 1, 'global status filtering returns all matching tasks');
assertEqual(globalActive[0].id, 'task-outpost', 'global status filtering does not depend on current identity');
const myTasks = GuildState.filterTasks(seededTasks, 'mine', '全部', userB);
assertEqual(myTasks.length, 2, 'my task filtering only returns tasks assigned to current user');
assert(myTasks.every(task => task.assignee.id === userB.id), 'my task filtering matches the current assignee');
const myCompleted = GuildState.filterTasks(seededTasks, 'mine', GuildState.STATUS.COMPLETED, userB);
assertEqual(myCompleted.length, 0, 'my completed filtering excludes another user\'s completed task');
assertEqual(GuildState.filterOptions('mine').join('|'), ['全部', '未开始', '进行中', '已完成', '重新打开', '关闭'].join('|'), 'my task filters include every assigned task status');

let reopenedOverview = taskWith();
reopenedOverview = GuildState.applyAction([reopenedOverview], reopenedOverview.id, 'accept', userB, now);
reopenedOverview = GuildState.applyAction(reopenedOverview, reopenedOverview[0].id, 'complete', userB, now);
reopenedOverview = GuildState.applyAction(reopenedOverview, reopenedOverview[0].id, 'reopen', userA, now);
const activeOverview = GuildState.filterTasks(reopenedOverview, 'all', GuildState.STATUS.IN_PROGRESS, userB);
assertEqual(activeOverview.length, 1, 'active filtering includes reopened tasks');

const styles = readFile('styles.css');
assert(styles.indexOf('.filter-button[hidden] { display: none; }') !== -1, 'hidden mine-task filters are removed from the visible filter list');

const app = readFile('app.js');
assert(app.indexOf("user.role === 'publisher'") === -1, 'publishing is not gated by a publisher role');
assert(app.indexOf('请先切换为任务发布者') === -1, 'publishing does not ask users to switch roles');

const page = readFile('index.html');
assert(page.indexOf('id="activeRole">普通用户</span>') !== -1, 'the page uses the regular user identity label');
assert(page.indexOf('<div class="app-shell" id="top">') !== -1, 'the top anchor points to the page shell');
assert(page.indexOf('<header class="topbar" id="home">') !== -1, 'the home anchor points to the topbar');
assert(page.indexOf('<main id="top">') === -1, 'the main content is not used as the top anchor');

console.log('state tests passed');
