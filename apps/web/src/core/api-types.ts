/** Defines the browser-facing OpenAPI resource shapes without sharing server DTO classes. */

export type TaskStatus =
  'not_started' | 'in_progress' | 'completed' | 'reopened' | 'closed';
export type TaskAction = 'accept' | 'complete' | 'approve' | 'reopen' | 'close';
export type TaskType =
  'exploration' | 'collection' | 'escort' | 'bounty' | 'building';

export interface ActorResource {
  id: string;
  name: string;
  role: 'user';
  roleLabel: string;
}

export interface TaskEventResource {
  sequence: number;
  action:
    'created' | 'accepted' | 'completed' | 'approved' | 'reopened' | 'closed';
  actionLabel: string;
  actor: ActorResource;
  at: string;
  detail: string;
}

export interface TaskResource {
  id: string;
  title: string;
  type: TaskType;
  typeLabel: string;
  description: string;
  reward: string;
  dueDate: string;
  publisher: ActorResource;
  assignee: ActorResource | null;
  status: TaskStatus;
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  timeline: TaskEventResource[];
}

export interface CreateTaskRequest {
  title: string;
  type: TaskType;
  description: string;
  reward: string;
  dueDate: string;
}

export interface ActTaskRequest {
  action: TaskAction;
  expectedVersion: number;
}
