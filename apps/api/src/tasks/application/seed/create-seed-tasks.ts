/** Recreates the four original demo aggregates without importing browser persistence state. */
import { DEMO_ACTORS } from '../../../identity/domain/demo-actors.js';
import { Task } from '../../domain/task.js';
import type { Actor, TaskSnapshot } from '../../domain/task.types.js';

const [PUBLISHER, ADVENTURER_A, ADVENTURER_B] = DEMO_ACTORS as readonly [
  Actor,
  Actor,
  Actor,
];

const SEED_SNAPSHOTS: readonly TaskSnapshot[] = [
  {
    id: 'task-herbs',
    title: '月影森林的失踪药草',
    type: 'collection',
    description:
      '前往月影森林边缘，寻找三株在暴雨后失踪的月光药草。请避开夜行狼群，并将完整植株带回公会。',
    reward: '18 金币 · 月光药草图鉴',
    dueDate: '2026-09-04',
    publisher: PUBLISHER,
    assignee: null,
    status: 'not_started',
    createdAt: '2026-08-28T09:10:00.000Z',
    updatedAt: '2026-08-28T09:10:00.000Z',
    version: 1,
    timeline: [
      {
        sequence: 1,
        action: 'created',
        actor: PUBLISHER,
        at: '2026-08-28T09:10:00.000Z',
        detail: '任务发布至冒险家工会',
      },
    ],
  },
  {
    id: 'task-outpost',
    title: '北境哨站补给护送',
    type: 'escort',
    description:
      '护送一车铁锭、面包与火把穿越冻原，安全抵达北境哨站。途中可能遭遇冰原骷髅。',
    reward: '32 金币 · 哨站声望 +12',
    dueDate: '2026-08-31',
    publisher: PUBLISHER,
    assignee: ADVENTURER_A,
    status: 'in_progress',
    createdAt: '2026-08-27T07:40:00.000Z',
    updatedAt: '2026-08-28T14:25:00.000Z',
    version: 2,
    timeline: [
      {
        sequence: 1,
        action: 'created',
        actor: PUBLISHER,
        at: '2026-08-27T07:40:00.000Z',
        detail: '任务发布至冒险家工会',
      },
      {
        sequence: 2,
        action: 'accepted',
        actor: ADVENTURER_A,
        at: '2026-08-28T14:25:00.000Z',
        detail: '开始执行任务',
      },
    ],
  },
  {
    id: 'task-lanterns',
    title: '修复旧矿井的照明符文',
    type: 'building',
    description: '为旧矿井入口与第一层通道补齐照明符文，确保矿工夜间通行安全。',
    reward: '25 金币 · 红石组件包',
    dueDate: '2026-08-29',
    publisher: PUBLISHER,
    assignee: ADVENTURER_B,
    status: 'completed',
    createdAt: '2026-08-24T11:20:00.000Z',
    updatedAt: '2026-08-28T18:05:00.000Z',
    version: 3,
    timeline: [
      {
        sequence: 1,
        action: 'created',
        actor: PUBLISHER,
        at: '2026-08-24T11:20:00.000Z',
        detail: '任务发布至冒险家工会',
      },
      {
        sequence: 2,
        action: 'accepted',
        actor: ADVENTURER_B,
        at: '2026-08-26T10:15:00.000Z',
        detail: '开始执行任务',
      },
      {
        sequence: 3,
        action: 'completed',
        actor: ADVENTURER_B,
        at: '2026-08-28T18:05:00.000Z',
        detail: '等待发布者验收',
      },
    ],
  },
  {
    id: 'task-starfire',
    title: '寻找星火祭坛的入口',
    type: 'exploration',
    description:
      '绘制废弃峡谷中的安全路线，找到传说中的星火祭坛入口，并带回一枚现场印记。',
    reward: '50 金币 · 稀有地图碎片',
    dueDate: '2026-08-27',
    publisher: PUBLISHER,
    assignee: ADVENTURER_A,
    status: 'closed',
    createdAt: '2026-08-20T08:30:00.000Z',
    updatedAt: '2026-08-26T16:50:00.000Z',
    version: 4,
    timeline: [
      {
        sequence: 1,
        action: 'created',
        actor: PUBLISHER,
        at: '2026-08-20T08:30:00.000Z',
        detail: '任务发布至冒险家工会',
      },
      {
        sequence: 2,
        action: 'accepted',
        actor: ADVENTURER_A,
        at: '2026-08-21T09:00:00.000Z',
        detail: '开始执行任务',
      },
      {
        sequence: 3,
        action: 'completed',
        actor: ADVENTURER_A,
        at: '2026-08-25T17:20:00.000Z',
        detail: '等待发布者验收',
      },
      {
        sequence: 4,
        action: 'approved',
        actor: PUBLISHER,
        at: '2026-08-26T16:48:00.000Z',
        detail: '任务成果符合要求',
      },
      {
        sequence: 5,
        action: 'closed',
        actor: PUBLISHER,
        at: '2026-08-26T16:50:00.000Z',
        detail: '任务流程结束',
      },
    ],
  },
];

/** Returns newly restored aggregates so reset callers never share mutable instances. */
export function createSeedTasks(): Task[] {
  return SEED_SNAPSHOTS.map((snapshot) => Task.restore(snapshot));
}
