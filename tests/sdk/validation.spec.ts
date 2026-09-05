/** Checks every published read field against independent OpenAPI-driven corruptions. */
import { readFileSync } from 'node:fs';
import { expect, expectTypeOf, it } from 'vitest';
import {
  createNoticeboardClient,
  NoticeboardProtocolError,
} from '../../apps/cli/src/sdk/index.js';
import type {
  AdminOverview,
  AdminUser,
  AdminRole,
  AdminPermission,
  Identity,
  Task,
  TaskActivity,
  TaskComment,
} from '../../apps/cli/src/sdk/index.js';
import type {
  AdminOverviewResponseDto,
  AdminUserResponseDto,
  AdminRoleResponseDto,
  PermissionResponseDto,
  ActorResponseDto,
  TaskResponseDto,
  TaskActivityResponseDto,
  TaskCommentResponseDto,
} from '../../apps/cli/src/sdk/internal/generated/transport.js';
import { activity, comment, identity, task, tombstone } from './fixtures.js';

interface Schema {
  type?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  enum?: unknown[];
  nullable?: boolean;
}

const artifact = JSON.parse(
  readFileSync('openapi/v1/noticeboard.openapi.json', 'utf8'),
) as { components: { schemas: Record<string, Schema> } };

/** Sends one candidate payload through the public SDK with the real generated operation. */
function readTask(body: unknown) {
  return createNoticeboardClient({
    baseUrl: 'https://example.test',
    fetch: async () => Response.json(body),
  }).tasks.get('task-1');
}

/** Makes the hand-maintained public field contracts drift visibly when the generated wire contract changes. */
it('preserves the structural wire types without exporting generated symbols', () => {
  expectTypeOf<AdminOverview>().toEqualTypeOf<AdminOverviewResponseDto>();
  expectTypeOf<AdminUser>().toEqualTypeOf<AdminUserResponseDto>();
  expectTypeOf<AdminRole>().toEqualTypeOf<AdminRoleResponseDto>();
  expectTypeOf<AdminPermission>().toEqualTypeOf<PermissionResponseDto>();
  expectTypeOf<Task>().toEqualTypeOf<TaskResponseDto>();
  expectTypeOf<Identity>().toEqualTypeOf<ActorResponseDto>();
  expectTypeOf<TaskActivity>().toEqualTypeOf<TaskActivityResponseDto>();
  expectTypeOf<TaskComment>().toEqualTypeOf<TaskCommentResponseDto>();
});

/** Covers each nested read schema without duplicating the validator's field inventory. */
it.each([
  ['TaskResponseDto', task, (value: unknown) => value],
  [
    'ActorResponseDto',
    identity,
    (value: unknown) => ({ ...task, publisher: value }),
  ],
  [
    'TaskActivityResponseDto',
    activity,
    (value: unknown) => ({ ...task, timeline: [value] }),
  ],
  [
    'TaskCommentResponseDto',
    comment,
    (value: unknown) => ({ ...task, timeline: [value] }),
  ],
] as const)(
  'validates every known field in %s',
  async (schemaName, fixture, wrap) => {
    const schema = artifact.components.schemas[schemaName]!;
    for (const [field, fieldSchema] of Object.entries(schema.properties!)) {
      const invalid = { ...fixture, [field]: { invalid: true } };
      await expect(
        readTask(wrap(invalid)),
        `${schemaName}.${field} type`,
      ).rejects.toBeInstanceOf(NoticeboardProtocolError);
      if (schema.required?.includes(field)) {
        const missing: Record<string, unknown> = { ...fixture };
        delete missing[field];
        await expect(
          readTask(wrap(missing)),
          `${schemaName}.${field} required`,
        ).rejects.toBeInstanceOf(NoticeboardProtocolError);
      }
      if (fieldSchema.enum) {
        await expect(
          readTask(wrap({ ...fixture, [field]: 'unknown-enum' })),
          `${schemaName}.${field} enum`,
        ).rejects.toBeInstanceOf(NoticeboardProtocolError);
        for (const value of fieldSchema.enum) {
          await expect(
            readTask(wrap({ ...fixture, [field]: value })),
          ).resolves.toBeDefined();
        }
      }
      if (!fieldSchema.nullable) {
        await expect(
          readTask(wrap({ ...fixture, [field]: null })),
          `${schemaName}.${field} nullable`,
        ).rejects.toBeInstanceOf(NoticeboardProtocolError);
      }
    }
  },
);

/** Accepts additive HTTP changes while preventing unknown fields from becoming accidental SDK exports. */
it('maps known fields only and retains edited comments and tombstones', async () => {
  const output = await readTask({
    ...task,
    extra: 'ignored',
    publisher: { ...identity, extra: true },
    timeline: [
      { ...activity, extra: true },
      { ...comment, extra: true },
      { ...tombstone, extra: true },
    ],
  });
  expect(output).toEqual(task);
  const withoutPermissions = { ...identity, permissions: undefined };
  expect(
    (
      await readTask({
        ...task,
        publisher: withoutPermissions,
        assignee: identity,
      })
    ).publisher,
  ).not.toHaveProperty('permissions');
});

/** Rejects invalid nested arrays and closed permission enums instead of trusting TypeScript casts. */
it.each([
  { ...task, assignee: { ...identity, id: 1 } },
  { ...task, publisher: { ...identity, permissions: ['unknown'] } },
  { ...task, publisher: { ...identity, permissions: 'tasks.view' } },
  { ...task, timeline: [null] },
  { ...task, timeline: [{ ...activity, kind: 'future-event' }] },
])('rejects malformed nested structures', async (body) => {
  await expect(readTask(body)).rejects.toMatchObject({
    kind: 'protocol',
    status: 200,
  });
});

/** Ensures list methods apply the same complete validation as task details. */
it('validates every task and identity in list responses', async () => {
  const fetch: typeof globalThis.fetch = async (input) =>
    Response.json(
      (input instanceof Request ? input.url : input.toString()).endsWith(
        '/users',
      )
        ? [identity, { ...identity, username: null }]
        : [task, { ...task, version: '4' }],
    );
  const client = createNoticeboardClient({
    baseUrl: 'https://example.test',
    fetch,
  });
  await expect(client.tasks.list()).rejects.toBeInstanceOf(
    NoticeboardProtocolError,
  );
  await expect(client.identities.list()).rejects.toBeInstanceOf(
    NoticeboardProtocolError,
  );
});
