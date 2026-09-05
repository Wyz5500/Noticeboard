/** Runs from an isolated npm installation to exercise two independent clients against one real server. */
import assert from 'node:assert/strict';
import { createNoticeboardClient } from 'noticeboard-sdk-local';

const baseUrl = process.argv[2];
let writes = 0;
const first = createNoticeboardClient({
  baseUrl,
  getHeaders: () => ({ 'X-Demo-User-Id': 'noticeboard-master' }),
});
const second = createNoticeboardClient({
  baseUrl,
  getHeaders: () => ({ 'X-Demo-User-Id': 'noticeboard-admin' }),
  fetch: (input, init) => {
    if (init?.method === 'POST') writes++;
    return fetch(input, init);
  },
});
const permissions = await Promise.allSettled([
  first.admin.overview(),
  second.admin.overview(),
]);
assert.equal(permissions[0].status, 'rejected');
assert.equal(permissions[0].reason.status, 403);
assert.equal(permissions[1].status, 'fulfilled');
const created = await first.tasks.create({
  title: '独立 npm 客户端互操作',
  type: 'exploration',
  description: '共享 API 合同',
  reward: '测试',
  dueDate: '2026-09-10',
});
const [a, b] = await Promise.all([
  first.tasks.get(created.id),
  second.tasks.get(created.id),
]);
assert.deepEqual(a, b);
const updated = await first.comments.create(a.id, {
  content: '第一个客户端',
  expectedVersion: a.version,
});
await assert.rejects(
  second.comments.create(b.id, {
    content: '不应被重放',
    expectedVersion: b.version,
  }),
  { kind: 'api', status: 409 },
);
assert.equal(writes, 1);
const afterConflict = await second.tasks.get(b.id);
assert.deepEqual(afterConflict, updated);
assert.equal(
  afterConflict.timeline.some((event) => event.content === '不应被重放'),
  false,
);
const final = await second.comments.create(b.id, {
  content: '第二个客户端显式刷新后提交',
  expectedVersion: afterConflict.version,
});
assert.equal(final.version, created.version + 2);
assert.deepEqual(
  final.timeline
    .filter((event) => event.kind === 'comment')
    .map((event) => event.actor.id),
  ['noticeboard-master', 'noticeboard-admin'],
);
assert.deepEqual(await first.tasks.get(a.id), final);
process.stdout.write(JSON.stringify({ id: final.id, version: final.version }));
