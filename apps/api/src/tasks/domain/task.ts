/** Implements the pure task aggregate, including permissions, transitions, and event ordering. */
import { DomainError } from './domain-error.js';
import type { Actor } from '../../identity/public/actor.js';
import {
  TASK_EVENT_ACTIONS,
  TASK_TYPES,
  type CreateTaskValues,
  type RenewExpiredTaskValues,
  type TaskAction,
  type TaskEffectiveStatus,
  type TaskEvent,
  type TaskEventAction,
  type TaskSnapshot,
  type TaskStatus,
} from './task.types.js';

type TaskCommentEvent = Exclude<TaskEvent, { action: TaskEventAction }>;
type CommentEventPayload = TaskCommentEvent extends infer Event
  ? Event extends TaskCommentEvent
    ? Omit<Event, 'sequence' | 'actor' | 'at'>
    : never
  : never;

/** Derives the client-visible status without mutating the persisted workflow state. */
export function deriveTaskEffectiveStatus(
  status: TaskStatus,
  dueDate: string,
  currentDate: string,
): TaskEffectiveStatus {
  if (status === 'closed') return status;
  return dueDate < currentDate ? 'expired' : status;
}

const EVENT_DETAILS: Record<TaskEventAction, string> = {
  created: '任务发布至冒险家工会',
  accepted: '开始执行任务',
  completed: '等待发布者验收',
  approved: '任务成果符合要求',
  reopened: '验收未通过，退回继续执行',
  renewed: '任务已设置新的截止日期',
  closed: '任务流程结束',
};

const WORKFLOW_STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: '未开始',
  in_progress: '进行中',
  completed: '已完成',
  reopened: '重新打开',
  closed: '关闭',
};

/** Produces a detached actor value so callers cannot mutate aggregate state by reference. */
function copyActor(actor: Actor): Actor {
  return {
    id: actor.id,
    username: actor.username,
    name: actor.name,
    role: actor.role,
    ...(actor.roleLabel === undefined ? {} : { roleLabel: actor.roleLabel }),
  };
}

/** Produces a detached timeline event, including its nested actor snapshot. */
function copyEvent(event: TaskEvent): TaskEvent {
  return { ...event, actor: copyActor(event.actor) };
}

/** Recognizes the public date-only contract and rejects normalized-but-invalid dates. */
function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

/** Normalizes one comment body while enforcing the shared public content contract. */
function normalizeCommentContent(content: string): string {
  const normalized = content.trim();
  if (
    !normalized ||
    normalized.includes('\0') ||
    Array.from(normalized).length > 1000
  ) {
    throw new DomainError('INVALID_COMMENT', '评论内容必须为 1 至 1000 个字符');
  }
  return normalized;
}

/** Rejects malformed task input at the domain boundary after DTO validation has run. */
function validateCreation(
  values: CreateTaskValues,
  publisher: Actor,
  at: string,
): void {
  if (
    !values.id.trim() ||
    !values.title.trim() ||
    !values.description.trim() ||
    !values.reward.trim() ||
    !TASK_TYPES.includes(values.type) ||
    !isDateOnly(values.dueDate) ||
    !publisher.id ||
    !publisher.username ||
    !publisher.name ||
    Number.isNaN(new Date(at).valueOf())
  ) {
    throw new DomainError('INVALID_TASK', '请完整填写有效的任务信息');
  }
}

export class Task {
  /** Restores a mutable aggregate from a detached persistence snapshot. */
  private constructor(private snapshot: TaskSnapshot) {}

  /** Creates a new task in the not-started state with its first timeline event. */
  static create(values: CreateTaskValues, publisher: Actor, at: string): Task {
    validateCreation(values, publisher, at);
    const actor = copyActor(publisher);
    return new Task({
      id: values.id.trim(),
      title: values.title.trim(),
      type: values.type,
      description: values.description.trim(),
      reward: values.reward.trim(),
      dueDate: values.dueDate,
      publisher: actor,
      assignee: null,
      status: 'not_started',
      createdAt: at,
      updatedAt: at,
      version: 1,
      timeline: [
        {
          sequence: 1,
          action: 'created',
          actor: copyActor(actor),
          at,
          detail: EVENT_DETAILS.created,
        },
      ],
    });
  }

  /** Restores persisted state while protecting it from later external mutation. */
  static restore(snapshot: TaskSnapshot): Task {
    return new Task({
      ...snapshot,
      publisher: copyActor(snapshot.publisher),
      assignee: snapshot.assignee ? copyActor(snapshot.assignee) : null,
      timeline: snapshot.timeline.map(copyEvent),
    });
  }

  /** Compares an optimistic request version without detaching the aggregate graph. */
  matchesVersion(expectedVersion: number): boolean {
    return this.snapshot.version === expectedVersion;
  }

  /** Reports whether an actor may perform an action in the current aggregate state. */
  canAct(action: TaskAction, actor: Actor, currentDate: string): boolean {
    if (!actor.id) return false;
    if (
      deriveTaskEffectiveStatus(
        this.snapshot.status,
        this.snapshot.dueDate,
        currentDate,
      ) === 'expired'
    )
      return false;
    if (action === 'accept') {
      return (
        (this.snapshot.status === 'not_started' && !this.snapshot.assignee) ||
        this.snapshot.status === 'reopened'
      );
    }
    if (action === 'complete') {
      return (
        this.snapshot.status === 'in_progress' &&
        this.snapshot.assignee?.id === actor.id
      );
    }
    if (action === 'approve' || action === 'reopen') {
      return this.isPublisher(actor) && this.snapshot.status === 'completed';
    }
    return (
      this.isPublisher(actor) &&
      (this.snapshot.status === 'completed' ||
        this.snapshot.status === 'reopened')
    );
  }

  /** Applies one authorized state transition and increments the optimistic version once. */
  act(action: TaskAction, actor: Actor, at: string, currentDate: string): void {
    if (
      deriveTaskEffectiveStatus(
        this.snapshot.status,
        this.snapshot.dueDate,
        currentDate,
      ) === 'expired'
    ) {
      throw new DomainError('TASK_EXPIRED', '任务已失效，请先设置新的截止日期');
    }
    if (!this.canAct(action, actor, currentDate)) {
      throw new DomainError(
        'ACTION_FORBIDDEN',
        '当前身份或任务状态无法执行此操作',
      );
    }
    if (Number.isNaN(new Date(at).valueOf())) {
      throw new DomainError('INVALID_TASK', '操作时间无效');
    }

    if (action === 'accept') {
      const wasReopened = this.snapshot.status === 'reopened';
      this.snapshot.assignee = copyActor(actor);
      this.snapshot.status = 'in_progress';
      this.appendEvent(
        'accepted',
        actor,
        at,
        wasReopened ? '重新开始执行任务' : EVENT_DETAILS.accepted,
      );
    } else if (action === 'complete') {
      this.snapshot.status = 'completed';
      this.appendEvent('completed', actor, at);
    } else if (action === 'approve') {
      this.snapshot.status = 'closed';
      this.appendEvent('approved', actor, at);
      this.appendEvent('closed', actor, at);
    } else if (action === 'reopen') {
      this.snapshot.status = 'reopened';
      this.appendEvent('reopened', actor, at);
    } else {
      this.snapshot.status = 'closed';
      this.appendEvent('closed', actor, at);
    }

    this.snapshot.updatedAt = at;
    this.snapshot.version += 1;
  }

  /** Appends one normalized comment unless the task is already closed. */
  addComment(
    commentId: string,
    content: string,
    actor: Actor,
    at: string,
  ): void {
    const normalized = normalizeCommentContent(content);
    if (!commentId.trim()) {
      throw new DomainError('INVALID_COMMENT', '评论信息无效');
    }
    if (this.snapshot.status === 'closed') {
      throw new DomainError('COMMENT_CONFLICT', '已关闭任务不能新增评论');
    }
    if (
      this.snapshot.timeline.some(
        (event) =>
          event.action === 'comment_created' &&
          event.commentId === commentId.trim(),
      )
    ) {
      throw new DomainError('COMMENT_CONFLICT', '评论标识冲突');
    }
    this.appendCommentEvent(
      {
        action: 'comment_created',
        commentId: commentId.trim(),
        content: normalized,
      },
      actor,
      at,
    );
  }

  /** Appends a normalized revision when the original author edits an available comment. */
  editComment(
    commentId: string,
    content: string,
    actor: Actor,
    at: string,
  ): void {
    const created = this.snapshot.timeline.find(
      (event): event is Extract<TaskEvent, { action: 'comment_created' }> =>
        event.action === 'comment_created' && event.commentId === commentId,
    );
    if (!created) {
      throw new DomainError('COMMENT_NOT_FOUND', '评论不存在');
    }
    if (created.actor.id !== actor.id) {
      throw new DomainError('COMMENT_FORBIDDEN', '只能编辑自己的评论');
    }
    if (
      this.snapshot.timeline.some(
        (event) =>
          event.action === 'comment_deleted' &&
          event.targetCommentId === commentId,
      )
    ) {
      throw new DomainError('COMMENT_CONFLICT', '评论已被删除');
    }
    if (this.snapshot.status === 'closed') {
      throw new DomainError('COMMENT_CONFLICT', '已关闭任务不能编辑评论');
    }
    const normalized = normalizeCommentContent(content);
    let currentContent = created.content;
    for (const event of this.snapshot.timeline) {
      if (
        event.action === 'comment_edited' &&
        event.targetCommentId === commentId
      ) {
        currentContent = event.content;
      }
    }
    if (normalized === currentContent) {
      throw new DomainError('COMMENT_CONFLICT', '评论内容没有变化');
    }
    this.appendCommentEvent(
      {
        action: 'comment_edited',
        targetCommentId: commentId,
        content: normalized,
      },
      actor,
      at,
    );
  }

  /** Appends a deletion marker when the current actor is the author or a live manager. */
  deleteComment(
    commentId: string,
    actor: Actor,
    canManage: boolean,
    at: string,
  ): void {
    const created = this.snapshot.timeline.find(
      (event) =>
        event.action === 'comment_created' && event.commentId === commentId,
    );
    if (!created) {
      throw new DomainError('COMMENT_NOT_FOUND', '评论不存在');
    }
    const deleted = this.snapshot.timeline.some(
      (event) =>
        event.action === 'comment_deleted' &&
        event.targetCommentId === commentId,
    );
    if (deleted) {
      throw new DomainError('COMMENT_CONFLICT', '评论已被删除');
    }
    if (created.actor.id !== actor.id && !canManage) {
      throw new DomainError('COMMENT_FORBIDDEN', '只能删除自己的评论');
    }
    this.appendCommentEvent(
      {
        action: 'comment_deleted',
        targetCommentId: commentId,
      },
      actor,
      at,
    );
  }

  /** Renews an expired task while preserving or reopening its persisted workflow. */
  renewExpired(actor: Actor, values: RenewExpiredTaskValues): void {
    if (!this.isPublisher(actor)) {
      throw new DomainError('ACTION_FORBIDDEN', '仅任务发布者可以续期');
    }
    if (
      deriveTaskEffectiveStatus(
        this.snapshot.status,
        this.snapshot.dueDate,
        values.currentDate,
      ) !== 'expired'
    ) {
      throw new DomainError('TASK_NOT_EXPIRED', '仅已失效任务可以续期');
    }
    if (!isDateOnly(values.dueDate) || values.dueDate <= values.currentDate) {
      throw new DomainError('INVALID_TASK', '新截止日期必须晚于当前日期');
    }
    const previousDueDate = this.snapshot.dueDate;
    const previousStatus = this.snapshot.status;
    this.snapshot.dueDate = values.dueDate;
    if (values.recoveryStrategy === 'reopened') {
      this.snapshot.status = 'reopened';
      this.snapshot.assignee = null;
    }
    this.snapshot.updatedAt = values.at;
    this.snapshot.version += 1;
    this.appendEvent(
      'renewed',
      actor,
      values.at,
      values.recoveryStrategy === 'reopened'
        ? `截止日期由 ${previousDueDate} 调整为 ${values.dueDate}；工作流状态改为：重新打开；接取者已清空`
        : `截止日期由 ${previousDueDate} 调整为 ${values.dueDate}；保留工作流状态：${WORKFLOW_STATUS_LABELS[previousStatus]}；接取者保持不变`,
    );
  }

  /** Finds the newest lifecycle actor still recognized by the current identity directory. */
  latestActorId(knownActorIds: ReadonlySet<string>): string | null {
    for (
      let index = this.snapshot.timeline.length - 1;
      index >= 0;
      index -= 1
    ) {
      const event = this.snapshot.timeline[index];
      if (
        event &&
        TASK_EVENT_ACTIONS.includes(event.action as TaskEventAction) &&
        knownActorIds.has(event.actor.id)
      ) {
        return event.actor.id;
      }
    }
    return null;
  }

  /** Returns a fully detached representation for persistence or response mapping. */
  toSnapshot(): TaskSnapshot {
    return {
      ...this.snapshot,
      publisher: copyActor(this.snapshot.publisher),
      assignee: this.snapshot.assignee
        ? copyActor(this.snapshot.assignee)
        : null,
      timeline: this.snapshot.timeline.map(copyEvent),
    };
  }

  /** Checks publisher authority using the stable actor identifier. */
  private isPublisher(actor: Actor): boolean {
    return this.snapshot.publisher.id === actor.id;
  }

  /** Appends one validated comment event and advances aggregate metadata exactly once. */
  private appendCommentEvent(
    event: CommentEventPayload,
    actor: Actor,
    at: string,
  ): void {
    if (!actor.id || !actor.username || Number.isNaN(new Date(at).valueOf())) {
      throw new DomainError('INVALID_COMMENT', '评论信息无效');
    }
    const lastSequence = this.snapshot.timeline.at(-1)?.sequence ?? 0;
    this.snapshot.timeline.push({
      ...event,
      sequence: lastSequence + 1,
      actor: copyActor(actor),
      at,
    });
    this.snapshot.updatedAt = at;
    this.snapshot.version += 1;
  }

  /** Adds a sequenced event while preserving actor data as an immutable historical snapshot. */
  private appendEvent(
    action: TaskEventAction,
    actor: Actor,
    at: string,
    detail = EVENT_DETAILS[action],
  ): void {
    const lastSequence = this.snapshot.timeline.at(-1)?.sequence ?? 0;
    this.snapshot.timeline.push({
      sequence: lastSequence + 1,
      action,
      actor: copyActor(actor),
      at,
      detail,
    });
  }
}
