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

const publisher = GuildState.USERS.publisher;
const adventurerA = GuildState.USERS.adventurerA;
const now = '2026-08-29T12:00:00.000Z';

function taskWith(status) {
  const created = GuildState.createTask({
    title: '测试任务',
    type: '探索',
    description: '测试用任务描述',
    reward: '100 G',
    dueDate: '2026-09-01'
  }, publisher, now);
  if (!status || status === GuildState.STATUS.NOT_STARTED) return created;
  return created;
}

const created = taskWith();
assertEqual(created.status, GuildState.STATUS.NOT_STARTED, 'new tasks start as not started');
assertEqual(created.timeline[0].action, '创建任务', 'creation is recorded in timeline');

let tasks = [created];
tasks = GuildState.applyAction(tasks, created.id, 'accept', adventurerA, now);
assertEqual(tasks[0].status, GuildState.STATUS.IN_PROGRESS, 'accepting starts a task');
assertEqual(tasks[0].assignee.id, adventurerA.id, 'accepting records the adventurer');
assertEqual(tasks[0].timeline[1].action, '接取任务', 'acceptance is recorded in timeline');

tasks = GuildState.applyAction(tasks, created.id, 'complete', adventurerA, now);
assertEqual(tasks[0].status, GuildState.STATUS.COMPLETED, 'assignee can mark in-progress task complete');

tasks = GuildState.applyAction(tasks, created.id, 'approve', publisher, now);
assertEqual(tasks[0].status, GuildState.STATUS.CLOSED, 'publisher approval closes a task');
assert(tasks[0].timeline.some(event => event.action === '验收通过'), 'approval is recorded in timeline');
assert(tasks[0].timeline.some(event => event.action === '关闭任务'), 'closing is recorded in timeline');

let retryTask = taskWith();
let retryTasks = GuildState.applyAction([retryTask], retryTask.id, 'accept', adventurerA, now);
retryTasks = GuildState.applyAction(retryTasks, retryTask.id, 'complete', adventurerA, now);
let reopened = GuildState.applyAction(retryTasks, retryTask.id, 'reopen', publisher, now)[0];
assertEqual(reopened.status, GuildState.STATUS.REOPENED, 'publisher can reopen a completed task');
assertEqual(reopened.assignee.id, adventurerA.id, 'reopening keeps the original assignee');

reopened = GuildState.applyAction([reopened], reopened.id, 'accept', adventurerA, now)[0];
assertEqual(reopened.status, GuildState.STATUS.IN_PROGRESS, 'reopened task can continue');

let rejected = false;
try {
  GuildState.applyAction([reopened], reopened.id, 'approve', adventurerA, now);
} catch (error) {
  rejected = true;
}
assert(rejected, 'an adventurer cannot approve a task');

console.log('state tests passed');
