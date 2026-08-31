/** Verifies controller state is refreshed when administrator permissions change. */
import { describe, expect, it, vi } from 'vitest';

import { ApiError, type ApiClient } from './api-client.js';
import type {
  ActorResource,
  AdminOverviewResource,
  TaskResource,
} from './api-types.js';
vi.mock('../admin/admin-renderer.js', () => ({
  renderAdminView: vi.fn(),
}));
import { AppController } from './app-controller.js';
import * as adminRenderer from '../admin/admin-renderer.js';

const CURRENT_USER: ActorResource = {
  id: 'noticeboard-admin',
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
  name: '重置用户',
  role: 'resetter',
  roleLabel: '重置角色',
  permissions: ['demo.reset'],
};

const TASK_VIEWER: ActorResource = {
  id: 'task-viewer',
  name: '查看用户',
  role: 'viewer',
  roleLabel: '查看角色',
  permissions: ['tasks.view'],
};

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
    constructor(public readonly dataset: Record<string, string>) {}
  }

  /** Installs the smallest browser constructor shims needed by delegated handlers in node tests. */
  function installDomShims(): void {
    (globalThis as { Element?: unknown }).Element = TestElement;
    (globalThis as { HTMLFormElement?: unknown }).HTMLFormElement = TestForm;
    (globalThis as { FormData?: unknown }).FormData = class {
      /** Returns the submitted text field used by the create-user command. */
      get(): string {
        return '测试用户';
      }

      /** Returns no selected permissions in the minimal failed-request case. */
      getAll(): string[] {
        return [];
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
    const form = new TestForm({ adminForm: 'create-user' });

    await controller.handleAdminSubmit({
      preventDefault: () => undefined,
      target: form,
    } as unknown as SubmitEvent);

    expect(controller.adminEditor).toBe(editor);
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
