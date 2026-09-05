/** Handwritten write contracts retain explicit optimistic versions without exposing generated types. */
import type { TaskType } from './models.js';

export type TaskAction = 'accept' | 'complete' | 'approve' | 'reopen' | 'close';
export type TaskRecoveryStrategy = 'preserve_status' | 'reopened';

export interface CreateTaskInput {
  title: string;
  type: TaskType;
  description: string;
  reward: string;
  dueDate: string;
}

export interface ActTaskInput {
  action: TaskAction;
  expectedVersion: number;
}

export interface RenewTaskInput {
  dueDate: string;
  recoveryStrategy: TaskRecoveryStrategy;
  expectedVersion: number;
}

export interface CreateCommentInput {
  content: string;
  expectedVersion: number;
}

export interface EditCommentInput {
  content: string;
  expectedVersion: number;
}

export interface DeleteCommentInput {
  expectedVersion: number;
}
