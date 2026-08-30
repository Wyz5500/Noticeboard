/** Maps application read models to the stable API resource with Chinese presentation labels. */
import { ApiProperty } from '@nestjs/swagger';

import type { TaskReadModel } from '../../application/read-models/task-read-model.js';
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
  name!: string;

  @ApiProperty({ example: 'user' })
  role!: 'user';

  @ApiProperty({ example: '演示用户' })
  roleLabel!: '演示用户';
}

export class TaskEventResponseDto {
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

  @ApiProperty({ type: [TaskEventResponseDto] })
  timeline!: TaskEventResponseDto[];
}

/** Adds presentation labels while preserving stable machine codes and detached values. */
export function toTaskResponse(
  task: TaskReadModel | TaskSnapshot,
): TaskResponseDto {
  const actor = (value: TaskReadModel['publisher']): ActorResponseDto => ({
    ...value,
    roleLabel: '演示用户',
  });
  return {
    id: task.id,
    title: task.title,
    type: task.type,
    typeLabel: TYPE_LABELS[task.type],
    description: task.description,
    reward: task.reward,
    dueDate: task.dueDate,
    publisher: actor(task.publisher),
    assignee: task.assignee ? actor(task.assignee) : null,
    status: task.status,
    statusLabel: STATUS_LABELS[task.status],
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    version: task.version,
    timeline: task.timeline.map((event) => ({
      ...event,
      actionLabel: EVENT_LABELS[event.action],
      actor: actor(event.actor),
    })),
  };
}

/** Adds the Chinese role label to one demo identity response. */
export function toActorResponse(
  actor: TaskReadModel['publisher'],
): ActorResponseDto {
  return { ...actor, roleLabel: '演示用户' };
}
