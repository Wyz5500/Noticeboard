/** Read-response mappings mirror tracked OpenAPI while owning independent public SDK types. */
import type {
  Identity,
  Task,
  TaskActivity,
  TaskComment,
  TaskTimelineEvent,
} from '../models.js';
import {
  array,
  boolean,
  enumeration,
  nullable,
  number,
  object,
  optional,
  record,
  string,
} from './decoders.js';
import type { Decoder } from './decoders.js';

const permission = enumeration([
  'system.manage',
  'tasks.view',
  'tasks.create',
  'tasks.accept',
  'tasks.complete',
  'tasks.review',
  'tasks.close',
  'demo.reset',
]);

/** Validates demo actors, including optional permissions, without adding identity defaults. */
export const decodeIdentity: Decoder<Identity> = object<Identity>({
  id: string,
  name: string,
  username: string,
  role: string,
  roleLabel: string,
  permissions: optional(array(permission)),
});

const activity = object<TaskActivity>({
  kind: enumeration(['activity']),
  action: enumeration([
    'created',
    'accepted',
    'completed',
    'approved',
    'reopened',
    'renewed',
    'closed',
  ]),
  actionLabel: string,
  actor: decodeIdentity,
  at: string,
  detail: string,
  sequence: number,
});

const comment = object<TaskComment>({
  kind: enumeration(['comment']),
  actor: decodeIdentity,
  at: string,
  commentId: string,
  content: nullable(string),
  deleted: boolean,
  deletedAt: nullable(string),
  deletedByUsername: nullable(string),
  edited: boolean,
  sequence: number,
});

/** Dispatches only the documented public timeline union, never raw event history. */
const timelineEvent: Decoder<TaskTimelineEvent> = (value, path) => {
  const input = record(value, path);
  return input.kind === 'activity'
    ? activity(value, path)
    : comment(value, path);
};

const workflowStatus = enumeration([
  'not_started',
  'in_progress',
  'completed',
  'reopened',
  'closed',
]);

/** Projects the complete read resource without recomputing status, ownership, sorting or dates. */
export const decodeTask: Decoder<Task> = object<Task>({
  id: string,
  title: string,
  description: string,
  type: enumeration([
    'exploration',
    'collection',
    'escort',
    'bounty',
    'building',
  ]),
  typeLabel: string,
  dueDate: string,
  assignee: nullable(decodeIdentity),
  publisher: decodeIdentity,
  createdAt: string,
  updatedAt: string,
  status: enumeration([
    'not_started',
    'in_progress',
    'completed',
    'reopened',
    'closed',
    'expired',
  ]),
  statusLabel: string,
  workflowStatus,
  workflowStatusLabel: string,
  version: number,
  timeline: array(timelineEvent),
  reward: string,
});

interface ErrorEnvelope {
  error: { code: string; message: string; details?: Record<string, unknown> };
  path: string;
  timestamp: string;
}

/** Leaves server error codes and details open while requiring the established envelope fields. */
export const decodeError: Decoder<ErrorEnvelope> = object<ErrorEnvelope>({
  error: object<ErrorEnvelope['error']>({
    code: string,
    message: string,
    details: optional(record),
  }),
  path: string,
  timestamp: string,
});
