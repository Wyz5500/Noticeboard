/** Verifies controller state is refreshed when administrator permissions change. */
import { describe, expect, it, vi } from 'vitest';

import { ApiError, type ApiClient } from './api-client.js';
import type {
  ActorResource,
  AdminOverviewResource,
  TaskResource,
} from './api-types.js';
import type { RouteState } from './router.js';
vi.mock('../admin/admin-renderer.js', () => ({
  renderAdminView: vi.fn(),
}));
import { AppController } from './app-controller.js';
import * as adminRenderer from '../admin/admin-renderer.js';
import * as taskRenderer from '../tasks/task-renderer.js';

const CURRENT_USER: ActorResource = {
  id: 'noticeboard-admin',
  username: 'guild-admin',
  name: '公会管理员',
  role: 'system_admin',
  roleLabel: '系统管理员',
  permissions: ['system.manage'],
};

const STALE_TASK = {
  id: 'task-stale',
} as TaskResource;

const RESET_ONLY_USER: ActorResource = {
  id: 'reset-only',
  username: 'reset-user',
  name: '重置用户',
  role: 'resetter',
  roleLabel: '重置角色',
  permissions: ['demo.reset'],
};

const TASK_VIEWER: ActorResource = {
  id: 'task-viewer',
  username: 'task-viewer',
  name: '查看用户',
  role: 'viewer',
  roleLabel: '查看角色',
  permissions: ['tasks.view'],
};

describe('AppController expired task renewal', () => {
  /** Ensures renewal submits the selected version and replaces the synchronized projection. */
  it('renews the selected expired task exactly once', async () => {
    const updated = { id: 'task-expired', version: 4 } as TaskResource;
    const requests: unknown[] = [];
    const controller = Object.create(AppController.prototype) as {
      selectedTaskId: string | null;
      tasks: TaskResource[];
      currentUserId: string;
      gate: { run: (_key: string, work: () => Promise<void>) => Promise<void> };
      api: Pick<ApiClient, 'renewExpiredTask'>;
      requestSnapshot: () => {
        actorId: string;
        sequence: number;
        routeSequence: number;
      };
      isCurrentRequest: () => boolean;
      replaceTask: (task: TaskResource) => void;
      closeRenewalDialog: () => void;
      render: () => void;
      showToast: (message: string) => void;
      renewSelectedTask?: (command: {
        dueDate: string;
        recoveryStrategy: 'preserve_status' | 'reopened';
      }) => Promise<void>;
    };
    controller.selectedTaskId = 'task-expired';
    controller.tasks = [{ id: 'task-expired', version: 3 } as TaskResource];
    controller.currentUserId = 'noticeboard-master';
    controller.gate = { run: (_key, work) => work() };
    controller.api = {
      renewExpiredTask: (actorId, taskId, body) => {
        requests.push({ actorId, taskId, body });
        return Promise.resolve(updated);
      },
    };
    controller.requestSnapshot = () => ({
      actorId: 'noticeboard-master',
      sequence: 1,
      routeSequence: 1,
    });
    controller.isCurrentRequest = () => true;
    controller.replaceTask = vi.fn();
    controller.closeRenewalDialog = vi.fn();
    controller.render = vi.fn();
    controller.showToast = vi.fn();

    if (controller.renewSelectedTask) {
      await controller.renewSelectedTask({
        dueDate: '2026-09-10',
        recoveryStrategy: 'reopened',
      });
    }

    expect(requests).toEqual([
      {
        actorId: 'noticeboard-master',
        taskId: 'task-expired',
        body: {
          dueDate: '2026-09-10',
          recoveryStrategy: 'reopened',
          expectedVersion: 3,
        },
      },
    ]);
    expect(controller.replaceTask).toHaveBeenCalledWith(updated);
    expect(controller.closeRenewalDialog).toHaveBeenCalledOnce();
  });

  /** Ensures the home status rail exposes dynamically expired tasks. */
  it('renders the expired task count', () => {
    const controller = Object.create(AppController.prototype) as {
      users: ActorResource[];
      tasks: TaskResource[];
      currentUserId: string;
      route: { scope: 'all' };
      elements: {
        statTotal: { textContent: string };
        statTotalDescription: { textContent: string };
        statNotStarted: { textContent: string };
        statActive: { textContent: string };
        statReview: { textContent: string };
        statReopened: { textContent: string };
        statExpired: { textContent: string };
        statClosed: { textContent: string };
        filterList: { querySelectorAll: () => HTMLElement[] };
      };
      renderStats?: () => void;
    };
    controller.users = [TASK_VIEWER];
    controller.currentUserId = TASK_VIEWER.id;
    controller.route = { scope: 'all' };
    controller.tasks = [
      {
        id: 'task-expired-count',
        title: '已失效委托',
        typeLabel: '探索',
        description: '统计已失效任务',
        publisher: TASK_VIEWER,
        assignee: null,
        status: 'expired',
        timeline: [
          {
            kind: 'activity',
            sequence: 1,
            action: 'created',
            actionLabel: '创建任务',
            actor: TASK_VIEWER,
            at: '2026-08-30T09:00:00.000Z',
            detail: '任务发布至冒险家工会',
          },
        ],
      } as TaskResource,
    ];
    controller.elements = {
      statTotal: { textContent: '' },
      statTotalDescription: { textContent: '' },
      statNotStarted: { textContent: '' },
      statActive: { textContent: '' },
      statReview: { textContent: '' },
      statReopened: { textContent: '' },
      statExpired: { textContent: '' },
      statClosed: { textContent: '' },
      filterList: { querySelectorAll: () => [] },
    };

    controller.renderStats?.();

    expect(controller.elements.statExpired.textContent).toBe('1');
  });

  /** Ensures opening a drawer uses the server's current effective-status projection. */
  it('loads a fresh task projection before opening the drawer', async () => {
    const fresh = {
      id: 'task-expired-drawer',
      status: 'expired',
      version: 3,
    } as TaskResource;
    const requests: unknown[] = [];
    const controller = Object.create(AppController.prototype) as {
      selectedTaskId: string | null;
      currentUserId: string;
      gate: { run: (_key: string, work: () => Promise<void>) => Promise<void> };
      api: Pick<ApiClient, 'getTask'>;
      requestSnapshot: () => {
        actorId: string;
        sequence: number;
        routeSequence: number;
      };
      isCurrentRequest: () => boolean;
      replaceTask: (task: TaskResource) => void;
      renderDrawer: () => void;
      showToast: (message: string) => void;
      openDrawer?: (taskId: string) => Promise<void>;
    };
    controller.selectedTaskId = null;
    controller.currentUserId = TASK_VIEWER.id;
    controller.gate = { run: (_key, work) => work() };
    controller.api = {
      getTask: (taskId, actorId) => {
        requests.push({ taskId, actorId });
        return Promise.resolve(fresh);
      },
    };
    controller.requestSnapshot = () => ({
      actorId: TASK_VIEWER.id,
      sequence: 1,
      routeSequence: 1,
    });
    controller.isCurrentRequest = () => true;
    controller.replaceTask = vi.fn();
    controller.renderDrawer = vi.fn();
    controller.showToast = vi.fn();

    await controller.openDrawer?.('task-expired-drawer');

    expect(requests).toEqual([
      { taskId: 'task-expired-drawer', actorId: TASK_VIEWER.id },
    ]);
    expect(controller.replaceTask).toHaveBeenCalledWith(fresh);
    expect(controller.renderDrawer).toHaveBeenCalledOnce();
  });

  /** Ensures focus and visibility recovery share one fresh task-list projection. */
  it('coalesces resumed-page refresh requests', async () => {
    const frames: FrameRequestCallback[] = [];
    const fresh = {
      id: 'task-refreshed-after-resume',
      status: 'expired',
    } as TaskResource;
    const listTasks = vi.fn(() => Promise.resolve([fresh]));
    const controller = Object.create(AppController.prototype) as {
      window: {
        requestAnimationFrame: (callback: FrameRequestCallback) => number;
      };
      document: { visibilityState: DocumentVisibilityState };
      api: Pick<ApiClient, 'listTasks'>;
      gate: { run: (_key: string, work: () => Promise<void>) => Promise<void> };
      users: ActorResource[];
      tasks: TaskResource[];
      tasksLoaded: boolean;
      currentUserId: string;
      identityChangeSequence: number;
      routeChangeSequence: number;
      requestSnapshot: () => {
        actorId: string;
        sequence: number;
        routeSequence: number;
      };
      isCurrentRequest: () => boolean;
      render: () => void;
      showToast: (message: string) => void;
      scheduleTaskRefresh?: () => void;
    };
    controller.window = {
      requestAnimationFrame: (callback) => {
        frames.push(callback);
        return frames.length;
      },
    };
    controller.document = { visibilityState: 'visible' };
    controller.api = { listTasks };
    controller.gate = { run: (_key, work) => work() };
    controller.users = [TASK_VIEWER];
    controller.tasks = [STALE_TASK];
    controller.tasksLoaded = true;
    controller.currentUserId = TASK_VIEWER.id;
    controller.identityChangeSequence = 0;
    controller.routeChangeSequence = 0;
    controller.requestSnapshot = () => ({
      actorId: TASK_VIEWER.id,
      sequence: 0,
      routeSequence: 0,
    });
    controller.isCurrentRequest = () => true;
    controller.render = vi.fn();
    controller.showToast = vi.fn();

    controller.scheduleTaskRefresh?.();
    controller.scheduleTaskRefresh?.();

    expect(frames).toHaveLength(1);
    frames[0]?.(0);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(listTasks).toHaveBeenCalledOnce();
    expect(controller.tasks).toEqual([fresh]);
    expect(controller.render).toHaveBeenCalledOnce();
  });

  /** Ensures an older resume response cannot replace a task projection installed while it was pending. */
  it('discards a resume refresh after a newer task projection is installed', async () => {
    let releaseTasks!: (tasks: TaskResource[]) => void;
    const stale = { ...STALE_TASK, version: 4 };
    const fresh = { ...STALE_TASK, version: 5 };
    const controller = Object.create(AppController.prototype) as {
      api: Pick<ApiClient, 'listTasks'>;
      gate: { run: (_key: string, work: () => Promise<void>) => Promise<void> };
      users: ActorResource[];
      tasks: TaskResource[];
      tasksLoaded: boolean;
      currentUserId: string;
      taskProjectionSequence: number;
      requestSnapshot: () => {
        actorId: string;
        sequence: number;
        routeSequence: number;
      };
      isCurrentRequest: () => boolean;
      render: ReturnType<typeof vi.fn>;
      showToast: ReturnType<typeof vi.fn>;
      replaceTask?: (task: TaskResource) => void;
      refreshTasksAfterResume?: () => Promise<void>;
    };
    controller.api = {
      listTasks: () =>
        new Promise((resolve) => {
          releaseTasks = resolve;
        }),
    };
    controller.gate = { run: (_key, work) => work() };
    controller.users = [TASK_VIEWER];
    controller.tasks = [stale];
    controller.tasksLoaded = true;
    controller.currentUserId = TASK_VIEWER.id;
    controller.taskProjectionSequence = 0;
    controller.requestSnapshot = () => ({
      actorId: TASK_VIEWER.id,
      sequence: 0,
      routeSequence: 0,
    });
    controller.isCurrentRequest = () => true;
    controller.render = vi.fn();
    controller.showToast = vi.fn();

    const refresh = controller.refreshTasksAfterResume?.();
    await Promise.resolve();
    controller.replaceTask?.(fresh);
    releaseTasks([stale]);
    await refresh;

    expect(controller.tasks).toEqual([fresh]);
    expect(controller.render).not.toHaveBeenCalled();
  });

  /** Ensures the renewal dialog explains the original workflow and assignee reset. */
  it('opens the renewal dialog with the selected task context', () => {
    const add = vi.fn();
    const controller = Object.create(AppController.prototype) as {
      selectedTaskId: string | null;
      tasks: TaskResource[];
      elements: {
        renewalModal: {
          classList: { add: (name: string) => void };
          setAttribute: (name: string, value: string) => void;
        };
        renewalBackdrop: { classList: { add: (name: string) => void } };
        renewalForm: { reset: () => void };
        renewalError: { textContent: string };
        renewalCurrentDueDate: { textContent: string };
        renewalWorkflowStatus: { textContent: string };
        renewalDueDate: { value: string; focus: () => void };
        renewalPreserveLabel: { textContent: string };
      };
      openRenewalDialog?: () => void;
    };
    controller.selectedTaskId = 'task-expired';
    controller.tasks = [
      {
        id: 'task-expired',
        dueDate: '2026-09-01',
        workflowStatusLabel: '进行中',
        status: 'expired',
      } as TaskResource,
    ];
    controller.elements = {
      renewalModal: {
        classList: { add },
        setAttribute: vi.fn(),
      },
      renewalBackdrop: { classList: { add: vi.fn() } },
      renewalForm: { reset: vi.fn() },
      renewalError: { textContent: '旧错误' },
      renewalCurrentDueDate: { textContent: '' },
      renewalWorkflowStatus: { textContent: '' },
      renewalDueDate: { value: '', focus: vi.fn() },
      renewalPreserveLabel: { textContent: '' },
    };

    controller.openRenewalDialog?.();

    expect(add).toHaveBeenCalledWith('is-open');
    expect(controller.elements.renewalCurrentDueDate.textContent).toBe(
      '2026-09-01',
    );
    expect(controller.elements.renewalWorkflowStatus.textContent).toBe(
      '进行中',
    );
    expect(controller.elements.renewalPreserveLabel.textContent).toBe(
      '保留原状态：进行中',
    );
  });
});

describe('AppController administration refresh', () => {
  /** Ensures a deleted selection cannot inherit the first actor's identity or permissions. */
  it('does not fall back to the first user when the selected identity is missing', () => {
    const controller = Object.create(AppController.prototype) as {
      users: ActorResource[];
      currentUserId: string;
      currentUser: () => ActorResource | null;
    };
    controller.users = [CURRENT_USER];
    controller.currentUserId = 'deleted-admin';

    expect(controller.currentUser()).toBeNull();
  });

  /** Ensures identity changes remove old protected data before starting a task request. */
  it('clears protected snapshots and renders before loading the new identity', async () => {
    let releaseTasks!: (tasks: TaskResource[]) => void;
    const controller = Object.create(AppController.prototype) as {
      elements: { identitySelect: { value: string } };
      storage: Storage;
      users: ActorResource[];
      tasks: TaskResource[];
      currentUserId: string;
      adminOverview: unknown;
      adminEditor: unknown;
      identityChangeSequence: number;
      loadTasksForCurrentUser: () => Promise<TaskResource[]>;
      canManage: () => boolean;
      render: () => void;
      showToast: (message: string) => void;
      changeIdentity: () => Promise<void>;
    };
    controller.elements = { identitySelect: { value: TASK_VIEWER.id } };
    controller.storage = {
      setItem: () => undefined,
      removeItem: () => undefined,
    } as unknown as Storage;
    controller.users = [CURRENT_USER, TASK_VIEWER];
    controller.tasks = [STALE_TASK];
    controller.currentUserId = CURRENT_USER.id;
    controller.adminOverview = {
      users: [],
      roles: [],
      permissions: [],
    };
    controller.adminEditor = { kind: 'user', mode: 'create' };
    controller.identityChangeSequence = 0;
    controller.loadTasksForCurrentUser = () =>
      new Promise((resolve) => {
        releaseTasks = resolve;
      });
    controller.canManage = () => false;
    controller.render = vi.fn();
    controller.showToast = vi.fn();

    const pending = controller.changeIdentity();

    expect(controller.tasks).toEqual([]);
    expect(controller.adminOverview).toBeNull();
    expect(controller.adminEditor).toBeNull();
    expect(controller.render).toHaveBeenCalledOnce();

    releaseTasks([]);
    await pending;
  });

  /** Ensures an administrator removed from the refreshed directory cannot receive an overview request. */
  it('persists an administrator fallback without requesting the deleted actor overview', async () => {
    const fallbackAdmin: ActorResource = {
      ...CURRENT_USER,
      id: 'replacement-admin',
      name: '替补管理员',
    };
    const overviewRequests: string[] = [];
    const storedValues: string[] = [];
    const controller = Object.create(AppController.prototype) as {
      api: Pick<ApiClient, 'listDemoUsers' | 'getAdminOverview'>;
      users: ActorResource[];
      tasks: TaskResource[];
      currentUserId: string;
      adminOverview: unknown;
      identityChangeSequence: number;
      routeChangeSequence: number;
      storage: Storage;
      route: unknown;
      window: {
        location: { hash: string };
        history: {
          replaceState: (state: null, title: string, url: string) => void;
        };
      };
      loadTasksForCurrentUser: () => Promise<TaskResource[]>;
      closeProfileMenu: () => void;
      closeDrawer: () => void;
      render: () => void;
      refreshAdminOverview: () => Promise<void>;
    };
    controller.api = {
      listDemoUsers: () => Promise.resolve([fallbackAdmin]),
      getAdminOverview: (actorId) => {
        overviewRequests.push(actorId);
        return Promise.resolve({ users: [], roles: [], permissions: [] });
      },
    };
    controller.users = [CURRENT_USER];
    controller.tasks = [STALE_TASK];
    controller.currentUserId = CURRENT_USER.id;
    controller.adminOverview = {
      users: [],
      roles: [],
      permissions: [],
    };
    controller.identityChangeSequence = 0;
    controller.routeChangeSequence = 0;
    controller.storage = {
      setItem: (_key: string, value: string) => storedValues.push(value),
      removeItem: () => undefined,
    } as unknown as Storage;
    controller.route = { view: 'admin' };
    controller.window = {
      location: { hash: '#admin' },
      history: {
        replaceState: () => undefined,
      },
    };
    controller.loadTasksForCurrentUser = () => Promise.resolve([]);
    controller.closeProfileMenu = vi.fn();
    controller.closeDrawer = vi.fn();
    controller.render = vi.fn();

    await controller.refreshAdminOverview();

    expect(controller.currentUserId).toBe(fallbackAdmin.id);
    expect(JSON.parse(storedValues.at(-1) ?? '{}')).toEqual({
      currentUserId: fallbackAdmin.id,
    });
    expect(overviewRequests).toEqual([]);
    expect(controller.identityChangeSequence).toBe(1);
  });

  /** Ensures the fallback's own URL update cannot discard its replacement task response. */
  it('keeps replacement tasks when the admin fallback redirects to home', async () => {
    const fallbackAdmin: ActorResource = {
      ...CURRENT_USER,
      id: 'redirect-replacement-admin',
    };
    const replacementTasks = [{ ...STALE_TASK, id: 'replacement-task' }];
    let hash = '#admin';
    const controller = Object.create(AppController.prototype) as {
      api: Pick<ApiClient, 'listDemoUsers' | 'getAdminOverview'>;
      users: ActorResource[];
      tasks: TaskResource[];
      currentUserId: string;
      adminOverview: unknown;
      identityChangeSequence: number;
      routeChangeSequence: number;
      storage: Storage;
      route: unknown;
      window: {
        location: { hash: string };
        history: {
          replaceState: (state: null, title: string, url: string) => void;
        };
      };
      loadTasksForCurrentUser: () => Promise<TaskResource[]>;
      closeProfileMenu: () => void;
      closeDrawer: () => void;
      render: () => void;
      refreshAdminOverview: (
        identity: { actorId: string; sequence: number },
        routeSequence: number,
      ) => Promise<void>;
    };
    const location = {} as { hash: string };
    Object.defineProperty(location, 'hash', {
      get: () => hash,
      set: (value: string) => {
        hash = value;
        queueMicrotask(() => {
          controller.routeChangeSequence += 1;
        });
      },
    });
    controller.api = {
      listDemoUsers: () => Promise.resolve([fallbackAdmin]),
      getAdminOverview: () =>
        Promise.resolve({ users: [], roles: [], permissions: [] }),
    };
    controller.users = [CURRENT_USER];
    controller.tasks = [STALE_TASK];
    controller.currentUserId = CURRENT_USER.id;
    controller.adminOverview = {
      users: [],
      roles: [],
      permissions: [],
    };
    controller.identityChangeSequence = 0;
    controller.routeChangeSequence = 1;
    controller.storage = {
      setItem: () => undefined,
      removeItem: () => undefined,
    } as unknown as Storage;
    controller.route = { view: 'admin' };
    controller.window = {
      location,
      history: {
        replaceState: (_state, _title, url) => {
          hash = url;
        },
      },
    };
    controller.loadTasksForCurrentUser = () =>
      new Promise((resolve) => {
        queueMicrotask(() => resolve(replacementTasks));
      });
    controller.closeProfileMenu = vi.fn();
    controller.closeDrawer = vi.fn();
    controller.render = vi.fn();

    await controller.refreshAdminOverview(
      { actorId: CURRENT_USER.id, sequence: 0 },
      1,
    );

    expect(controller.window.history.replaceState).toBeDefined();
    expect(controller.currentUserId).toBe(fallbackAdmin.id);
    expect(controller.tasks).toEqual(replacementTasks);
    expect(hash).toBe('#home');
  });

  /** Ensures removing tasks.view clears the previously loaded task snapshot. */
  it('reloads tasks after the current role loses task-read permission', async () => {
    const controller = Object.create(AppController.prototype) as {
      api: Pick<ApiClient, 'listDemoUsers' | 'getAdminOverview'>;
      users: ActorResource[];
      tasks: TaskResource[];
      currentUserId: string;
      adminOverview: unknown;
      canManage: () => boolean;
      loadTasksForCurrentUser: () => Promise<TaskResource[]>;
      render: () => void;
      refreshAdminOverview: () => Promise<void>;
    };
    const loadTasks = vi.fn(() => Promise.resolve([] as TaskResource[]));
    controller.api = {
      listDemoUsers: () => Promise.resolve([CURRENT_USER]),
      getAdminOverview: () =>
        Promise.resolve({ users: [], roles: [], permissions: [] }),
    };
    controller.users = [CURRENT_USER];
    controller.tasks = [STALE_TASK];
    controller.currentUserId = CURRENT_USER.id;
    controller.adminOverview = null;
    controller.canManage = () => true;
    controller.loadTasksForCurrentUser = loadTasks;
    controller.render = vi.fn();

    await controller.refreshAdminOverview();

    expect(loadTasks).toHaveBeenCalledOnce();
    expect(controller.tasks).toEqual([]);
  });

  /** Ensures reset selects a task-readable identity before refreshing its result. */
  it('refreshes reset results through an identity with tasks.view', async () => {
    const requestedActors: string[] = [];
    const controller = Object.create(AppController.prototype) as {
      api: Pick<ApiClient, 'resetDemo' | 'listTasks'>;
      users: ActorResource[];
      tasks: TaskResource[];
      currentUserId: string;
      commentDrafts: Map<string, string>;
      storage: Storage;
      window: {
        confirm: () => boolean;
        location: { hash: string };
        history: {
          replaceState: (state: null, title: string, url: string) => void;
        };
      };
      route: unknown;
      elements: Record<string, unknown>;
      gate: {
        run: <T>(key: string, operation: () => Promise<T>) => Promise<T>;
      };
      closeProfileMenu: () => void;
      closeDrawer: () => void;
      render: () => void;
      showToast: (message: string) => void;
      resetDemo: () => Promise<void>;
    };
    controller.api = {
      resetDemo: () => Promise.resolve({ reset: true }),
      listTasks: (actorId) => {
        requestedActors.push(actorId);
        return Promise.resolve([]);
      },
    };
    controller.users = [RESET_ONLY_USER, TASK_VIEWER];
    controller.tasks = [STALE_TASK];
    controller.currentUserId = RESET_ONLY_USER.id;
    controller.commentDrafts = new Map();
    controller.storage = {
      setItem: () => undefined,
      removeItem: () => undefined,
    } as unknown as Storage;
    controller.window = {
      confirm: () => true,
      location: { hash: '' },
      history: { replaceState: () => undefined },
    };
    controller.route = {};
    controller.elements = {};
    controller.gate = { run: (_key, operation) => operation() };
    controller.closeProfileMenu = vi.fn();
    controller.closeDrawer = vi.fn();
    controller.render = vi.fn();
    controller.showToast = vi.fn();

    await controller.resetDemo();

    expect(requestedActors).toEqual([TASK_VIEWER.id]);
    expect(controller.currentUserId).toBe(TASK_VIEWER.id);
  });

  /** Ensures reset clears the old identity view before its replacement task request settles. */
  it('clears reset state, closes the drawer, and renders before loading replacement tasks', async () => {
    let releaseReset!: (result: { reset: true }) => void;
    let releaseTasks!: (tasks: TaskResource[]) => void;
    const controller = Object.create(AppController.prototype) as {
      api: Pick<ApiClient, 'resetDemo'>;
      users: ActorResource[];
      tasks: TaskResource[];
      currentUserId: string;
      commentDrafts: Map<string, string>;
      adminOverview: unknown;
      identityChangeSequence: number;
      routeChangeSequence: number;
      storage: Storage;
      window: {
        confirm: () => boolean;
        location: { hash: string };
        history: {
          replaceState: (state: null, title: string, url: string) => void;
        };
      };
      route: unknown;
      elements: Record<string, unknown>;
      gate: {
        run: <T>(key: string, operation: () => Promise<T>) => Promise<T>;
      };
      loadTasksForCurrentUser: () => Promise<TaskResource[]>;
      closeProfileMenu: () => void;
      closeDrawer: () => void;
      render: () => void;
      showToast: (message: string) => void;
      resetDemo: () => Promise<void>;
    };
    controller.api = {
      resetDemo: () =>
        new Promise((resolve) => {
          releaseReset = resolve;
        }),
    };
    controller.users = [RESET_ONLY_USER, TASK_VIEWER];
    controller.tasks = [STALE_TASK];
    controller.currentUserId = RESET_ONLY_USER.id;
    controller.commentDrafts = new Map([
      ['reset-only\u0000task-stale', '待清除'],
    ]);
    controller.adminOverview = { users: [], roles: [], permissions: [] };
    controller.identityChangeSequence = 0;
    controller.storage = {
      setItem: () => undefined,
      removeItem: () => undefined,
    } as unknown as Storage;
    controller.window = {
      confirm: () => true,
      location: { hash: '' },
      history: { replaceState: () => undefined },
    };
    controller.route = {};
    controller.elements = {};
    controller.gate = { run: (_key, operation) => operation() };
    controller.loadTasksForCurrentUser = () =>
      new Promise((resolve) => {
        releaseTasks = resolve;
      });
    controller.closeProfileMenu = vi.fn();
    controller.closeDrawer = vi.fn();
    controller.render = vi.fn();
    controller.showToast = vi.fn();

    const pending = controller.resetDemo();
    releaseReset({ reset: true });
    await new Promise<void>((resolve) => {
      queueMicrotask(resolve);
    });

    expect(controller.currentUserId).toBe(TASK_VIEWER.id);
    expect(controller.tasks).toEqual([]);
    expect(controller.commentDrafts).toEqual(new Map());
    expect(controller.adminOverview).toBeNull();
    expect(controller.closeDrawer).toHaveBeenCalledOnce();
    expect(controller.render).toHaveBeenCalledOnce();

    releaseTasks([]);
    await pending;
  });

  /** Ensures a reset completed after route departure cannot switch or notify the departed view. */
  it('discards reset completion after the route changes', async () => {
    let releaseReset!: (result: { reset: true }) => void;
    const controller = Object.create(AppController.prototype) as {
      api: Pick<ApiClient, 'resetDemo'>;
      users: ActorResource[];
      tasks: TaskResource[];
      currentUserId: string;
      adminOverview: unknown;
      identityChangeSequence: number;
      routeChangeSequence: number;
      storage: Storage;
      window: {
        confirm: () => boolean;
        location: { hash: string };
        history: {
          replaceState: (state: null, title: string, url: string) => void;
        };
      };
      route: unknown;
      elements: Record<string, unknown>;
      gate: {
        run: <T>(key: string, operation: () => Promise<T>) => Promise<T>;
      };
      closeProfileMenu: () => void;
      closeDrawer: () => void;
      render: () => void;
      showToast: (message: string) => void;
      resetDemo: () => Promise<void>;
    };
    controller.api = {
      resetDemo: () =>
        new Promise((resolve) => {
          releaseReset = resolve;
        }),
    };
    controller.users = [RESET_ONLY_USER, TASK_VIEWER];
    controller.tasks = [STALE_TASK];
    controller.currentUserId = RESET_ONLY_USER.id;
    controller.adminOverview = { users: [], roles: [], permissions: [] };
    controller.identityChangeSequence = 0;
    controller.routeChangeSequence = 0;
    controller.storage = {
      setItem: () => undefined,
      removeItem: () => undefined,
    } as unknown as Storage;
    controller.window = {
      confirm: () => true,
      location: { hash: '#home' },
      history: { replaceState: () => undefined },
    };
    controller.route = { view: 'home' };
    controller.elements = {};
    controller.gate = { run: (_key, operation) => operation() };
    controller.closeProfileMenu = vi.fn();
    controller.closeDrawer = vi.fn();
    controller.render = vi.fn();
    controller.showToast = vi.fn();

    const pending = controller.resetDemo();
    controller.routeChangeSequence = 1;
    releaseReset({ reset: true });
    await pending;

    expect(controller.currentUserId).toBe(RESET_ONLY_USER.id);
    expect(controller.tasks).toEqual([STALE_TASK]);
    expect(controller.closeDrawer).not.toHaveBeenCalled();
    expect(controller.render).not.toHaveBeenCalled();
    expect(controller.showToast).not.toHaveBeenCalled();
  });

  /** Ensures the initial task request cannot render after startup has moved to another route. */
  it('discards the initial task response after the route changes', async () => {
    let releaseTasks!: (tasks: TaskResource[]) => void;
    const controller = Object.create(AppController.prototype) as {
      api: Pick<ApiClient, 'listDemoUsers' | 'listTasks'>;
      styles: { normalize: (styleId: string | null) => string };
      storage: Storage;
      users: ActorResource[];
      tasks: TaskResource[];
      currentUserId: string;
      adminOverview: unknown;
      identityChangeSequence: number;
      routeChangeSequence: number;
      route: { view: string };
      renderStaticOptions: () => void;
      bindEvents: () => void;
      renderStyle: (styleId: string) => void;
      render: () => void;
      start: () => Promise<void>;
    };
    controller.api = {
      listDemoUsers: () => Promise.resolve([TASK_VIEWER]),
      listTasks: () =>
        new Promise((resolve) => {
          releaseTasks = resolve;
        }),
    };
    controller.styles = { normalize: () => 'swiss-international' };
    controller.storage = {
      getItem: (key: string) =>
        key === 'noticeboard-user'
          ? JSON.stringify({ currentUserId: TASK_VIEWER.id })
          : null,
      setItem: () => undefined,
      removeItem: () => undefined,
    } as unknown as Storage;
    controller.users = [];
    controller.tasks = [STALE_TASK];
    controller.currentUserId = '';
    controller.adminOverview = null;
    controller.identityChangeSequence = 0;
    controller.routeChangeSequence = 0;
    controller.route = { view: 'tasks' };
    controller.renderStaticOptions = vi.fn();
    controller.bindEvents = vi.fn();
    controller.renderStyle = vi.fn();
    controller.render = vi.fn();

    const pending = controller.start();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    controller.routeChangeSequence = 1;
    releaseTasks([]);
    await pending;

    expect(controller.tasks).toEqual([STALE_TASK]);
    expect(controller.render).not.toHaveBeenCalled();
  });

  /** Ensures a route change reloads tasks when it invalidates the initial startup request. */
  it('reloads tasks after startup is superseded by a task route', async () => {
    const taskResolvers: Array<(tasks: TaskResource[]) => void> = [];
    const requestedActors: string[] = [];
    const replacementTask = { ...STALE_TASK, id: 'task-route-reload' };
    const controller = Object.create(AppController.prototype) as {
      api: Pick<ApiClient, 'listDemoUsers' | 'listTasks'>;
      styles: { normalize: (styleId: string | null) => string };
      storage: Storage;
      users: ActorResource[];
      tasks: TaskResource[];
      tasksLoaded: boolean;
      currentUserId: string;
      identityChangeSequence: number;
      routeChangeSequence: number;
      route: { view: string };
      window: { location: { hash: string } };
      renderStaticOptions: () => void;
      bindEvents: () => void;
      renderStyle: (styleId: string) => void;
      render: () => void;
      start: () => Promise<void>;
      handleRouteChange: () => Promise<void>;
    };
    controller.api = {
      listDemoUsers: () => Promise.resolve([TASK_VIEWER]),
      listTasks: (actorId) => {
        requestedActors.push(actorId);
        return new Promise((resolve) => taskResolvers.push(resolve));
      },
    };
    controller.styles = { normalize: () => 'swiss-international' };
    controller.storage = {
      getItem: (key: string) =>
        key === 'noticeboard-user'
          ? JSON.stringify({ currentUserId: TASK_VIEWER.id })
          : null,
      setItem: () => undefined,
      removeItem: () => undefined,
    } as unknown as Storage;
    controller.users = [];
    controller.tasks = [];
    controller.tasksLoaded = false;
    controller.currentUserId = '';
    controller.identityChangeSequence = 0;
    controller.routeChangeSequence = 0;
    controller.route = { view: 'home' };
    controller.window = { location: { hash: '#home' } };
    controller.renderStaticOptions = vi.fn();
    controller.bindEvents = vi.fn();
    controller.renderStyle = vi.fn();
    controller.render = vi.fn();

    const startup = controller.start();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    controller.window.location.hash = '#tasks?scope=all&filter=全部';
    const routeChange = controller.handleRouteChange();

    expect(taskResolvers).toHaveLength(2);
    taskResolvers[0]!([STALE_TASK]);
    await startup;
    taskResolvers[1]!([replacementTask]);
    await routeChange;

    expect(requestedActors).toEqual([TASK_VIEWER.id, TASK_VIEWER.id]);
    expect(controller.tasks).toEqual([replacementTask]);
    expect(controller.tasksLoaded).toBe(true);
  });

  /** Ensures startup access loss uses the persisted administrator fallback flow. */
  it('persists a fallback identity when startup admin access is denied', async () => {
    const fallbackAdmin: ActorResource = {
      ...CURRENT_USER,
      id: 'startup-replacement-admin',
      permissions: ['system.manage', 'tasks.view'],
    };
    const storedValues: string[] = [];
    let directoryCall = 0;
    const controller = Object.create(AppController.prototype) as {
      api: Pick<ApiClient, 'listDemoUsers' | 'getAdminOverview'>;
      styles: { normalize: (styleId: string | null) => string };
      storage: Storage;
      users: ActorResource[];
      tasks: TaskResource[];
      currentUserId: string;
      adminOverview: unknown;
      identityChangeSequence: number;
      routeChangeSequence: number;
      route: { view: string };
      window: {
        location: { hash: string };
        history: {
          replaceState: (state: null, title: string, url: string) => void;
        };
      };
      renderStaticOptions: () => void;
      bindEvents: () => void;
      renderStyle: (styleId: string) => void;
      closeProfileMenu: () => void;
      closeDrawer: () => void;
      render: () => void;
      showToast: (message: string) => void;
      start: () => Promise<void>;
    };
    controller.api = {
      listDemoUsers: () =>
        Promise.resolve(
          directoryCall++ === 0 ? [CURRENT_USER] : [fallbackAdmin],
        ),
      getAdminOverview: () =>
        Promise.reject(new ApiError(403, 'FORBIDDEN', '无权访问管理信息')),
    };
    controller.styles = { normalize: () => 'swiss-international' };
    controller.storage = {
      getItem: (key: string) =>
        key === 'noticeboard-user'
          ? JSON.stringify({ currentUserId: CURRENT_USER.id })
          : null,
      setItem: (_key: string, value: string) => storedValues.push(value),
      removeItem: () => undefined,
    } as unknown as Storage;
    controller.users = [];
    controller.tasks = [];
    controller.currentUserId = '';
    controller.adminOverview = null;
    controller.identityChangeSequence = 0;
    controller.routeChangeSequence = 0;
    controller.route = { view: 'admin' };
    controller.window = {
      location: { hash: '#admin' },
      history: { replaceState: () => undefined },
    };
    controller.renderStaticOptions = vi.fn();
    controller.bindEvents = vi.fn();
    controller.renderStyle = vi.fn();
    controller.closeProfileMenu = vi.fn();
    controller.closeDrawer = vi.fn();
    controller.render = vi.fn();
    controller.showToast = vi.fn();

    await controller.start();

    expect(controller.currentUserId).toBe(fallbackAdmin.id);
    expect(JSON.parse(storedValues.at(-1) ?? '{}')).toEqual({
      currentUserId: fallbackAdmin.id,
    });
  });

  /** Ensures an older same-identity admin refresh cannot replace a newer overview. */
  it('discards an older same-identity admin refresh', async () => {
    const directoryResolvers: Array<(users: ActorResource[]) => void> = [];
    const overviewResolvers: Array<(overview: AdminOverviewResource) => void> =
      [];
    const firstOverview: AdminOverviewResource = {
      users: [],
      roles: [],
      permissions: [],
    };
    const secondOverview: AdminOverviewResource = {
      users: [],
      roles: [],
      permissions: [],
    };
    const controller = Object.create(AppController.prototype) as {
      api: Pick<ApiClient, 'listDemoUsers' | 'getAdminOverview'>;
      users: ActorResource[];
      tasks: TaskResource[];
      currentUserId: string;
      adminOverview: AdminOverviewResource | null;
      identityChangeSequence: number;
      routeChangeSequence: number;
      route: { view: string };
      loadTasksForCurrentUser: () => Promise<TaskResource[]>;
      render: () => void;
      refreshAdminOverview: () => Promise<void>;
    };
    controller.api = {
      listDemoUsers: () =>
        new Promise((resolve) => directoryResolvers.push(resolve)),
      getAdminOverview: () =>
        new Promise((resolve) => overviewResolvers.push(resolve)),
    };
    controller.users = [CURRENT_USER];
    controller.tasks = [];
    controller.currentUserId = CURRENT_USER.id;
    controller.adminOverview = null;
    controller.identityChangeSequence = 0;
    controller.routeChangeSequence = 0;
    controller.route = { view: 'admin' };
    controller.loadTasksForCurrentUser = () => Promise.resolve([]);
    controller.render = vi.fn();

    const firstRefresh = controller.refreshAdminOverview();
    directoryResolvers[0]!([CURRENT_USER]);
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(overviewResolvers).toHaveLength(1);
    const secondRefresh = controller.refreshAdminOverview();
    directoryResolvers[1]!([CURRENT_USER]);
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(overviewResolvers).toHaveLength(2);
    overviewResolvers[1]!(secondOverview);
    await secondRefresh;
    overviewResolvers[0]!(firstOverview);
    await firstRefresh;

    expect(controller.adminOverview).toBe(secondOverview);
    expect(controller.render).toHaveBeenCalledOnce();
  });

  /** Ensures a non-authorization admin load failure cannot render cached management data. */
  it('clears cached admin data on a non-authorization route error', async () => {
    const controller = Object.create(AppController.prototype) as {
      api: Pick<ApiClient, 'getAdminOverview'>;
      users: ActorResource[];
      tasks: TaskResource[];
      tasksLoaded: boolean;
      currentUserId: string;
      adminOverview: AdminOverviewResource | null;
      identityChangeSequence: number;
      routeChangeSequence: number;
      route: { view: string };
      window: { location: { hash: string } };
      render: () => void;
      showToast: (message: string) => void;
      handleRouteChange: () => Promise<void>;
    };
    controller.api = {
      getAdminOverview: () =>
        Promise.reject(new ApiError(500, 'SERVER_ERROR', '管理信息加载失败')),
    };
    controller.users = [CURRENT_USER];
    controller.tasks = [];
    controller.tasksLoaded = true;
    controller.currentUserId = CURRENT_USER.id;
    controller.adminOverview = {
      users: [],
      roles: [],
      permissions: [],
    };
    controller.identityChangeSequence = 0;
    controller.routeChangeSequence = 0;
    controller.route = { view: 'admin' };
    controller.window = { location: { hash: '#admin' } };
    controller.render = vi.fn();
    controller.showToast = vi.fn();

    await controller.handleRouteChange();

    expect(controller.adminOverview).toBeNull();
    expect(controller.render).toHaveBeenCalledOnce();
    expect(controller.showToast).toHaveBeenCalledOnce();
  });

  /** Ensures a direct route overview request cannot overwrite a newer admin refresh. */
  it('discards a direct admin overview response after a newer refresh starts', async () => {
    const overviewResolvers: Array<(overview: AdminOverviewResource) => void> =
      [];
    const staleOverview: AdminOverviewResource = {
      users: [],
      roles: [],
      permissions: [],
    };
    const freshOverview: AdminOverviewResource = {
      users: [],
      roles: [],
      permissions: [],
    };
    const controller = Object.create(AppController.prototype) as {
      api: Pick<ApiClient, 'getAdminOverview' | 'listDemoUsers'>;
      users: ActorResource[];
      tasks: TaskResource[];
      tasksLoaded: boolean;
      currentUserId: string;
      adminOverview: AdminOverviewResource | null;
      identityChangeSequence: number;
      routeChangeSequence: number;
      route: { view: string };
      window: {
        location: { hash: string };
        history: {
          replaceState: (state: null, title: string, url: string) => void;
        };
      };
      loadTasksForCurrentUser: () => Promise<TaskResource[]>;
      render: () => void;
      handleRouteChange: () => Promise<void>;
      refreshAdminOverview: (
        identity: { actorId: string; sequence: number },
        routeSequence: number,
      ) => Promise<boolean>;
    };
    controller.api = {
      getAdminOverview: () =>
        new Promise((resolve) => overviewResolvers.push(resolve)),
      listDemoUsers: () => Promise.resolve([CURRENT_USER]),
    };
    controller.users = [CURRENT_USER];
    controller.tasks = [];
    controller.tasksLoaded = true;
    controller.currentUserId = CURRENT_USER.id;
    controller.adminOverview = null;
    controller.identityChangeSequence = 0;
    controller.routeChangeSequence = 0;
    controller.route = { view: 'home' };
    controller.window = {
      location: { hash: '#admin' },
      history: { replaceState: () => undefined },
    };
    controller.loadTasksForCurrentUser = () => Promise.resolve([]);
    controller.render = vi.fn();

    const directRequest = controller.handleRouteChange();
    const refreshRequest = controller.refreshAdminOverview(
      { actorId: CURRENT_USER.id, sequence: 0 },
      1,
    );
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(overviewResolvers).toHaveLength(2);
    overviewResolvers[1]!(freshOverview);
    await refreshRequest;
    overviewResolvers[0]!(staleOverview);
    await directRequest;

    expect(controller.adminOverview).toBe(freshOverview);
    expect(controller.render).toHaveBeenCalledOnce();
  });

  /** Ensures a current fallback failure renders the home route after replacing the URL. */
  it('renders home after the current admin fallback fails', async () => {
    const controller = Object.create(AppController.prototype) as {
      api: Pick<ApiClient, 'getAdminOverview' | 'listDemoUsers'>;
      users: ActorResource[];
      currentUserId: string;
      adminOverview: AdminOverviewResource | null;
      identityChangeSequence: number;
      routeChangeSequence: number;
      route: { view: string };
      window: {
        location: { hash: string };
        history: {
          replaceState: (state: null, title: string, url: string) => void;
        };
      };
      render: () => void;
      showToast: (message: string) => void;
      handleRouteChange: () => Promise<void>;
    };
    controller.api = {
      getAdminOverview: () =>
        Promise.reject(new ApiError(403, 'FORBIDDEN', '无权访问管理信息')),
      listDemoUsers: () =>
        Promise.reject(new ApiError(500, 'SERVER_ERROR', '用户目录加载失败')),
    };
    controller.users = [CURRENT_USER];
    controller.currentUserId = CURRENT_USER.id;
    controller.adminOverview = {
      users: [],
      roles: [],
      permissions: [],
    };
    controller.identityChangeSequence = 0;
    controller.routeChangeSequence = 0;
    controller.route = { view: 'admin' };
    controller.window = {
      location: { hash: '#admin' },
      history: {
        replaceState: (_state, _title, url) => {
          controller.window.location.hash = url;
        },
      },
    };
    controller.render = vi.fn();
    controller.showToast = vi.fn();

    await controller.handleRouteChange();

    expect(controller.route.view).toBe('home');
    expect(controller.window.location.hash).toBe('#home');
    expect(controller.adminOverview).toBeNull();
    expect(controller.render).toHaveBeenCalledOnce();
    expect(controller.showToast).toHaveBeenCalledOnce();
  });

  /** Ensures route-triggered access loss persists the same safe identity fallback as admin refresh. */
  it('persists a fallback identity when the admin route loses access', async () => {
    const fallbackAdmin: ActorResource = {
      ...CURRENT_USER,
      id: 'route-replacement-admin',
      name: '路由替补管理员',
    };
    const overviewRequests: string[] = [];
    const storedValues: string[] = [];
    const controller = Object.create(AppController.prototype) as {
      api: Pick<ApiClient, 'getAdminOverview' | 'listDemoUsers'>;
      users: ActorResource[];
      tasks: TaskResource[];
      currentUserId: string;
      adminOverview: unknown;
      identityChangeSequence: number;
      routeChangeSequence: number;
      storage: Storage;
      window: {
        location: { hash: string };
        history: {
          replaceState: (state: null, title: string, url: string) => void;
        };
      };
      route: unknown;
      loadTasksForCurrentUser: () => Promise<TaskResource[]>;
      closeProfileMenu: () => void;
      closeDrawer: () => void;
      render: () => void;
      showToast: (message: string) => void;
      handleRouteChange: () => Promise<void>;
    };
    controller.api = {
      getAdminOverview: (actorId) => {
        overviewRequests.push(actorId);
        return Promise.reject(
          new ApiError(403, 'FORBIDDEN', '无权访问管理信息'),
        );
      },
      listDemoUsers: () => Promise.resolve([fallbackAdmin]),
    };
    controller.users = [CURRENT_USER];
    controller.tasks = [STALE_TASK];
    controller.currentUserId = CURRENT_USER.id;
    controller.adminOverview = {
      users: [],
      roles: [],
      permissions: [],
    };
    controller.identityChangeSequence = 0;
    controller.routeChangeSequence = 0;
    controller.storage = {
      setItem: (_key: string, value: string) => storedValues.push(value),
      removeItem: () => undefined,
    } as unknown as Storage;
    controller.window = {
      location: { hash: '#admin' },
      history: {
        replaceState: (_state, _title, url) => {
          controller.window.location.hash = url;
        },
      },
    };
    controller.route = {};
    controller.loadTasksForCurrentUser = () => Promise.resolve([]);
    controller.closeProfileMenu = vi.fn();
    controller.closeDrawer = vi.fn();
    controller.render = vi.fn();
    controller.showToast = vi.fn();

    await controller.handleRouteChange();

    expect(controller.currentUserId).toBe(fallbackAdmin.id);
    expect(JSON.parse(storedValues.at(-1) ?? '{}')).toEqual({
      currentUserId: fallbackAdmin.id,
    });
    expect(overviewRequests).toEqual([CURRENT_USER.id]);
    expect(controller.route).toMatchObject({ view: 'home' });
    expect(controller.showToast).not.toHaveBeenCalled();
  });

  /** Ensures a route request's stale error cannot toast or overwrite a later admin request. */
  it('ignores an earlier admin route error after leaving and re-entering the route', async () => {
    const rejectors: Array<(error: unknown) => void> = [];
    const resolvers: Array<(overview: AdminOverviewResource) => void> = [];
    const newOverview: AdminOverviewResource = {
      users: [],
      roles: [],
      permissions: [],
    };
    const controller = Object.create(AppController.prototype) as {
      api: Pick<ApiClient, 'getAdminOverview'>;
      users: ActorResource[];
      tasks: TaskResource[];
      tasksLoaded: boolean;
      currentUserId: string;
      adminOverview: unknown;
      identityChangeSequence: number;
      routeChangeSequence: number;
      route: { view: string };
      window: {
        location: { hash: string };
        history: {
          replaceState: (state: null, title: string, url: string) => void;
        };
      };
      render: () => void;
      showToast: (message: string) => void;
      handleRouteChange: () => Promise<void>;
    };
    controller.api = {
      getAdminOverview: () =>
        new Promise<AdminOverviewResource>((resolve, reject) => {
          resolvers.push(resolve);
          rejectors.push(reject);
        }),
    };
    controller.users = [CURRENT_USER];
    controller.tasks = [];
    controller.tasksLoaded = true;
    controller.currentUserId = CURRENT_USER.id;
    controller.adminOverview = null;
    controller.identityChangeSequence = 0;
    controller.routeChangeSequence = 0;
    controller.route = { view: 'home' };
    controller.window = {
      location: { hash: '#admin' },
      history: {
        replaceState: (_state, _title, url) => {
          controller.window.location.hash = url;
        },
      },
    };
    controller.render = vi.fn();
    controller.showToast = vi.fn();

    const firstRequest = controller.handleRouteChange();
    controller.window.location.hash = '#home';
    await controller.handleRouteChange();
    controller.window.location.hash = '#admin';
    const secondRequest = controller.handleRouteChange();

    rejectors[0]!(new ApiError(500, 'SERVER_ERROR', '管理信息加载失败'));
    await firstRequest;
    expect(controller.adminOverview).toBeNull();
    expect(controller.render).toHaveBeenCalledOnce();
    expect(controller.showToast).not.toHaveBeenCalled();

    resolvers[1]!(newOverview);
    await secondRequest;
    expect(controller.adminOverview).toEqual(newOverview);
    expect(controller.render).toHaveBeenCalledTimes(2);
  });

  /** Ensures an earlier identity response cannot overwrite a later identity snapshot. */
  it('discards out-of-order identity-switch responses', async () => {
    const resolvers: Array<(tasks: TaskResource[]) => void> = [];
    const controller = Object.create(AppController.prototype) as {
      elements: { identitySelect: { value: string } };
      storage: Storage;
      users: ActorResource[];
      tasks: TaskResource[];
      currentUserId: string;
      adminOverview: unknown;
      identityChangeSequence: number;
      api: Pick<ApiClient, 'listDemoUsers'>;
      loadTasksForCurrentUser: () => Promise<TaskResource[]>;
      canManage: () => boolean;
      render: () => void;
      showToast: (message: string) => void;
      changeIdentity: () => Promise<void>;
    };
    const firstTasks = { ...STALE_TASK, id: 'task-first-identity' };
    controller.elements = { identitySelect: { value: TASK_VIEWER.id } };
    controller.storage = {
      setItem: () => undefined,
      removeItem: () => undefined,
    } as unknown as Storage;
    controller.users = [RESET_ONLY_USER, TASK_VIEWER];
    controller.tasks = [];
    controller.currentUserId = RESET_ONLY_USER.id;
    controller.adminOverview = null;
    controller.identityChangeSequence = 0;
    controller.api = {
      listDemoUsers: () => Promise.resolve(controller.users),
    };
    controller.loadTasksForCurrentUser = () =>
      new Promise((resolve) => resolvers.push(resolve));
    controller.canManage = () => false;
    controller.render = vi.fn();
    controller.showToast = vi.fn();

    const firstSwitch = controller.changeIdentity();
    controller.elements.identitySelect.value = RESET_ONLY_USER.id;
    const secondSwitch = controller.changeIdentity();
    resolvers[1]!([]);
    await secondSwitch;
    resolvers[0]!([firstTasks]);
    await firstSwitch;

    expect(controller.currentUserId).toBe(RESET_ONLY_USER.id);
    expect(controller.tasks).toEqual([]);
  });

  /** Ensures a denied management refresh cannot leave protected overview data rendered. */
  it('clears the cached admin view when overview access is denied', async () => {
    const refreshedUser: ActorResource = {
      ...CURRENT_USER,
      role: 'user',
      roleLabel: '用户',
      permissions: ['tasks.view'],
    };
    const cachedOverview = {
      users: [{ id: 'cached-user' }],
      roles: [{ id: 'cached-role' }],
      permissions: [],
    };
    const controller = Object.create(AppController.prototype) as {
      api: Pick<ApiClient, 'listDemoUsers' | 'getAdminOverview'>;
      users: ActorResource[];
      currentUserId: string;
      adminOverview: unknown;
      identityChangeSequence: number;
      routeChangeSequence: number;
      route: { view: string };
      window: {
        location: { hash: string };
        history: {
          replaceState: (state: null, title: string, url: string) => void;
        };
      };
      canManage: () => boolean;
      handleRouteChange: () => Promise<void>;
      render: () => void;
      showToast: (message: string) => void;
      loadTasksForCurrentUser: () => Promise<TaskResource[]>;
      closeProfileMenu: () => void;
      closeDrawer: () => void;
    };
    controller.users = [CURRENT_USER];
    controller.currentUserId = CURRENT_USER.id;
    controller.adminOverview = cachedOverview;
    controller.identityChangeSequence = 0;
    controller.routeChangeSequence = 0;
    controller.route = { view: 'admin' };
    controller.window = {
      location: { hash: '#admin' },
      history: {
        replaceState: (_state, _title, url) => {
          controller.window.location.hash = url;
        },
      },
    };
    controller.canManage = () =>
      controller.users.some(
        (user) =>
          user.id === controller.currentUserId &&
          user.permissions?.includes('system.manage'),
      );
    controller.api = {
      listDemoUsers: vi.fn(() => Promise.resolve([refreshedUser])),
      getAdminOverview: vi.fn(() =>
        Promise.reject(new ApiError(403, 'FORBIDDEN', '无权访问管理信息')),
      ),
    };
    controller.render = vi.fn();
    controller.showToast = vi.fn();
    controller.loadTasksForCurrentUser = () => Promise.resolve([]);
    controller.closeProfileMenu = vi.fn();
    controller.closeDrawer = vi.fn();

    await controller.handleRouteChange();

    expect(controller.api.listDemoUsers).toHaveBeenCalledOnce();
    expect(controller.adminOverview).toBeNull();
    expect(controller.route.view).toBe('home');
    expect(controller.window.location.hash).toBe('#home');
    expect(controller.render).toHaveBeenCalledTimes(2);
  });
});

describe('AppController administration management UI', () => {
  class TestElement {
    /** Creates a test event target carrying delegated admin data attributes. */
    constructor(public readonly dataset: Record<string, string>) {}

    /** Provides the selector matching surface used by delegated controller handlers. */
    closest(selector: string): TestElement | null {
      return selector === '[data-admin-open]' && this.dataset.adminOpen
        ? this
        : selector === '[data-admin-close]' && this.dataset.adminClose
          ? this
          : selector === '[data-admin-sort]' && this.dataset.adminSort
            ? this
            : selector === '[data-admin-action]' && this.dataset.adminAction
              ? this
              : null;
    }
  }

  class TestForm {
    /** Creates a test form carrying the delegated admin form identifier. */
    constructor(
      public readonly dataset: Record<string, string>,
      public readonly fields: Record<string, string | string[]> = {},
    ) {}
  }

  /** Installs the smallest browser constructor shims needed by delegated handlers in node tests. */
  function installDomShims(): void {
    (globalThis as { Element?: unknown }).Element = TestElement;
    (globalThis as { HTMLFormElement?: unknown }).HTMLFormElement = TestForm;
    (globalThis as { FormData?: unknown }).FormData = class {
      private readonly fields: Record<string, string | string[]>;

      /** Copies submitted fake form values into the constructor-compatible shim. */
      constructor(form?: TestForm) {
        this.fields = form?.fields ?? {};
      }

      /** Returns the submitted text field while preserving existing test defaults. */
      get(name: string): string {
        const value = this.fields[name];
        if (Array.isArray(value)) return value[0] ?? '';
        if (value !== undefined) return value;
        return name === 'name' ? '测试用户' : '';
      }

      /** Returns all submitted values for repeated permission checkbox names. */
      getAll(name: string): string[] {
        const value = this.fields[name];
        if (Array.isArray(value)) return value;
        return value === undefined ? [] : [value];
      }
    };
  }

  /** Ensures nested admin routes reach the renderer with parsed section and sort state. */
  it('renders the route-selected admin child list state', () => {
    const renderAdminView = vi.spyOn(adminRenderer, 'renderAdminView');
    const controller = Object.create(AppController.prototype) as {
      route: {
        view: 'admin';
        section: 'users';
        sort: { field: 'name'; direction: 'asc' };
      };
      adminOverview: AdminOverviewResource;
      canManage: () => boolean;
      elements: { adminView: HTMLElement };
      document: Document;
      renderAdmin: () => void;
    };
    controller.route = {
      view: 'admin',
      section: 'users',
      sort: { field: 'name', direction: 'asc' },
    };
    controller.adminOverview = { users: [], roles: [], permissions: [] };
    controller.canManage = () => true;
    controller.elements = { adminView: {} as HTMLElement };
    controller.document = {} as Document;

    controller.renderAdmin();

    expect(renderAdminView).toHaveBeenCalledWith(
      controller.document,
      controller.elements.adminView,
      controller.adminOverview,
      { section: 'users', sort: { field: 'name', direction: 'asc' } },
    );
  });

  /** Ensures an editor trigger stores state and a delegated cancel clears it without a request. */
  it('opens and closes an admin editor through delegated events', async () => {
    installDomShims();
    const controller = Object.create(AppController.prototype) as {
      adminEditor: unknown;
      adminOverview: AdminOverviewResource;
      render: ReturnType<typeof vi.fn>;
      handleAdminClick: (event: Event) => Promise<void>;
      elements: { adminView: HTMLElement };
    };
    const openButton = new TestElement({
      adminOpen: 'user',
      adminId: 'user-1',
    });
    const closeButton = new TestElement({ adminClose: 'dialog' });
    controller.adminEditor = null;
    controller.adminOverview = {
      users: [{ id: 'user-1' } as AdminOverviewResource['users'][number]],
      roles: [],
      permissions: [],
    };
    controller.render = vi.fn();
    controller.elements = { adminView: {} as HTMLElement };

    await controller.handleAdminClick({
      target: openButton,
    } as unknown as Event);
    expect(controller.adminEditor).toEqual({
      kind: 'user',
      mode: 'edit',
      record: controller.adminOverview.users[0],
    });
    await controller.handleAdminClick({
      target: closeButton,
    } as unknown as Event);
    expect(controller.adminEditor).toBeNull();
  });

  /** Ensures desktop and mobile sorting update the hash in memory without refreshing overview data. */
  it('replaces nested admin sort hashes without a network refresh', async () => {
    installDomShims();
    const replaceState = vi.fn();
    const controller = Object.create(AppController.prototype) as {
      route: {
        view: 'admin';
        section: 'roles';
        sort: { field: 'name'; direction: 'asc' };
      };
      window: { history: { replaceState: typeof replaceState } };
      render: ReturnType<typeof vi.fn>;
      refreshAdminOverview: ReturnType<typeof vi.fn>;
      handleAdminClick: (event: Event) => Promise<void>;
    };
    controller.route = {
      view: 'admin',
      section: 'roles',
      sort: { field: 'name', direction: 'asc' },
    };
    controller.window = { history: { replaceState } };
    controller.render = vi.fn();
    controller.refreshAdminOverview = vi.fn();
    const button = new TestElement({ adminSort: 'permissions' });

    await controller.handleAdminClick({ target: button } as unknown as Event);

    expect(replaceState).toHaveBeenCalledWith(
      null,
      '',
      '#admin/roles?sort=permissions&direction=asc',
    );
    expect(controller.refreshAdminOverview).not.toHaveBeenCalled();
    expect(controller.render).toHaveBeenCalledOnce();
  });

  /** Ensures a failed admin mutation preserves the open editor for correction. */
  it('preserves the editor when a CRUD request fails', async () => {
    installDomShims();
    const controller = Object.create(AppController.prototype) as {
      adminEditor: unknown;
      api: { createAdminUser: () => Promise<never> };
      requestSnapshot: () => {
        actorId: string;
        sequence: number;
        routeSequence: number;
      };
      isCurrentRequest: () => boolean;
      gate: {
        run: (_key: string, operation: () => Promise<void>) => Promise<void>;
      };
      showToast: ReturnType<typeof vi.fn>;
      render: ReturnType<typeof vi.fn>;
      handleAdminSubmit: (event: SubmitEvent) => Promise<void>;
    };
    const editor = { kind: 'user', mode: 'create' };
    controller.adminEditor = editor;
    controller.api = {
      createAdminUser: () => Promise.reject(new Error('failed')),
    };
    controller.requestSnapshot = () => ({
      actorId: 'admin',
      sequence: 0,
      routeSequence: 0,
    });
    controller.isCurrentRequest = () => true;
    controller.gate = { run: (_key, operation) => operation() };
    controller.showToast = vi.fn();
    controller.render = vi.fn();
    const form = new TestForm(
      { adminForm: 'create-user' },
      { name: '保留的用户名称', roleId: 'role-custom' },
    );

    await controller.handleAdminSubmit({
      preventDefault: () => undefined,
      target: form,
    } as unknown as SubmitEvent);

    expect(controller.adminEditor).toEqual({
      ...editor,
      draft: { name: '保留的用户名称', roleId: 'role-custom' },
    });
    expect(controller.showToast).toHaveBeenCalledOnce();
  });

  /** Ensures a failed role mutation keeps the entered name and permission selections. */
  it('preserves role form values when a CRUD request fails', async () => {
    installDomShims();
    const controller = Object.create(AppController.prototype) as {
      adminEditor: unknown;
      api: { updateAdminRole: () => Promise<never> };
      requestSnapshot: () => {
        actorId: string;
        sequence: number;
        routeSequence: number;
      };
      isCurrentRequest: () => boolean;
      gate: {
        run: (_key: string, operation: () => Promise<void>) => Promise<void>;
      };
      showToast: ReturnType<typeof vi.fn>;
      render: ReturnType<typeof vi.fn>;
      handleAdminSubmit: (event: SubmitEvent) => Promise<void>;
    };
    const editor = {
      kind: 'role',
      mode: 'edit',
      record: { id: 'role-1' },
    };
    controller.adminEditor = editor;
    controller.api = {
      updateAdminRole: () => Promise.reject(new Error('failed')),
    };
    controller.requestSnapshot = () => ({
      actorId: 'admin',
      sequence: 0,
      routeSequence: 0,
    });
    controller.isCurrentRequest = () => true;
    controller.gate = { run: (_key, operation) => operation() };
    controller.showToast = vi.fn();
    controller.render = vi.fn();
    const form = new TestForm(
      { adminForm: 'role', adminId: 'role-1' },
      {
        name: '保留的角色名称',
        permissions: ['tasks.view', 'tasks.review'],
      },
    );

    await controller.handleAdminSubmit({
      preventDefault: () => undefined,
      target: form,
    } as unknown as SubmitEvent);

    expect(controller.adminEditor).toEqual({
      ...editor,
      draft: {
        name: '保留的角色名称',
        permissions: ['tasks.view', 'tasks.review'],
      },
    });
    expect(controller.showToast).toHaveBeenCalledOnce();
  });

  /** Ensures a successful delete/restore refresh closes an editor and re-renders the child page. */
  it('closes the editor after a successful lifecycle refresh', async () => {
    installDomShims();
    const controller = Object.create(AppController.prototype) as {
      adminEditor: unknown;
      api: { deleteAdminRole: () => Promise<void> };
      requestSnapshot: () => {
        actorId: string;
        sequence: number;
        routeSequence: number;
      };
      isCurrentRequest: () => boolean;
      refreshAdminOverview: () => Promise<boolean>;
      gate: {
        run: (_key: string, operation: () => Promise<void>) => Promise<void>;
      };
      render: ReturnType<typeof vi.fn>;
      showToast: ReturnType<typeof vi.fn>;
      handleAdminClick: (event: Event) => Promise<void>;
    };
    controller.adminEditor = { kind: 'role', mode: 'edit' };
    controller.api = { deleteAdminRole: () => Promise.resolve() };
    controller.requestSnapshot = () => ({
      actorId: 'admin',
      sequence: 0,
      routeSequence: 0,
    });
    controller.isCurrentRequest = () => true;
    controller.refreshAdminOverview = () => Promise.resolve(true);
    controller.gate = { run: (_key, operation) => operation() };
    controller.render = vi.fn();
    controller.showToast = vi.fn();
    const button = new TestElement({
      adminAction: 'delete-role',
      adminId: 'role-1',
    });

    await controller.handleAdminClick({ target: button } as unknown as Event);

    expect(controller.adminEditor).toBeNull();
    expect(controller.render).toHaveBeenCalledOnce();
  });

  /** Ensures declining the explicit user deletion warning leaves the account untouched. */
  it('requires confirmation before deleting a user', async () => {
    installDomShims();
    const deleteAdminUser = vi.fn(() => Promise.resolve());
    const controller = Object.create(AppController.prototype) as {
      window: { confirm: ReturnType<typeof vi.fn> };
      api: { deleteAdminUser: typeof deleteAdminUser };
      adminEditor: unknown;
      requestSnapshot: () => {
        actorId: string;
        sequence: number;
        routeSequence: number;
      };
      isCurrentRequest: () => boolean;
      refreshAdminOverview: () => Promise<boolean>;
      render: ReturnType<typeof vi.fn>;
      showToast: ReturnType<typeof vi.fn>;
      gate: {
        run: (_key: string, operation: () => Promise<void>) => Promise<void>;
      };
      handleAdminClick: (event: Event) => Promise<void>;
    };
    controller.window = { confirm: vi.fn(() => false) };
    controller.api = { deleteAdminUser };
    controller.adminEditor = null;
    controller.requestSnapshot = () => ({
      actorId: 'admin',
      sequence: 0,
      routeSequence: 0,
    });
    controller.isCurrentRequest = () => true;
    controller.refreshAdminOverview = () => Promise.resolve(true);
    controller.render = vi.fn();
    controller.showToast = vi.fn();
    controller.gate = { run: (_key, operation) => operation() };
    const button = new TestElement({
      adminAction: 'delete-user',
      adminId: 'user-1',
    });

    await controller.handleAdminClick({ target: button } as unknown as Event);

    expect(controller.window.confirm).toHaveBeenCalledWith(
      '确定删除该用户吗？删除后该用户将无法参与正常业务流程。',
    );
    expect(deleteAdminUser).not.toHaveBeenCalled();
  });

  /** Ensures a failed delete keeps the current editor open for retry or correction. */
  it('preserves the editor when delete fails', async () => {
    installDomShims();
    const controller = Object.create(AppController.prototype) as {
      adminEditor: unknown;
      api: { deleteAdminRole: () => Promise<void> };
      requestSnapshot: () => {
        actorId: string;
        sequence: number;
        routeSequence: number;
      };
      isCurrentRequest: () => boolean;
      refreshAdminOverview: ReturnType<typeof vi.fn>;
      gate: {
        run: (_key: string, operation: () => Promise<void>) => Promise<void>;
      };
      showToast: ReturnType<typeof vi.fn>;
      handleAdminClick: (event: Event) => Promise<void>;
    };
    const editor = { kind: 'role', mode: 'edit' };
    controller.adminEditor = editor;
    controller.api = {
      deleteAdminRole: () => Promise.reject(new Error('failed')),
    };
    controller.requestSnapshot = () => ({
      actorId: 'admin',
      sequence: 0,
      routeSequence: 0,
    });
    controller.isCurrentRequest = () => true;
    controller.refreshAdminOverview = vi.fn();
    controller.gate = { run: (_key, operation) => operation() };
    controller.showToast = vi.fn();
    const button = new TestElement({
      adminAction: 'delete-role',
      adminId: 'role-1',
    });

    await controller.handleAdminClick({ target: button } as unknown as Event);

    expect(controller.adminEditor).toBe(editor);
    expect(controller.refreshAdminOverview).not.toHaveBeenCalled();
    expect(controller.showToast).toHaveBeenCalledOnce();
  });
});

describe('AppController task comments', () => {
  class CommentElement {
    public value = '';

    /** Creates a delegated comment control with optional form content. */
    constructor(
      public readonly dataset: Record<string, string>,
      value = '',
    ) {
      this.value = value;
    }

    /** Matches the delegated comment selectors used by the controller. */
    closest(selector: string): CommentElement | null {
      if (selector === '[data-comment-input]' && this.dataset.commentInput)
        return this;
      if (
        selector === '[data-edit-comment-input]' &&
        this.dataset.editCommentInput
      )
        return this;
      if (selector === '[data-edit-comment-id]' && this.dataset.editCommentId)
        return this;
      if (
        selector === '[data-cancel-comment-edit]' &&
        this.dataset.cancelCommentEdit
      )
        return this;
      if (
        selector === '[data-delete-comment-id]' &&
        this.dataset.deleteCommentId
      )
        return this;
      if (selector === '[data-comment-form]' && this.dataset.commentForm)
        return this;
      if (
        selector === '[data-edit-comment-form]' &&
        this.dataset.editCommentForm
      )
        return this;
      return null;
    }
  }

  class CommentForm extends CommentElement {
    /** Creates a delegated comment form carrying one multiline body. */
    constructor(
      taskId: string,
      public readonly content: string,
    ) {
      super({ commentForm: taskId });
    }
  }

  class CommentEditForm extends CommentElement {
    /** Creates a delegated comment edit form carrying one replacement body. */
    constructor(
      commentId: string,
      public readonly content: string,
    ) {
      super({ editCommentForm: commentId });
    }
  }

  /** Installs the minimal DOM and FormData shims required by comment delegation tests. */
  function installCommentDomShims(): void {
    (globalThis as { Element?: unknown }).Element = CommentElement;
    (globalThis as { HTMLFormElement?: unknown }).HTMLFormElement =
      CommentElement;
    (globalThis as { FormData?: unknown }).FormData = class {
      /** Captures one fake comment creation or editing form. */
      constructor(private readonly form: CommentForm | CommentEditForm) {}

      /** Returns the fake multiline comment body. */
      get(name: string): string {
        return name === 'content' ? this.form.content : '';
      }
    };
  }

  const COMMENT_TASK: TaskResource = {
    id: 'task-comment',
    title: '评论控制器测试',
    type: 'exploration',
    typeLabel: '探索',
    description: '验证草稿与命令行为',
    reward: '10 金币',
    dueDate: '2026-09-10',
    publisher: CURRENT_USER,
    assignee: null,
    workflowStatus: 'not_started',
    workflowStatusLabel: '未开始',
    status: 'not_started',
    statusLabel: '未开始',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    version: 4,
    timeline: [
      {
        kind: 'activity',
        sequence: 1,
        action: 'created',
        actionLabel: '创建任务',
        actor: CURRENT_USER,
        at: '2026-09-01T08:00:00.000Z',
        detail: '任务已创建',
      },
      {
        kind: 'comment',
        sequence: 2,
        commentId: 'comment-owned',
        actor: CURRENT_USER,
        at: '2026-09-01T09:00:00.000Z',
        content: '原评论',
        edited: false,
        deleted: false,
        deletedAt: null,
        deletedByUsername: null,
      },
    ],
  };

  /** Ensures drafts are keyed by actor and task when the drawer is re-rendered. */
  it('isolates in-memory comment drafts by actor and task', () => {
    const renderTaskDrawer = vi
      .spyOn(taskRenderer, 'renderTaskDrawer')
      .mockImplementation(() => undefined);
    const controller = Object.create(AppController.prototype) as {
      tasks: TaskResource[];
      selectedTaskId: string;
      currentUserId: string;
      commentDrafts: Map<string, string>;
      currentUser: () => ActorResource;
      elements: {
        drawerInner: HTMLElement;
        drawer: { classList: { add: () => void }; setAttribute: () => void };
        drawerBackdrop: { classList: { add: () => void } };
      };
      document: Document;
      renderDrawer: () => void;
    };
    controller.tasks = [COMMENT_TASK];
    controller.selectedTaskId = COMMENT_TASK.id;
    controller.currentUserId = 'actor-a';
    controller.commentDrafts = new Map([
      ['actor-a\u0000task-comment', '甲的草稿'],
      ['actor-b\u0000task-comment', '乙的草稿'],
    ]);
    controller.currentUser = () => ({
      ...CURRENT_USER,
      id: controller.currentUserId,
      permissions: ['tasks.view'],
    });
    controller.elements = {
      drawerInner: {} as HTMLElement,
      drawer: {
        classList: { add: () => undefined },
        setAttribute: () => undefined,
      },
      drawerBackdrop: { classList: { add: () => undefined } },
    };
    controller.document = {} as Document;

    controller.renderDrawer();
    controller.currentUserId = 'actor-b';
    controller.renderDrawer();

    expect(renderTaskDrawer.mock.calls.map((call) => call[5])).toEqual([
      '甲的草稿',
      '乙的草稿',
    ]);
    renderTaskDrawer.mockRestore();
  });

  /** Ensures rendering an active editor focuses its textarea after safe node replacement. */
  it('focuses the active comment editor after rendering the drawer', () => {
    const renderTaskDrawer = vi
      .spyOn(taskRenderer, 'renderTaskDrawer')
      .mockImplementation(() => undefined);
    const focus = vi.fn();
    const controller = Object.create(AppController.prototype) as {
      tasks: TaskResource[];
      selectedTaskId: string;
      currentUserId: string;
      commentDrafts: Map<string, string>;
      commentEditor: {
        actorId: string;
        taskId: string;
        commentId: string;
        draft: string;
      };
      currentUser: () => ActorResource;
      elements: {
        drawerInner: { querySelector: () => { focus: typeof focus } | null };
        drawer: { classList: { add: () => void }; setAttribute: () => void };
        drawerBackdrop: { classList: { add: () => void } };
      };
      document: Document;
      renderDrawer: () => void;
    };
    controller.tasks = [COMMENT_TASK];
    controller.selectedTaskId = COMMENT_TASK.id;
    controller.currentUserId = CURRENT_USER.id;
    controller.commentDrafts = new Map();
    controller.commentEditor = {
      actorId: CURRENT_USER.id,
      taskId: COMMENT_TASK.id,
      commentId: 'comment-owned',
      draft: '修改中',
    };
    controller.currentUser = () => ({
      ...CURRENT_USER,
      permissions: ['tasks.view'],
    });
    controller.elements = {
      drawerInner: { querySelector: () => ({ focus }) },
      drawer: {
        classList: { add: () => undefined },
        setAttribute: () => undefined,
      },
      drawerBackdrop: { classList: { add: () => undefined } },
    };
    controller.document = {} as Document;

    controller.renderDrawer();

    expect(focus).toHaveBeenCalledOnce();
    renderTaskDrawer.mockRestore();
  });

  /** Ensures delegated input updates only the active actor-task draft. */
  it('captures multiline comment drafts through drawer input delegation', () => {
    installCommentDomShims();
    const controller = Object.create(AppController.prototype) as {
      currentUserId: string;
      commentDrafts: Map<string, string>;
      handleDrawerInput: (event: Event) => void;
    };
    controller.currentUserId = 'actor-a';
    controller.commentDrafts = new Map();
    const input = new CommentElement(
      { commentInput: 'task-comment' },
      '第一行\n第二行',
    );

    controller.handleDrawerInput({ target: input } as unknown as Event);

    expect(controller.commentDrafts).toEqual(
      new Map([['actor-a\u0000task-comment', '第一行\n第二行']]),
    );
  });

  /** Ensures clicking an owned comment opens exactly that inline editor with the server body. */
  it('opens an owned comment editor from the delegated edit control', async () => {
    installCommentDomShims();
    const controller = Object.create(AppController.prototype) as {
      tasks: TaskResource[];
      selectedTaskId: string;
      currentUserId: string;
      commentEditor: unknown;
      renderDrawer: ReturnType<typeof vi.fn>;
      handleDrawerClick: (event: Event) => Promise<void>;
    };
    controller.tasks = [COMMENT_TASK];
    controller.selectedTaskId = COMMENT_TASK.id;
    controller.currentUserId = CURRENT_USER.id;
    controller.commentEditor = null;
    controller.renderDrawer = vi.fn();

    await controller.handleDrawerClick({
      target: new CommentElement({ editCommentId: 'comment-owned' }),
    } as unknown as Event);

    expect(controller.commentEditor).toEqual({
      actorId: CURRENT_USER.id,
      taskId: COMMENT_TASK.id,
      commentId: 'comment-owned',
      draft: '原评论',
      expectedVersion: COMMENT_TASK.version,
    });
    expect(controller.renderDrawer).toHaveBeenCalledOnce();
  });

  /** Ensures closing the task drawer cannot leak one comment editor into a later task. */
  it('clears the active comment editor when the drawer closes', () => {
    const controller = Object.create(AppController.prototype) as {
      commentEditor: {
        actorId: string;
        taskId: string;
        commentId: string;
        draft: string;
      } | null;
      selectedTaskId: string | null;
      closeRenewalDialog: () => void;
      elements: {
        drawer: {
          classList: { remove: () => void };
          setAttribute: () => void;
        };
        drawerBackdrop: { classList: { remove: () => void } };
      };
      closeDrawer: () => void;
    };
    controller.commentEditor = {
      actorId: CURRENT_USER.id,
      taskId: COMMENT_TASK.id,
      commentId: 'comment-owned',
      draft: '不应泄漏',
    };
    controller.selectedTaskId = COMMENT_TASK.id;
    controller.closeRenewalDialog = () => undefined;
    controller.elements = {
      drawer: {
        classList: { remove: () => undefined },
        setAttribute: () => undefined,
      },
      drawerBackdrop: { classList: { remove: () => undefined } },
    };

    controller.closeDrawer();

    expect(controller.commentEditor).toBeNull();
    expect(controller.selectedTaskId).toBeNull();
  });

  /** Ensures cancel exits editing without issuing a command. */
  it('cancels the active comment editor from its delegated control', async () => {
    installCommentDomShims();
    const focus = vi.fn();
    const controller = Object.create(AppController.prototype) as {
      tasks: TaskResource[];
      selectedTaskId: string;
      commentEditor: {
        actorId: string;
        taskId: string;
        commentId: string;
        draft: string;
      } | null;
      elements: {
        drawerInner: {
          querySelectorAll: () => Array<{
            dataset: Record<string, string>;
            focus: typeof focus;
          }>;
        };
      };
      renderDrawer: ReturnType<typeof vi.fn>;
      handleDrawerClick: (event: Event) => Promise<void>;
    };
    controller.tasks = [COMMENT_TASK];
    controller.selectedTaskId = COMMENT_TASK.id;
    controller.commentEditor = {
      actorId: CURRENT_USER.id,
      taskId: COMMENT_TASK.id,
      commentId: 'comment-owned',
      draft: '放弃的修改',
    };
    controller.elements = {
      drawerInner: {
        querySelectorAll: () => [
          {
            dataset: { editCommentId: 'comment-owned' },
            focus,
          },
        ],
      },
    };
    controller.renderDrawer = vi.fn();

    await controller.handleDrawerClick({
      target: new CommentElement({ cancelCommentEdit: 'comment-owned' }),
    } as unknown as Event);

    expect(controller.commentEditor).toBeNull();
    expect(controller.renderDrawer).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
  });

  /** Ensures Escape cancels editing before it can close the surrounding drawer. */
  it('gives active comment editing priority over drawer close on Escape', () => {
    const focus = vi.fn();
    const controller = Object.create(AppController.prototype) as {
      commentEditor: {
        actorId: string;
        taskId: string;
        commentId: string;
        draft: string;
      } | null;
      adminEditor: null;
      elements: {
        profileMenu: { classList: { contains: () => boolean } };
        renewalModal: { classList: { contains: () => boolean } };
        modal: { classList: { contains: () => boolean } };
        drawer: { classList: { contains: () => boolean } };
        drawerInner: {
          querySelectorAll: () => Array<{
            dataset: Record<string, string>;
            focus: typeof focus;
          }>;
        };
      };
      renderDrawer: ReturnType<typeof vi.fn>;
      closeDrawer: ReturnType<typeof vi.fn>;
      handleEscape: (event: KeyboardEvent) => void;
    };
    controller.commentEditor = {
      actorId: CURRENT_USER.id,
      taskId: COMMENT_TASK.id,
      commentId: 'comment-owned',
      draft: '放弃的修改',
    };
    controller.adminEditor = null;
    controller.elements = {
      profileMenu: { classList: { contains: () => false } },
      renewalModal: { classList: { contains: () => false } },
      modal: { classList: { contains: () => false } },
      drawer: { classList: { contains: () => true } },
      drawerInner: {
        querySelectorAll: () => [
          {
            dataset: { editCommentId: 'comment-owned' },
            focus,
          },
        ],
      },
    };
    controller.renderDrawer = vi.fn();
    controller.closeDrawer = vi.fn();

    controller.handleEscape({ key: 'Escape' } as KeyboardEvent);

    expect(controller.commentEditor).toBeNull();
    expect(controller.renderDrawer).toHaveBeenCalledOnce();
    expect(controller.closeDrawer).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledOnce();
  });

  /** Ensures delegated edit input updates only the active comment editor draft. */
  it('captures the active comment edit draft in page memory', () => {
    installCommentDomShims();
    const controller = Object.create(AppController.prototype) as {
      commentEditor: {
        actorId: string;
        taskId: string;
        commentId: string;
        draft: string;
      } | null;
      handleDrawerInput: (event: Event) => void;
    };
    controller.commentEditor = {
      actorId: CURRENT_USER.id,
      taskId: COMMENT_TASK.id,
      commentId: 'comment-owned',
      draft: '原评论',
    };

    controller.handleDrawerInput({
      target: new CommentElement(
        { editCommentInput: 'comment-owned' },
        '修改中的正文',
      ),
    } as unknown as Event);

    expect(controller.commentEditor?.draft).toBe('修改中的正文');
  });

  /** Ensures saving uses the editor's opening version even after the task snapshot advances. */
  it('edits a comment through the shared gate with its opening version', async () => {
    installCommentDomShims();
    const updated = { ...COMMENT_TASK, version: 5 };
    const editTaskComment = vi.fn(() => Promise.resolve(updated));
    const gateKeys: string[] = [];
    const controller = Object.create(AppController.prototype) as {
      tasks: TaskResource[];
      selectedTaskId: string;
      currentUserId: string;
      commentEditor: {
        actorId: string;
        taskId: string;
        commentId: string;
        draft: string;
        expectedVersion: number;
      } | null;
      api: { editTaskComment: typeof editTaskComment };
      gate: {
        run: <T>(key: string, operation: () => Promise<T>) => Promise<T>;
      };
      requestSnapshot: () => {
        actorId: string;
        sequence: number;
        routeSequence: number;
      };
      isCurrentRequest: () => boolean;
      replaceTask: ReturnType<typeof vi.fn>;
      render: ReturnType<typeof vi.fn>;
      showToast: ReturnType<typeof vi.fn>;
      handleDrawerSubmit: (event: SubmitEvent) => Promise<void>;
    };
    controller.tasks = [COMMENT_TASK];
    controller.selectedTaskId = COMMENT_TASK.id;
    controller.currentUserId = CURRENT_USER.id;
    controller.commentEditor = {
      actorId: CURRENT_USER.id,
      taskId: COMMENT_TASK.id,
      commentId: 'comment-owned',
      draft: '修改后的正文',
      expectedVersion: 3,
    };
    controller.api = { editTaskComment };
    controller.gate = {
      run: (key, operation) => {
        gateKeys.push(key);
        return operation();
      },
    };
    controller.requestSnapshot = () => ({
      actorId: CURRENT_USER.id,
      sequence: 0,
      routeSequence: 0,
    });
    controller.isCurrentRequest = () => true;
    controller.replaceTask = vi.fn();
    controller.render = vi.fn();
    controller.showToast = vi.fn();

    await controller.handleDrawerSubmit({
      preventDefault: () => undefined,
      target: new CommentEditForm('comment-owned', '修改后的正文'),
    } as unknown as SubmitEvent);

    expect(gateKeys).toEqual(['task:task-comment']);
    expect(editTaskComment).toHaveBeenCalledWith(
      CURRENT_USER.id,
      COMMENT_TASK.id,
      'comment-owned',
      { content: '修改后的正文', expectedVersion: 3 },
    );
    expect(controller.commentEditor).toBeNull();
    expect(controller.replaceTask).toHaveBeenCalledWith(updated);
    expect(controller.render).toHaveBeenCalledOnce();
    expect(controller.showToast).toHaveBeenCalledWith('评论已更新');
  });

  /** Ensures a completed request cannot clear a newer draft created while it was pending. */
  it('preserves a newer comment edit session after an earlier request succeeds', async () => {
    installCommentDomShims();
    let releaseEdit!: (task: TaskResource) => void;
    const editTaskComment = vi.fn(
      () => new Promise<TaskResource>((resolve) => (releaseEdit = resolve)),
    );
    const controller = Object.create(AppController.prototype) as {
      tasks: TaskResource[];
      selectedTaskId: string;
      currentUserId: string;
      commentEditor: {
        actorId: string;
        taskId: string;
        commentId: string;
        draft: string;
        expectedVersion: number;
      } | null;
      api: { editTaskComment: typeof editTaskComment };
      gate: {
        run: <T>(key: string, operation: () => Promise<T>) => Promise<T>;
      };
      requestSnapshot: () => {
        actorId: string;
        sequence: number;
        routeSequence: number;
      };
      isCurrentRequest: () => boolean;
      replaceTask: ReturnType<typeof vi.fn>;
      render: ReturnType<typeof vi.fn>;
      showToast: ReturnType<typeof vi.fn>;
      handleDrawerSubmit: (event: SubmitEvent) => Promise<void>;
    };
    controller.tasks = [COMMENT_TASK];
    controller.selectedTaskId = COMMENT_TASK.id;
    controller.currentUserId = CURRENT_USER.id;
    controller.commentEditor = {
      actorId: CURRENT_USER.id,
      taskId: COMMENT_TASK.id,
      commentId: 'comment-owned',
      draft: '准备提交',
      expectedVersion: COMMENT_TASK.version,
    };
    controller.api = { editTaskComment };
    controller.gate = { run: (_key, operation) => operation() };
    controller.requestSnapshot = () => ({
      actorId: CURRENT_USER.id,
      sequence: 0,
      routeSequence: 0,
    });
    controller.isCurrentRequest = () => true;
    controller.replaceTask = vi.fn();
    controller.render = vi.fn();
    controller.showToast = vi.fn();

    const pending = controller.handleDrawerSubmit({
      preventDefault: () => undefined,
      target: new CommentEditForm('comment-owned', '已提交正文'),
    } as unknown as SubmitEvent);
    await Promise.resolve();
    const newerEditor = {
      actorId: CURRENT_USER.id,
      taskId: COMMENT_TASK.id,
      commentId: 'comment-owned',
      draft: '请求期间继续修改',
      expectedVersion: COMMENT_TASK.version,
    };
    controller.commentEditor = newerEditor;
    releaseEdit({ ...COMMENT_TASK, version: 5 });
    await pending;

    expect(controller.commentEditor).toEqual(newerEditor);
    expect(controller.replaceTask).toHaveBeenCalledOnce();
    expect(controller.render).toHaveBeenCalledOnce();
  });

  /** Ensures an edit failure resynchronizes without discarding the submitted draft. */
  it('preserves the active comment edit draft after failure', async () => {
    installCommentDomShims();
    const controller = Object.create(AppController.prototype) as {
      tasks: TaskResource[];
      selectedTaskId: string;
      currentUserId: string;
      commentEditor: {
        actorId: string;
        taskId: string;
        commentId: string;
        draft: string;
      } | null;
      api: { editTaskComment: () => Promise<never> };
      gate: {
        run: <T>(key: string, operation: () => Promise<T>) => Promise<T>;
      };
      requestSnapshot: () => {
        actorId: string;
        sequence: number;
        routeSequence: number;
      };
      isCurrentRequest: () => boolean;
      resynchronizeTasks: ReturnType<typeof vi.fn>;
      showToast: ReturnType<typeof vi.fn>;
      handleDrawerSubmit: (event: SubmitEvent) => Promise<void>;
    };
    controller.tasks = [COMMENT_TASK];
    controller.selectedTaskId = COMMENT_TASK.id;
    controller.currentUserId = CURRENT_USER.id;
    controller.commentEditor = {
      actorId: CURRENT_USER.id,
      taskId: COMMENT_TASK.id,
      commentId: 'comment-owned',
      draft: '提交前',
    };
    controller.api = {
      editTaskComment: () => Promise.reject(new Error('failed')),
    };
    controller.gate = { run: (_key, operation) => operation() };
    controller.requestSnapshot = () => ({
      actorId: CURRENT_USER.id,
      sequence: 0,
      routeSequence: 0,
    });
    controller.isCurrentRequest = () => true;
    controller.resynchronizeTasks = vi.fn(() => Promise.resolve());
    controller.showToast = vi.fn();

    await controller.handleDrawerSubmit({
      preventDefault: () => undefined,
      target: new CommentEditForm('comment-owned', '失败后保留'),
    } as unknown as SubmitEvent);

    expect(controller.commentEditor?.draft).toBe('失败后保留');
    expect(controller.resynchronizeTasks).toHaveBeenCalledOnce();
    expect(controller.showToast).toHaveBeenCalledOnce();
  });

  /** Ensures a refresh drops an editor whose comment became a tombstone. */
  it('clears an invalid comment editor after server resynchronization', async () => {
    const deletedTask: TaskResource = {
      ...COMMENT_TASK,
      workflowStatus: 'closed',
      workflowStatusLabel: '关闭',
      status: 'closed',
      statusLabel: '关闭',
      timeline: COMMENT_TASK.timeline.map((entry) =>
        entry.kind === 'comment'
          ? {
              ...entry,
              content: null,
              deleted: true,
              deletedAt: '2026-09-01T10:00:00.000Z',
              deletedByUsername: 'moderator',
            }
          : entry,
      ),
    };
    const controller = Object.create(AppController.prototype) as {
      tasks: TaskResource[];
      tasksLoaded: boolean;
      currentUserId: string;
      commentEditor: {
        actorId: string;
        taskId: string;
        commentId: string;
        draft: string;
      } | null;
      api: { listTasks: () => Promise<TaskResource[]> };
      isCurrentRequest: () => boolean;
      render: ReturnType<typeof vi.fn>;
      resynchronizeTasks: (request: {
        actorId: string;
        sequence: number;
        routeSequence: number;
      }) => Promise<void>;
    };
    controller.tasks = [COMMENT_TASK];
    controller.tasksLoaded = true;
    controller.currentUserId = CURRENT_USER.id;
    controller.commentEditor = {
      actorId: CURRENT_USER.id,
      taskId: COMMENT_TASK.id,
      commentId: 'comment-owned',
      draft: '不能恢复到墓碑上的正文',
    };
    controller.api = { listTasks: () => Promise.resolve([deletedTask]) };
    controller.isCurrentRequest = () => true;
    controller.render = vi.fn();

    await controller.resynchronizeTasks({
      actorId: CURRENT_USER.id,
      sequence: 0,
      routeSequence: 0,
    });

    expect(controller.commentEditor).toBeNull();
    expect(controller.tasks).toEqual([deletedTask]);
    expect(controller.render).toHaveBeenCalledOnce();
  });

  /** Ensures successful comment creation shares the task gate, replaces the task, and clears its draft. */
  it('creates a comment and clears only its successful draft', async () => {
    installCommentDomShims();
    const updated = { ...COMMENT_TASK, version: 5 };
    const createTaskComment = vi.fn(() => Promise.resolve(updated));
    const gateKeys: string[] = [];
    const controller = Object.create(AppController.prototype) as {
      tasks: TaskResource[];
      selectedTaskId: string;
      currentUserId: string;
      commentDrafts: Map<string, string>;
      api: { createTaskComment: typeof createTaskComment };
      gate: {
        run: <T>(key: string, operation: () => Promise<T>) => Promise<T>;
      };
      requestSnapshot: () => {
        actorId: string;
        sequence: number;
        routeSequence: number;
      };
      isCurrentRequest: () => boolean;
      replaceTask: ReturnType<typeof vi.fn>;
      render: ReturnType<typeof vi.fn>;
      showToast: ReturnType<typeof vi.fn>;
      handleDrawerSubmit: (event: SubmitEvent) => Promise<void>;
    };
    controller.tasks = [COMMENT_TASK];
    controller.selectedTaskId = COMMENT_TASK.id;
    controller.currentUserId = 'actor-a';
    controller.commentDrafts = new Map([
      ['actor-a\u0000task-comment', '待提交'],
      ['actor-b\u0000task-comment', '其他身份草稿'],
    ]);
    controller.api = { createTaskComment };
    controller.gate = {
      run: (key, operation) => {
        gateKeys.push(key);
        return operation();
      },
    };
    controller.requestSnapshot = () => ({
      actorId: 'actor-a',
      sequence: 0,
      routeSequence: 0,
    });
    controller.isCurrentRequest = () => true;
    controller.replaceTask = vi.fn();
    controller.render = vi.fn();
    controller.showToast = vi.fn();
    const form = new CommentForm(COMMENT_TASK.id, '第一行\n第二行');

    await controller.handleDrawerSubmit({
      preventDefault: () => undefined,
      target: form,
    } as unknown as SubmitEvent);

    expect(gateKeys).toEqual(['task:task-comment']);
    expect(createTaskComment).toHaveBeenCalledWith('actor-a', 'task-comment', {
      content: '第一行\n第二行',
      expectedVersion: 4,
    });
    expect(controller.commentDrafts).toEqual(
      new Map([['actor-b\u0000task-comment', '其他身份草稿']]),
    );
    expect(controller.replaceTask).toHaveBeenCalledWith(updated);
    expect(controller.render).toHaveBeenCalledOnce();
  });

  /** Ensures a successful request clears only its initiating identity's draft after an identity switch. */
  it('clears the submitted actor draft when success arrives after identity change', async () => {
    installCommentDomShims();
    const controller = Object.create(AppController.prototype) as {
      tasks: TaskResource[];
      selectedTaskId: string;
      currentUserId: string;
      commentDrafts: Map<string, string>;
      api: { createTaskComment: () => Promise<TaskResource> };
      gate: {
        run: <T>(key: string, operation: () => Promise<T>) => Promise<T>;
      };
      requestSnapshot: () => {
        actorId: string;
        sequence: number;
        routeSequence: number;
      };
      isCurrentRequest: () => boolean;
      replaceTask: ReturnType<typeof vi.fn>;
      render: ReturnType<typeof vi.fn>;
      showToast: ReturnType<typeof vi.fn>;
      handleDrawerSubmit: (event: SubmitEvent) => Promise<void>;
    };
    controller.tasks = [COMMENT_TASK];
    controller.selectedTaskId = COMMENT_TASK.id;
    controller.currentUserId = 'actor-a';
    controller.commentDrafts = new Map([
      ['actor-a\u0000task-comment', '待提交'],
      ['actor-b\u0000task-comment', '当前身份草稿'],
    ]);
    controller.api = {
      createTaskComment: () => Promise.resolve({ ...COMMENT_TASK, version: 5 }),
    };
    controller.gate = { run: (_key, operation) => operation() };
    controller.requestSnapshot = () => ({
      actorId: 'actor-a',
      sequence: 0,
      routeSequence: 0,
    });
    controller.isCurrentRequest = () => false;
    controller.replaceTask = vi.fn();
    controller.render = vi.fn();
    controller.showToast = vi.fn();

    await controller.handleDrawerSubmit({
      preventDefault: () => undefined,
      target: new CommentForm(COMMENT_TASK.id, '已提交'),
    } as unknown as SubmitEvent);

    expect(controller.commentDrafts).toEqual(
      new Map([['actor-b\u0000task-comment', '当前身份草稿']]),
    );
    expect(controller.replaceTask).not.toHaveBeenCalled();
    expect(controller.render).not.toHaveBeenCalled();
  });

  /** Ensures failed comment creation resynchronizes while preserving the submitted draft. */
  it('preserves a comment draft after creation failure and resync', async () => {
    installCommentDomShims();
    const controller = Object.create(AppController.prototype) as {
      tasks: TaskResource[];
      selectedTaskId: string;
      currentUserId: string;
      commentDrafts: Map<string, string>;
      api: { createTaskComment: () => Promise<never> };
      gate: {
        run: <T>(key: string, operation: () => Promise<T>) => Promise<T>;
      };
      requestSnapshot: () => {
        actorId: string;
        sequence: number;
        routeSequence: number;
      };
      isCurrentRequest: () => boolean;
      resynchronizeTasks: ReturnType<typeof vi.fn>;
      showToast: ReturnType<typeof vi.fn>;
      handleDrawerSubmit: (event: SubmitEvent) => Promise<void>;
    };
    controller.tasks = [COMMENT_TASK];
    controller.selectedTaskId = COMMENT_TASK.id;
    controller.currentUserId = 'actor-a';
    controller.commentDrafts = new Map();
    controller.api = {
      createTaskComment: () => Promise.reject(new Error('failed')),
    };
    controller.gate = { run: (_key, operation) => operation() };
    controller.requestSnapshot = () => ({
      actorId: 'actor-a',
      sequence: 0,
      routeSequence: 0,
    });
    controller.isCurrentRequest = () => true;
    controller.resynchronizeTasks = vi.fn(() => Promise.resolve());
    controller.showToast = vi.fn();
    const form = new CommentForm(COMMENT_TASK.id, '失败后保留');

    await controller.handleDrawerSubmit({
      preventDefault: () => undefined,
      target: form,
    } as unknown as SubmitEvent);

    expect(controller.commentDrafts.get('actor-a\u0000task-comment')).toBe(
      '失败后保留',
    );
    expect(controller.resynchronizeTasks).toHaveBeenCalledOnce();
    expect(controller.showToast).toHaveBeenCalledOnce();
  });

  /** Ensures comment deletion uses the same task gate and optimistic task version as status actions. */
  it('deletes a comment through the shared task request gate', async () => {
    installCommentDomShims();
    const updated = { ...COMMENT_TASK, version: 5 };
    const deleteTaskComment = vi.fn(() => Promise.resolve(updated));
    const gateKeys: string[] = [];
    const controller = Object.create(AppController.prototype) as {
      tasks: TaskResource[];
      selectedTaskId: string;
      api: { deleteTaskComment: typeof deleteTaskComment };
      gate: {
        run: <T>(key: string, operation: () => Promise<T>) => Promise<T>;
      };
      requestSnapshot: () => {
        actorId: string;
        sequence: number;
        routeSequence: number;
      };
      isCurrentRequest: () => boolean;
      replaceTask: ReturnType<typeof vi.fn>;
      render: ReturnType<typeof vi.fn>;
      showToast: ReturnType<typeof vi.fn>;
      handleDrawerClick: (event: Event) => Promise<void>;
    };
    controller.tasks = [COMMENT_TASK];
    controller.selectedTaskId = COMMENT_TASK.id;
    controller.api = { deleteTaskComment };
    controller.gate = {
      run: (key, operation) => {
        gateKeys.push(key);
        return operation();
      },
    };
    controller.requestSnapshot = () => ({
      actorId: 'manager',
      sequence: 0,
      routeSequence: 0,
    });
    controller.isCurrentRequest = () => true;
    controller.replaceTask = vi.fn();
    controller.render = vi.fn();
    controller.showToast = vi.fn();
    const button = new CommentElement({ deleteCommentId: 'comment/1' });

    await controller.handleDrawerClick({ target: button } as unknown as Event);

    expect(gateKeys).toEqual(['task:task-comment']);
    expect(deleteTaskComment).toHaveBeenCalledWith(
      'manager',
      'task-comment',
      'comment/1',
      { expectedVersion: 4 },
    );
    expect(controller.replaceTask).toHaveBeenCalledWith(updated);
    expect(controller.render).toHaveBeenCalledOnce();
  });
});

describe('AppController task scroll state', () => {
  /** Ensures task navigation restores only the document position, not obsolete nested scroll layers. */
  it('restores only the task page document position after leaving the view', () => {
    type ScrollState = {
      windowY: number;
    };
    type ScrollController = {
      elements: {
        taskGrid: { scrollTop: number };
        boardLayout: {
          querySelector: <T extends Element>(selector: string) => T | null;
        };
        homeView: { classList: { toggle: ReturnType<typeof vi.fn> } };
        tasksView: { classList: { toggle: ReturnType<typeof vi.fn> } };
        adminView: { classList: { toggle: ReturnType<typeof vi.fn> } };
        viewNav: {
          querySelectorAll: <T extends Element>(selector: string) => T[];
        };
        filterDisclosure: { open: boolean };
      };
      window: {
        scrollY: number;
        scrollTo: (options: {
          top: number;
          left?: number;
          behavior?: ScrollBehavior;
        }) => void;
        requestAnimationFrame: (callback: FrameRequestCallback) => number;
      };
      route: RouteState;
      renderedView: RouteState['view'] | null;
      viewScrollStates: Map<RouteState['view'], ScrollState>;
      pendingScrollRestoreView: RouteState['view'] | null;
      scrollRestoreSequence: number;
      compactTaskQuery: { matches: boolean };
      restorePendingScrollState: () => void;
      renderView: () => void;
    };
    const sidebar = { scrollTop: 0 } as HTMLElement;
    const scrollCalls: Array<{
      top: number;
      left?: number;
      behavior?: ScrollBehavior;
    }> = [];
    const controller = Object.create(
      AppController.prototype,
    ) as ScrollController;
    const classList = { toggle: vi.fn() };
    controller.elements = {
      taskGrid: { scrollTop: 0 },
      boardLayout: {
        querySelector: <T extends Element>() => sidebar as unknown as T,
      },
      homeView: { classList },
      tasksView: { classList },
      adminView: { classList },
      viewNav: {
        querySelectorAll: <T extends Element>() => [] as T[],
      },
      filterDisclosure: { open: false },
    };
    controller.window = {
      scrollY: 0,
      scrollTo: (options) => {
        scrollCalls.push(options);
        const { top } = options;
        controller.window.scrollY = top;
      },
      requestAnimationFrame: (callback) => {
        callback(0);
        return 0;
      },
    };
    controller.viewScrollStates = new Map();
    controller.pendingScrollRestoreView = null;
    controller.scrollRestoreSequence = 0;
    controller.compactTaskQuery = { matches: false };

    controller.route = {
      view: 'tasks',
      scope: 'all',
      filter: '全部',
      query: '北境',
    };
    controller.renderedView = null;
    controller.renderView();
    controller.restorePendingScrollState();

    controller.window.scrollY = 180;
    controller.elements.taskGrid.scrollTop = 42;
    sidebar.scrollTop = 24;
    controller.route = {
      view: 'tasks',
      scope: 'mine',
      filter: '进行中',
      query: '',
    };
    controller.renderView();
    controller.restorePendingScrollState();

    expect(controller.window.scrollY).toBe(180);
    expect(controller.elements.taskGrid.scrollTop).toBe(42);
    expect(sidebar.scrollTop).toBe(24);

    controller.route = {
      view: 'home',
      scope: 'all',
      filter: '全部',
      query: '',
    };
    controller.renderView();
    controller.restorePendingScrollState();
    controller.elements.taskGrid.scrollTop = 0;
    sidebar.scrollTop = 0;
    controller.route = {
      view: 'tasks',
      scope: 'all',
      filter: '未开始',
      query: '采集',
    };
    controller.renderView();
    controller.restorePendingScrollState();

    expect(controller.window.scrollY).toBe(180);
    expect(controller.elements.taskGrid.scrollTop).toBe(0);
    expect(sidebar.scrollTop).toBe(0);
    expect(scrollCalls.every(({ behavior }) => behavior === 'instant')).toBe(
      true,
    );
  });
});
