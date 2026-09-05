/** Stable handwritten SDK resource contracts matching the versioned HTTP read surface. */
export type Permission =
  | 'system.manage'
  | 'tasks.view'
  | 'tasks.create'
  | 'tasks.accept'
  | 'tasks.complete'
  | 'tasks.review'
  | 'tasks.close'
  | 'demo.reset';
export type TaskType =
  'exploration' | 'collection' | 'escort' | 'bounty' | 'building';
export type TaskWorkflowStatus =
  'not_started' | 'in_progress' | 'completed' | 'reopened' | 'closed';
export type TaskStatus = TaskWorkflowStatus | 'expired';
export type TaskActivityAction =
  | 'created'
  | 'accepted'
  | 'completed'
  | 'approved'
  | 'reopened'
  | 'renewed'
  | 'closed';

export interface Identity {
  id: string;
  name: string;
  username: string;
  role: string;
  roleLabel: string;
  permissions?: Permission[];
}

export interface TaskActivity {
  kind: 'activity';
  action: TaskActivityAction;
  actionLabel: string;
  actor: Identity;
  at: string;
  detail: string;
  sequence: number;
}

export interface TaskComment {
  kind: 'comment';
  actor: Identity;
  at: string;
  commentId: string;
  content: string | null;
  deleted: boolean;
  deletedAt: string | null;
  deletedByUsername: string | null;
  edited: boolean;
  sequence: number;
}

export type TaskTimelineEvent = TaskActivity | TaskComment;

export interface Task {
  id: string;
  title: string;
  description: string;
  type: TaskType;
  typeLabel: string;
  dueDate: string;
  assignee: Identity | null;
  publisher: Identity;
  createdAt: string;
  updatedAt: string;
  status: TaskStatus;
  statusLabel: string;
  workflowStatus: TaskWorkflowStatus;
  workflowStatusLabel: string;
  version: number;
  timeline: TaskTimelineEvent[];
  reward: string;
}
