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
  assertEqual(Object.prototype.hasOwnProperty.call(user, 'roleLabel'), false, 'demo identities do not carry a redundant role label');
  const published = GuildState.createTask({
    title: '统一身份任务',
    type: '探索',
    description: '任何演示用户都可以发布的任务',
    reward: '10 G',
    dueDate: '2026-09-01'
  }, user, now);
  assertEqual(published.publisher.id, user.id, 'task records the actual publishing user');
  assertEqual(published.timeline[0].actorRole, user.role, 'task timeline retains the actor role for compatibility');
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
assertEqual(GuildState.latestStatusActorId(created), userA.id, 'a newly created task belongs to its publisher');
assertEqual(GuildState.filterTasks([created], 'mine', '全部', userA).length, 1, 'an unaccepted task is included for its publisher');
assertEqual(GuildState.filterTasks([created], 'mine', '全部', userB).length, 0, 'an unaccepted task is excluded for other users');
tasks = GuildState.applyAction(tasks, created.id, 'accept', userB, now);
assertEqual(tasks[0].status, GuildState.STATUS.IN_PROGRESS, 'accepting starts a task');
assertEqual(tasks[0].assignee.id, userB.id, 'accepting records the current user');
assertEqual(tasks[0].timeline[1].action, '接取任务', 'acceptance is recorded in timeline');
assertEqual(GuildState.latestStatusActorId(tasks[0]), userB.id, 'acceptance moves task ownership to the latest actor');
assertEqual(GuildState.filterTasks(tasks, 'mine', '全部', userB).length, 1, 'accepted task is included for the latest actor');
assertEqual(GuildState.filterTasks(tasks, 'mine', '全部', userA).length, 0, 'accepted task is excluded for the former publisher');

tasks = GuildState.applyAction(tasks, created.id, 'complete', userB, now);
assertEqual(tasks[0].status, GuildState.STATUS.COMPLETED, 'assignee can mark in-progress task complete');
assertEqual(GuildState.latestStatusActorId(tasks[0]), userB.id, 'completion keeps ownership with the completing actor');
assertEqual(GuildState.filterTasks(tasks, 'mine', GuildState.STATUS.COMPLETED, userB).length, 1, 'completed task is included for the completing actor');

tasks = GuildState.applyAction(tasks, created.id, 'approve', userA, now);
assertEqual(tasks[0].status, GuildState.STATUS.CLOSED, 'publisher approval closes a task');
assert(tasks[0].timeline.some(event => event.action === '验收通过'), 'approval is recorded in timeline');
assert(tasks[0].timeline.some(event => event.action === '关闭任务'), 'closing is recorded in timeline');
assertEqual(GuildState.latestStatusActorId(tasks[0]), userA.id, 'approval and closing move ownership to the publisher');
assertEqual(GuildState.filterTasks(tasks, 'mine', GuildState.STATUS.CLOSED, userA).length, 1, 'closed task is included for the latest actor');
assertEqual(GuildState.filterTasks(tasks, 'mine', GuildState.STATUS.CLOSED, userB).length, 0, 'closed task is excluded for the former assignee');

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
assertEqual(GuildState.latestStatusActorId(reopened), userA.id, 'reopening makes the publisher the latest actor');
assertEqual(GuildState.filterTasks([reopened], 'mine', GuildState.STATUS.REOPENED, userA).length, 1, 'reopened task is included for the publisher');
assertEqual(GuildState.filterTasks([reopened], 'mine', GuildState.STATUS.REOPENED, userB).length, 0, 'reopened task is excluded for the old assignee');
assert(GuildState.canAct(reopened, 'close', userA), 'task publisher can close a reopened task');
const directlyClosed = GuildState.applyAction([reopened], reopened.id, 'close', userA, now)[0];
assertEqual(directlyClosed.status, GuildState.STATUS.CLOSED, 'publisher can directly close a reopened task');
assertEqual(GuildState.latestStatusActorId(directlyClosed), userA.id, 'direct closing makes the publisher the latest actor');
assertEqual(GuildState.filterTasks([directlyClosed], 'mine', GuildState.STATUS.CLOSED, userB).length, 0, 'direct closing does not return the task to the old assignee');

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
assertEqual(GuildState.latestStatusActorId(reopenedForReplacement[0]), userC.id, 'reacceptance makes the replacement assignee the latest actor');

let publisherTask = taskWith();
publisherTask = GuildState.applyAction([publisherTask], publisherTask.id, 'accept', userA, now);
publisherTask = GuildState.applyAction(publisherTask, publisherTask[0].id, 'complete', userA, now);
publisherTask = GuildState.applyAction(publisherTask, publisherTask[0].id, 'approve', userA, now);
assertEqual(publisherTask[0].status, GuildState.STATUS.CLOSED, 'publisher can accept, complete, and approve their own task');

assertEqual(GuildState.taskRouteHash('进行中'), '#tasks?scope=all&filter=进行中', 'status shortcut creates the expected task route hash');
assertEqual(GuildState.taskRouteHash('进行中', 'mine'), '#tasks?scope=mine&filter=进行中', 'mine status shortcut creates the mine task route hash');

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
assertEqual(myTasks.length, 1, 'my task filtering only returns tasks owned by the latest timeline actor');
assert(myTasks.every(task => GuildState.latestStatusActorId(task) === userB.id), 'my task filtering matches the latest timeline actor');
const myCompleted = GuildState.filterTasks(seededTasks, 'mine', GuildState.STATUS.COMPLETED, userB);
assertEqual(myCompleted.length, 0, 'my completed filtering excludes another user\'s completed task');
assertEqual(GuildState.filterOptions('mine').join('|'), ['全部', '未开始', '进行中', '已完成', '重新打开', '关闭'].join('|'), 'my task filters include every latest status');

let reopenedOverview = taskWith();
reopenedOverview = GuildState.applyAction([reopenedOverview], reopenedOverview.id, 'accept', userB, now);
reopenedOverview = GuildState.applyAction(reopenedOverview, reopenedOverview[0].id, 'complete', userB, now);
reopenedOverview = GuildState.applyAction(reopenedOverview, reopenedOverview[0].id, 'reopen', userA, now);
const activeOverview = GuildState.filterTasks(reopenedOverview, 'all', GuildState.STATUS.IN_PROGRESS, userB);
assertEqual(activeOverview.length, 0, 'active filtering excludes reopened tasks');
const reopenedOverviewFilter = GuildState.filterTasks(reopenedOverview, 'all', GuildState.STATUS.REOPENED, userB);
assertEqual(reopenedOverviewFilter.length, 1, 'reopened filtering only includes reopened tasks');

const missingTimeline = taskWith();
missingTimeline.timeline = [];
assertEqual(GuildState.latestStatusActorId(missingTimeline), null, 'a task without a timeline has no latest actor');
assertEqual(GuildState.filterTasks([missingTimeline], 'mine', '全部', userA).length, 0, 'a task without a timeline is excluded from every mine list');

const invalidLatestActor = taskWith();
invalidLatestActor.timeline.push({ action: '异常事件', actorId: 'unknown-user' });
assertEqual(GuildState.latestStatusActorId(invalidLatestActor), null, 'an invalid latest actor is ignored');
assertEqual(GuildState.filterTasks([invalidLatestActor], 'mine', '全部', userA).length, 0, 'an invalid latest actor is excluded from every mine list');
assertEqual(GuildState.filterTasks([created], 'mine', '全部', null).length, 0, 'an invalid current user has no mine tasks');

const memoryStorage = {
  value: null,
  getItem() { return this.value; },
  setItem(key, value) { this.value = value; }
};
const persistedState = { tasks: seededTasks, currentUserId: userB.id };
GuildState.save(persistedState, memoryStorage);
const loadedState = GuildState.load(memoryStorage);
assertEqual(GuildState.filterTasks(loadedState.tasks, 'mine', '全部', userB).length, 1, 'persisted tasks retain timeline-based mine ownership');

const styles = readFile('styles.css');
assert(styles.indexOf('.filter-button[hidden] { display: none; }') !== -1, 'hidden mine-task filters are removed from the visible filter list');

const app = readFile('app.js');
assert(app.indexOf("user.role === 'publisher'") === -1, 'publishing is not gated by a publisher role');
assert(app.indexOf('请先切换为任务发布者') === -1, 'publishing does not ask users to switch roles');
assert(app.indexOf("var myTasks = GuildState.filterTasks(state.tasks, 'mine', '全部', user);") !== -1, 'home stats use the current user mine scope');
assert(app.indexOf("activeScope = 'mine';") !== -1, 'home stat shortcuts use the mine scope');

const page = readFile('index.html');
assert(page.indexOf('id="profileMenu"') !== -1, 'the page includes a profile menu container');
assert(page.indexOf('id="profileButton"') !== -1, 'the page includes a profile menu button');
assert(page.indexOf('aria-haspopup="dialog"') !== -1, 'the profile button exposes its panel relationship');
assert(page.indexOf('id="profilePanel"') !== -1, 'the page includes a profile menu panel');
assert(page.indexOf('role="dialog"') !== -1, 'the profile panel uses dialog semantics for its form controls');
assert(page.indexOf('id="activeRole"') === -1, 'the redundant role label is removed from the page');
assert(page.indexOf('class="identity-switcher"') === -1, 'the standalone identity switcher is removed from the page');
assert(page.indexOf('<span class="stat-label">我的任务</span>') !== -1, 'the total home stat is labeled as my tasks');
assert(page.indexOf('<div class="app-shell" id="top">') !== -1, 'the top anchor points to the page shell');
assert(page.indexOf('<header class="topbar" id="home">') !== -1, 'the home anchor points to the topbar');
assert(page.indexOf('<main id="top">') === -1, 'the main content is not used as the top anchor');

console.log('state tests passed');
