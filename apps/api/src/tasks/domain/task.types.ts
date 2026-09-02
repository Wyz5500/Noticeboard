/** Defines framework-free task domain values and persistence snapshots. */
import type { Actor } from '../../identity/public/actor.js';

export const TASK_STATUSES = [
  'not_started',
  'in_progress',
  'completed',
  'reopened',
  'closed',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_EFFECTIVE_STATUSES = [...TASK_STATUSES, 'expired'] as const;
export type TaskEffectiveStatus = (typeof TASK_EFFECTIVE_STATUSES)[number];

export const TASK_RECOVERY_STRATEGIES = [
  'preserve_status',
  'reopened',
] as const;
export type TaskRecoveryStrategy = (typeof TASK_RECOVERY_STRATEGIES)[number];

export const TASK_ACTIONS = [
  'accept',
  'complete',
  'approve',
  'reopen',
  'close',
] as const;
export type TaskAction = (typeof TASK_ACTIONS)[number];

export const TASK_TYPES = [
  'exploration',
  'collection',
  'escort',
  'bounty',
  'building',
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_EVENT_ACTIONS = [
  'created',
  'accepted',
  'completed',
  'approved',
  'reopened',
  'renewed',
  'closed',
] as const;
export type TaskEventAction = (typeof TASK_EVENT_ACTIONS)[number];

export interface CreateTaskValues {
  id: string;
  title: string;
  type: TaskType;
  description: string;
  reward: string;
  dueDate: string;
}

export interface RenewExpiredTaskValues {
  dueDate: string;
  recoveryStrategy: TaskRecoveryStrategy;
  currentDate: string;
  at: string;
}

export interface TaskEvent {
  sequence: number;
  action: TaskEventAction;
  actor: Actor;
  at: string;
  detail: string;
}

export interface TaskSnapshot {
  id: string;
  title: string;
  type: TaskType;
  description: string;
  reward: string;
  dueDate: string;
  publisher: Actor;
  assignee: Actor | null;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  version: number;
  timeline: TaskEvent[];
}
