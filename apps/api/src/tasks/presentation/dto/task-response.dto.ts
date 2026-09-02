/** Maps application task models to the discriminated public timeline API resource. */
import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';

import { ALL_PERMISSION_CODES } from '../../../authorization/public/permission.js';
import type { Actor } from '../../../identity/public/actor.js';
import { projectTaskTimeline } from '../../application/read-models/project-task-timeline.js';
import type {
  TaskReadModel,
  TaskTimelineReadModel,
} from '../../application/read-models/task-read-model.js';
import {
  TASK_EVENT_ACTIONS,
  TASK_STATUSES,
  TASK_TYPES,
  type TaskEventAction,
  type TaskSnapshot,
  type TaskStatus,
  type TaskType,
} from '../../domain/task.types.js';

const STATUS_LABELS = {
  not_started: '未开始',
  in_progress: '进行中',
  completed: '已完成',
  reopened: '重新打开',
  closed: '关闭',
} as const;

const TYPE_LABELS = {
  exploration: '探索',
  collection: '采集',
  escort: '护送',
  bounty: '悬赏',
  building: '建造',
} as const;

const EVENT_LABELS = {
  created: '创建任务',
  accepted: '接取任务',
  completed: '标记完成',
  approved: '验收通过',
  reopened: '重新打开',
  closed: '关闭任务',
} as const;

export class ActorResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ example: 'user' })
  role!: string;

  @ApiProperty({ example: '演示用户' })
  roleLabel!: string;

  @ApiPropertyOptional({ enum: ALL_PERMISSION_CODES, isArray: true })
  permissions?: string[];
}

export class TaskActivityResponseDto {
  @ApiProperty({ enum: ['activity'] })
  kind!: 'activity';

  @ApiProperty()
  sequence!: number;

  @ApiProperty({ enum: TASK_EVENT_ACTIONS })
  action!: TaskEventAction;

  @ApiProperty()
  actionLabel!: string;

  @ApiProperty({ type: ActorResponseDto })
  actor!: ActorResponseDto;

  @ApiProperty({ format: 'date-time' })
  at!: string;

  @ApiProperty()
  detail!: string;
}

export class TaskCommentResponseDto {
  @ApiProperty({ enum: ['comment'] })
  kind!: 'comment';

  @ApiProperty()
  sequence!: number;

  @ApiProperty()
  commentId!: string;

  @ApiProperty({ type: ActorResponseDto })
  actor!: ActorResponseDto;

  @ApiProperty({ format: 'date-time' })
  at!: string;

  @ApiProperty({ nullable: true, maxLength: 1000 })
  content!: string | null;

  @ApiProperty()
  deleted!: boolean;

  @ApiProperty({ format: 'date-time', nullable: true })
  deletedAt!: string | null;

  @ApiProperty({ nullable: true })
  deletedByUsername!: string | null;
}

export type TaskTimelineResponseDto =
  TaskActivityResponseDto | TaskCommentResponseDto;

@ApiExtraModels(TaskActivityResponseDto, TaskCommentResponseDto)
export class TaskResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: TASK_TYPES })
  type!: TaskType;

  @ApiProperty()
  typeLabel!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  reward!: string;

  @ApiProperty({ format: 'date' })
  dueDate!: string;

  @ApiProperty({ type: ActorResponseDto })
  publisher!: ActorResponseDto;

  @ApiProperty({ type: ActorResponseDto, nullable: true })
  assignee!: ActorResponseDto | null;

  @ApiProperty({ enum: TASK_STATUSES })
  status!: TaskStatus;

  @ApiProperty()
  statusLabel!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty()
  version!: number;

  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(TaskActivityResponseDto) },
        { $ref: getSchemaPath(TaskCommentResponseDto) },
      ],
      discriminator: { propertyName: 'kind' },
    },
  })
  timeline!: TaskTimelineResponseDto[];
}

/** Adds the role label fallback while preserving the immutable username value. */
function toActorResponse(actor: Actor): ActorResponseDto {
  return {
    ...actor,
    roleLabel:
      actor.roleLabel ??
      (actor.role === 'system_admin' ? '系统管理员' : '演示用户'),
  };
}

/** Converts one lifecycle event into the labeled activity response branch. */
function activityResponse(
  event: Extract<TaskTimelineReadModel, { kind: 'activity' }>,
): TaskActivityResponseDto {
  return {
    kind: 'activity',
    sequence: event.sequence,
    action: event.action,
    actionLabel: EVENT_LABELS[event.action],
    actor: toActorResponse(event.actor),
    at: event.at,
    detail: event.detail,
  };
}

/** Recognizes an already projected timeline without depending on its first item. */
function isProjectedTimeline(
  timeline: TaskSnapshot['timeline'] | TaskReadModel['timeline'],
): timeline is TaskReadModel['timeline'] {
  return timeline.every((event) => 'kind' in event);
}

/** Adds response labels to a shared safe timeline projection. */
function timelineResponse(
  timeline: TaskSnapshot['timeline'] | TaskReadModel['timeline'],
): TaskTimelineResponseDto[] {
  const projected = isProjectedTimeline(timeline)
    ? timeline
    : projectTaskTimeline(timeline);
  return projected.map((event) =>
    event.kind === 'activity'
      ? activityResponse(event)
      : { ...event, actor: toActorResponse(event.actor) },
  );
}

/** Adds presentation labels while preserving stable machine codes and detached values. */
export function toTaskResponse(
  task: TaskReadModel | TaskSnapshot,
): TaskResponseDto {
  return {
    id: task.id,
    title: task.title,
    type: task.type,
    typeLabel: TYPE_LABELS[task.type],
    description: task.description,
    reward: task.reward,
    dueDate: task.dueDate,
    publisher: toActorResponse(task.publisher),
    assignee: task.assignee ? toActorResponse(task.assignee) : null,
    status: task.status,
    statusLabel: STATUS_LABELS[task.status],
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    version: task.version,
    timeline: timelineResponse(task.timeline),
  };
}
