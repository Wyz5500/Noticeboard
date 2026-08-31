/** Implements the pure task aggregate, including permissions, transitions, and event ordering. */
import { DomainError } from './domain-error.js';
import {
  TASK_TYPES,
  type Actor,
  type CreateTaskValues,
  type TaskAction,
  type TaskEvent,
  type TaskEventAction,
  type TaskSnapshot,
} from './task.types.js';

const EVENT_DETAILS: Record<TaskEventAction, string> = {
  created: '任务发布至冒险家工会',
  accepted: '开始执行任务',
  completed: '等待发布者验收',
  approved: '任务成果符合要求',
  reopened: '验收未通过，退回继续执行',
  closed: '任务流程结束',
};

/** Produces a detached actor value so callers cannot mutate aggregate state by reference. */
function copyActor(actor: Actor): Actor {
  return {
    id: actor.id,
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

  /** Reports whether an actor may perform an action in the current aggregate state. */
  canAct(action: TaskAction, actor: Actor): boolean {
    if (!actor.id) return false;
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
  act(action: TaskAction, actor: Actor, at: string): void {
    if (!this.canAct(action, actor)) {
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

  /** Finds the newest timeline actor still recognized by the current identity directory. */
  latestActorId(knownActorIds: ReadonlySet<string>): string | null {
    for (
      let index = this.snapshot.timeline.length - 1;
      index >= 0;
      index -= 1
    ) {
      const event = this.snapshot.timeline[index];
      if (event && knownActorIds.has(event.actor.id)) return event.actor.id;
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
