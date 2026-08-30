/** Defines database-independent read projections returned by task queries. */
import type {
  Actor,
  TaskEventAction,
  TaskStatus,
  TaskType,
} from '../../domain/task.types.js';

export interface TaskEventReadModel {
  sequence: number;
  action: TaskEventAction;
  actor: Actor;
  at: string;
  detail: string;
}

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
  timeline: TaskEventReadModel[];
}
