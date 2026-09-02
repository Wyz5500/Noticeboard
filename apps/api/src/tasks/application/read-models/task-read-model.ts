/** Defines database-independent read projections returned by task queries. */
import type { Actor } from '../../../identity/public/actor.js';
import type {
  TaskEffectiveStatus,
  TaskEventAction,
  TaskStatus,
  TaskType,
} from '../../domain/task.types.js';

export interface TaskActivityReadModel {
  kind: 'activity';
  sequence: number;
  action: TaskEventAction;
  actor: Actor;
  at: string;
  detail: string;
}

export interface TaskCommentReadModel {
  kind: 'comment';
  sequence: number;
  commentId: string;
  actor: Actor;
  at: string;
  content: string | null;
  deleted: boolean;
  deletedAt: string | null;
  deletedByUsername: string | null;
}

export type TaskTimelineReadModel =
  TaskActivityReadModel | TaskCommentReadModel;

export interface TaskReadModel {
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
  timeline: TaskTimelineReadModel[];
}

export interface TaskViewModel extends Omit<TaskReadModel, 'status'> {
  workflowStatus: TaskStatus;
  status: TaskEffectiveStatus;
}
