/** Coordinates API state, hash routing, safe renderers, profile controls, and overlay interactions. */
import type {
  ActorResource,
  AdminOverviewResource,
  PermissionCode,
  CreateTaskRequest,
  TaskAction,
  TaskResource,
  TaskType,
} from './api-types.js';
import { ApiError } from './api-client.js';
import type { ApiClient } from './api-client.js';
import { requiredElement, createNode } from './dom.js';
import { RequestGate } from './request-gate.js';
import {
  buildTaskHash,
  normalizeHash,
  parseHash,
  type FilterLabel,
  type RouteState,
  type TaskScope,
} from './router.js';
import {
  loadCurrentUserId,
  saveCurrentUserId,
} from '../profile/identity-preference.js';
import { filterTasks, taskCounts } from '../tasks/task-filter.js';
import { renderTaskDrawer, renderTaskGrid } from '../tasks/task-renderer.js';
import { renderAdminView } from '../admin/admin-renderer.js';
import { THEMES } from '../styles/configs/index.js';
import {
  loadStyleId,
  saveStyleId,
  StyleRegistry,
} from '../styles/style-registry.js';

const TASK_TYPES: ReadonlyArray<{ id: TaskType; label: string }> = [
  { id: 'exploration', label: '探索' },
  { id: 'collection', label: '采集' },
  { id: 'escort', label: '护送' },
  { id: 'bounty', label: '悬赏' },
  { id: 'building', label: '建造' },
];

/** Reads a text-only form field without coercing unexpected File objects. */
function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

interface Elements {
  topbar: HTMLElement;
  profileMenu: HTMLElement;
  profileButton: HTMLButtonElement;
  profilePanel: HTMLElement;
  avatarInitial: HTMLElement;
  profileName: HTMLElement;
  resetButton: HTMLButtonElement;
  styleSelect: HTMLSelectElement;
  viewNav: HTMLElement;
  adminNavLink: HTMLAnchorElement;
  homeView: HTMLElement;
  tasksView: HTMLElement;
  adminView: HTMLElement;
  statTotal: HTMLElement;
  statTotalDescription: HTMLElement;
  statNotStarted: HTMLElement;
  statActive: HTMLElement;
  statReview: HTMLElement;
  statReopened: HTMLElement;
  statClosed: HTMLElement;
  scopeSwitcher: HTMLElement;
  filterList: HTMLElement;
  filterDisclosure: HTMLDetailsElement;
  resultLabel: HTMLElement;
  resultCount: HTMLElement;
  searchInput: HTMLInputElement;
  newTaskButton: HTMLButtonElement;
  boardLayout: HTMLElement;
  taskGrid: HTMLElement;
  identitySelect: HTMLSelectElement;
  drawer: HTMLElement;
  drawerBackdrop: HTMLElement;
  drawerInner: HTMLElement;
  modal: HTMLElement;
  modalBackdrop: HTMLElement;
  closeModalButton: HTMLButtonElement;
  cancelModalButton: HTMLButtonElement;
  taskForm: HTMLFormElement;
  taskType: HTMLSelectElement;
  formError: HTMLElement;
  toast: HTMLElement;
}

interface IdentitySnapshot {
  actorId: string;
  sequence: number;
}

interface RequestSnapshot extends IdentitySnapshot {
  routeSequence: number;
}

interface ViewScrollState {
  windowY: number;
  taskGridY?: number;
  taskSidebarY?: number;
  taskRouteKey?: string;
}

/** Resolves the preserved HTML shell once so contract drift fails during startup. */
function collectElements(document: Document): Elements {
  return {
    topbar: requiredElement(document, '.topbar'),
    profileMenu: requiredElement(document, '#profileMenu'),
    profileButton: requiredElement(document, '#profileButton'),
    profilePanel: requiredElement(document, '#profilePanel'),
    avatarInitial: requiredElement(document, '#avatarInitial'),
    profileName: requiredElement(document, '#profileName'),
    resetButton: requiredElement(document, '#resetButton'),
    styleSelect: requiredElement(document, '#styleSelect'),
    viewNav: requiredElement(document, '.view-nav'),
    adminNavLink: requiredElement(document, '#adminNavLink'),
    homeView: requiredElement(document, '#homeView'),
    tasksView: requiredElement(document, '#tasksView'),
    adminView: requiredElement(document, '#adminView'),
    statTotal: requiredElement(document, '#statTotal'),
    statTotalDescription: requiredElement(document, '#statTotalDescription'),
    statNotStarted: requiredElement(document, '#statNotStarted'),
    statActive: requiredElement(document, '#statActive'),
    statReview: requiredElement(document, '#statReview'),
    statReopened: requiredElement(document, '#statReopened'),
    statClosed: requiredElement(document, '#statClosed'),
    scopeSwitcher: requiredElement(document, '#scopeSwitcher'),
    filterList: requiredElement(document, '#filterList'),
    filterDisclosure: requiredElement<HTMLDetailsElement>(
      document,
      '#taskFilterDisclosure',
    ),
    resultLabel: requiredElement(document, '#resultLabel'),
    resultCount: requiredElement(document, '#resultCount'),
    searchInput: requiredElement(document, '#searchInput'),
    newTaskButton: requiredElement(document, '#newTaskButton'),
    boardLayout: requiredElement(document, '.board-layout'),
    taskGrid: requiredElement(document, '#taskGrid'),
    identitySelect: requiredElement(document, '#identitySelect'),
    drawer: requiredElement(document, '#detailDrawer'),
    drawerBackdrop: requiredElement(document, '#drawerBackdrop'),
    drawerInner: requiredElement(document, '#drawerInner'),
    modal: requiredElement(document, '#taskModal'),
    modalBackdrop: requiredElement(document, '#modalBackdrop'),
    closeModalButton: requiredElement(document, '#closeModalButton'),
    cancelModalButton: requiredElement(document, '#cancelModalButton'),
    taskForm: requiredElement(document, '#taskForm'),
    taskType: requiredElement(document, '#taskType'),
    formError: requiredElement(document, '#formError'),
    toast: requiredElement(document, '#toast'),
  };
}

export class AppController {
  private readonly elements: Elements;
  private readonly styles = new StyleRegistry(THEMES);
  private readonly gate = new RequestGate();
  private readonly compactTaskQuery: MediaQueryList;
  private users: ActorResource[] = [];
  private tasks: TaskResource[] = [];
  private tasksLoaded = false;
  private adminOverview: AdminOverviewResource | null = null;
  private currentUserId = '';
  private identityChangeSequence = 0;
  private routeChangeSequence = 0;
  private adminRefreshSequence = 0;
  private currentStyleId = '';
  private route: RouteState;
  private selectedTaskId: string | null = null;
  private renderedView: RouteState['view'] | null = null;
  private renderedRoute: RouteState | null = null;
  private readonly viewScrollStates = new Map<
    RouteState['view'],
    ViewScrollState
  >();
  private pendingScrollRestoreView: RouteState['view'] | null = null;
  private scrollRestoreSequence = 0;
  private tasksCollapsedScrollY = 0;
  private taskPageScrollTimer: number | null = null;

  /** Receives browser boundaries and the versioned API client from the entrypoint. */
  constructor(
    private readonly window: Window,
    private readonly document: Document,
    private readonly storage: Storage,
    private readonly api: ApiClient,
  ) {
    this.compactTaskQuery = window.matchMedia('(max-width: 840px)');
    this.elements = collectElements(document);
    this.route = parseHash(window.location.hash);
  }

  /** Initializes static controls, preferences, event bindings, and the first API snapshot. */
  async start(): Promise<void> {
    this.renderStaticOptions();
    this.bindEvents();
    this.currentStyleId = loadStyleId(this.storage, this.styles);
    this.renderStyle(this.currentStyleId);
    let request: RequestSnapshot | null = null;
    try {
      this.users = await this.api.listDemoUsers();
      this.currentUserId = loadCurrentUserId(this.storage, this.knownUserIds());
      request = this.requestSnapshot();
      const tasks = await this.loadTasksForCurrentUser(request.actorId);
      if (!this.isCurrentRequest(request)) return;
      this.tasks = tasks;
      this.tasksLoaded = true;
      if (
        this.route.view === 'admin' &&
        this.canForActor(request.actorId, 'system.manage')
      ) {
        const adminRequestSequence = this.beginAdminRequest();
        try {
          const overview = await this.api.getAdminOverview(request.actorId);
          if (!this.isCurrentAdminRequest(request, adminRequestSequence))
            return;
          this.adminOverview = overview;
        } catch (error) {
          if (!this.isCurrentAdminRequest(request, adminRequestSequence))
            return;
          if (
            error instanceof ApiError &&
            (error.status === 401 || error.status === 403)
          ) {
            this.adminOverview = null;
            await this.refreshAdminOverview(request, request.routeSequence);
            return;
          }
          this.adminOverview = null;
          if (!this.isCurrentAdminRequest(request, adminRequestSequence))
            return;
          this.showToast(this.errorMessage(error));
        }
      }
      if (!this.isCurrentRequest(request)) return;
      this.render();
    } catch (error) {
      if (request && !this.isCurrentRequest(request)) return;
      this.showToast(this.errorMessage(error));
      this.render();
    }
  }

  /** Creates stable type and theme options without HTML string interpolation. */
  private renderStaticOptions(): void {
    this.elements.taskType.replaceChildren(
      ...TASK_TYPES.map(({ id, label }) => {
        const option = createNode(this.document, 'option', undefined, label);
        option.value = id;
        return option;
      }),
    );
    this.elements.styleSelect.replaceChildren(
      ...this.styles.options.map(({ id, label }) => {
        const option = createNode(this.document, 'option', undefined, label);
        option.value = id;
        return option;
      }),
    );
  }

  /** Attaches all preserved navigation, overlay, form, and keyboard interactions. */
  private bindEvents(): void {
    this.window.history.scrollRestoration = 'manual';
    this.window.addEventListener('scroll', () => this.handleTaskPageScroll(), {
      passive: true,
    });
    this.compactTaskQuery.addEventListener('change', () =>
      this.syncTaskFilterDisclosure(),
    );
    this.window.addEventListener('hashchange', () => {
      void this.handleRouteChange();
    });
    this.document.addEventListener('click', (event) =>
      this.handleHashNavigation(event),
    );
    this.elements.homeView.addEventListener('click', (event) =>
      this.handleStatusShortcut(event),
    );
    this.elements.scopeSwitcher.addEventListener('click', (event) =>
      this.handleScope(event),
    );
    this.elements.filterList.addEventListener('click', (event) =>
      this.handleFilter(event),
    );
    this.elements.searchInput.addEventListener('input', () =>
      this.handleSearch(),
    );
    this.elements.taskGrid.addEventListener('click', (event) =>
      this.handleTaskOpen(event),
    );
    this.elements.taskGrid.addEventListener('keydown', (event) =>
      this.handleTaskKey(event),
    );
    this.elements.adminView.addEventListener(
      'click',
      (event) => void this.handleAdminClick(event),
    );
    this.elements.adminView.addEventListener(
      'submit',
      (event) => void this.handleAdminSubmit(event),
    );
    this.elements.drawerInner.addEventListener(
      'click',
      (event) => void this.handleDrawerClick(event),
    );
    this.elements.drawerBackdrop.addEventListener('click', () =>
      this.closeDrawer(),
    );
    this.elements.newTaskButton.addEventListener('click', () =>
      this.openModal(),
    );
    this.elements.closeModalButton.addEventListener('click', () =>
      this.closeModal(),
    );
    this.elements.cancelModalButton.addEventListener('click', () =>
      this.closeModal(),
    );
    this.elements.modalBackdrop.addEventListener('click', () =>
      this.closeModal(),
    );
    this.elements.profileButton.addEventListener('click', () =>
      this.toggleProfileMenu(),
    );
    this.document.addEventListener('click', (event) =>
      this.handleOutsideClick(event),
    );
    this.elements.identitySelect.addEventListener(
      'change',
      () => void this.changeIdentity(),
    );
    this.elements.styleSelect.addEventListener('change', () =>
      this.changeStyle(),
    );
    this.elements.resetButton.addEventListener(
      'click',
      () => void this.resetDemo(),
    );
    this.elements.taskForm.addEventListener(
      'submit',
      (event) => void this.createTask(event),
    );
    this.document.addEventListener('keydown', (event) =>
      this.handleEscape(event),
    );
  }

  /** Returns the current immutable actor list as an ID membership set. */
  private knownUserIds(): Set<string> {
    return new Set(this.users.map((user) => user.id));
  }

  /** Returns only the actor explicitly selected by the persisted identity ID. */
  private currentUser(): ActorResource | null {
    return this.users.find((user) => user.id === this.currentUserId) ?? null;
  }

  /** Checks one actor's effective permission without consulting mutable identity state. */
  private canForActor(actorId: string, permission: PermissionCode): boolean {
    const user = this.users.find((candidate) => candidate.id === actorId);
    return Boolean(
      user &&
      (user.permissions?.includes(permission) ||
        (user.permissions === undefined &&
          user.role === 'system_admin' &&
          permission === 'system.manage')),
    );
  }

  /** Checks the current in-memory role permission before exposing a browser action. */
  private can(permission: PermissionCode): boolean {
    return this.canForActor(this.currentUserId, permission);
  }

  /** Returns whether the selected active user may enter the management route. */
  private canManage(): boolean {
    return this.can('system.manage');
  }

  /** Captures the active actor and identity generation for one async workflow. */
  private identitySnapshot(): IdentitySnapshot {
    return {
      actorId: this.currentUserId,
      sequence: this.identityChangeSequence,
    };
  }

  /** Captures actor, identity generation, and route generation at request start. */
  private requestSnapshot(): RequestSnapshot {
    return {
      ...this.identitySnapshot(),
      routeSequence: this.routeChangeSequence,
    };
  }

  /** Rejects responses from an actor or identity generation that is no longer current. */
  private isCurrentIdentity(identity: IdentitySnapshot): boolean {
    return (
      identity.actorId === this.currentUserId &&
      identity.sequence === this.identityChangeSequence
    );
  }

  /** Rejects asynchronous effects after either identity or route generation changes. */
  private isCurrentRequest(request: RequestSnapshot): boolean {
    return (
      this.isCurrentIdentity(request) &&
      request.routeSequence === this.routeChangeSequence
    );
  }

  /** Starts one shared management overview generation for every admin request. */
  private beginAdminRequest(): number {
    const sequence = (this.adminRefreshSequence ?? 0) + 1;
    this.adminRefreshSequence = sequence;
    return sequence;
  }

  /** Rejects an admin overview response from an older management generation. */
  private isCurrentAdminRequest(
    request: RequestSnapshot,
    adminRequestSequence: number,
  ): boolean {
    return (
      this.isCurrentRequest(request) &&
      adminRequestSequence === this.adminRefreshSequence
    );
  }

  /** Loads task data only for the captured identity with the task-read permission. */
  private async loadTasksForCurrentUser(
    actorId = this.currentUserId,
  ): Promise<TaskResource[]> {
    return this.canForActor(actorId, 'tasks.view')
      ? this.api.listTasks(actorId)
      : [];
  }

  /** Renders profile, statistics, route controls, view visibility, list, and selected drawer. */
  private render(): void {
    this.renderIdentity();
    this.renderStats();
    this.renderControls();
    this.renderView();
    this.renderTasks();
    this.renderAdmin();
    if (this.selectedTaskId) this.renderDrawer();
    this.restorePendingScrollState();
  }

  /** Renders current identity labels and safe select options. */
  private renderIdentity(): void {
    const user = this.currentUser();
    if (!user) return;
    this.elements.avatarInitial.textContent = user.name
      .trim()
      .charAt(0)
      .toUpperCase();
    this.elements.profileName.textContent = user.name;
    this.elements.profileButton.setAttribute(
      'aria-label',
      `当前用户：${user.name}，打开个人菜单`,
    );
    this.elements.identitySelect.replaceChildren(
      ...this.users.map((actor) => {
        const option = createNode(
          this.document,
          'option',
          undefined,
          actor.name,
        );
        option.value = actor.id;
        option.selected = actor.id === user.id;
        return option;
      }),
    );
    this.elements.adminNavLink.hidden = !this.canManage();
    this.elements.newTaskButton.hidden = !this.can('tasks.create');
    this.elements.resetButton.hidden = !this.can('demo.reset');
  }

  /** Renders current-user status overview and scope-relative filter counts. */
  private renderStats(): void {
    const mine = filterTasks(this.tasks, {
      scope: 'mine',
      filter: '全部',
      query: '',
      currentUserId: this.currentUserId,
      knownUserIds: this.knownUserIds(),
    });
    const counts = taskCounts(mine);
    this.elements.statTotal.textContent = String(counts.total);
    this.elements.statTotalDescription.textContent = `你当前有 ${counts.total} 个委托任务待处理。`;
    this.elements.statNotStarted.textContent = String(counts.notStarted);
    this.elements.statActive.textContent = String(counts.inProgress);
    this.elements.statReview.textContent = String(counts.completed);
    this.elements.statReopened.textContent = String(counts.reopened);
    this.elements.statClosed.textContent = String(counts.closed);
    const scoped = filterTasks(this.tasks, {
      scope: this.route.scope,
      filter: '全部',
      query: '',
      currentUserId: this.currentUserId,
      knownUserIds: this.knownUserIds(),
    });
    for (const count of this.elements.filterList.querySelectorAll<HTMLElement>(
      '[data-count]',
    )) {
      const label = (count.dataset.count ?? '全部') as FilterLabel;
      count.textContent = String(
        filterTasks(scoped, {
          scope: 'all',
          filter: label,
          query: '',
          currentUserId: this.currentUserId,
          knownUserIds: this.knownUserIds(),
        }).length,
      );
    }
  }

  /** Synchronizes scope, filter, and search controls with parsed hash state. */
  private renderControls(): void {
    for (const button of this.elements.scopeSwitcher.querySelectorAll<HTMLElement>(
      '[data-scope]',
    )) {
      const active = button.dataset.scope === this.route.scope;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    for (const button of this.elements.filterList.querySelectorAll<HTMLElement>(
      '.filter-button',
    )) {
      const active = button.dataset.filter === this.route.filter;
      button.classList.toggle('is-active', active);
      button.hidden = false;
      button.setAttribute('aria-pressed', String(active));
    }
    this.elements.searchInput.value = this.route.query;
  }

  /** Shows the route-selected view and its matching navigation current state. */
  private renderView(): void {
    const tasksVisible = this.route.view === 'tasks';
    const adminVisible = this.route.view === 'admin' && this.canManage();
    if (this.route.view === 'admin' && !adminVisible) {
      this.clearTaskPageScrollTimer();
      this.tasksCollapsedScrollY = 0;
      this.document.documentElement.classList.remove('tasks-scroll-mode');
      this.window.location.hash = '#home';
      return;
    }
    const enteringView = this.renderedView !== this.route.view;
    if (enteringView) {
      this.clearTaskPageScrollBeforeRouteChange();
      this.captureRenderedViewScroll();
      if (this.renderedView !== null || tasksVisible) {
        this.pendingScrollRestoreView = this.route.view;
        this.scrollRestoreSequence += 1;
      }
    }
    const enteringTasks = tasksVisible && enteringView;
    this.elements.homeView.classList.toggle(
      'is-active',
      !tasksVisible && !adminVisible,
    );
    this.elements.tasksView.classList.toggle('is-active', tasksVisible);
    this.elements.adminView.classList.toggle('is-active', adminVisible);
    this.document.documentElement.classList.toggle(
      'tasks-scroll-mode',
      tasksVisible,
    );
    for (const link of this.elements.viewNav.querySelectorAll<HTMLElement>(
      '[data-view]',
    )) {
      const active = link.dataset.view === this.route.view;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    this.renderedView = this.route.view;
    this.renderedRoute = this.route;
    if (enteringTasks) {
      this.syncTaskFilterDisclosure(true);
      this.window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      this.measureTasksIntroCollapse();
    } else if (!tasksVisible) {
      this.clearTaskPageScrollTimer();
      this.tasksCollapsedScrollY = 0;
    }
  }

  /** Applies the mobile default and keeps the native disclosure aligned with the responsive board layout. */
  private syncTaskFilterDisclosure(reset = false): void {
    if (this.route.view !== 'tasks') return;
    if (
      !reset &&
      this.elements.filterDisclosure.open === !this.compactTaskQuery.matches
    )
      return;
    this.elements.filterDisclosure.open = !this.compactTaskQuery.matches;
  }

  /** Captures the scroll layers owned by the currently rendered top-level view. */
  private captureRenderedViewScroll(): void {
    if (this.renderedView == null) return;
    const state: ViewScrollState = { windowY: this.window?.scrollY ?? 0 };
    if (this.renderedView === 'tasks') {
      state.taskGridY = this.elements.taskGrid.scrollTop;
      if (this.renderedRoute) {
        state.taskRouteKey = normalizeHash(buildTaskHash(this.renderedRoute));
      }
      const sidebar =
        this.elements.boardLayout.querySelector<HTMLElement>('.board-sidebar');
      if (sidebar) state.taskSidebarY = sidebar.scrollTop;
    }
    this.viewScrollStates.set(this.renderedView, state);
  }

  /** Cancels task-page snapping before another top-level view takes over. */
  private clearTaskPageScrollBeforeRouteChange(): void {
    if (this.renderedView !== 'tasks') return;
    this.clearTaskPageScrollTimer();
  }

  /** Restores the pending view scroll state after all route content has rendered. */
  private restorePendingScrollState(): void {
    const view = this.pendingScrollRestoreView;
    if (view === null) return;
    const sequence = this.scrollRestoreSequence;
    this.window.requestAnimationFrame(() => {
      if (
        sequence !== this.scrollRestoreSequence ||
        this.pendingScrollRestoreView !== view ||
        this.renderedView !== view
      )
        return;
      this.window.requestAnimationFrame(() => {
        if (
          sequence !== this.scrollRestoreSequence ||
          this.pendingScrollRestoreView !== view ||
          this.renderedView !== view
        )
          return;
        this.pendingScrollRestoreView = null;
        if (view === 'tasks') this.measureTasksIntroCollapse();
        const state = this.viewScrollStates.get(view);
        const taskRouteMatches =
          view !== 'tasks' ||
          state?.taskRouteKey === normalizeHash(buildTaskHash(this.route));
        this.window.scrollTo({
          left: 0,
          top: taskRouteMatches ? (state?.windowY ?? 0) : 0,
          behavior: 'auto',
        });
        if (view !== 'tasks') return;
        this.elements.taskGrid.scrollTop = taskRouteMatches
          ? (state?.taskGridY ?? 0)
          : 0;
        const sidebar =
          this.elements.boardLayout.querySelector<HTMLElement>(
            '.board-sidebar',
          );
        if (sidebar)
          sidebar.scrollTop = taskRouteMatches ? (state?.taskSidebarY ?? 0) : 0;
      });
    });
  }

  /** Caches the outer-page position where the task intro becomes fully hidden. */
  private measureTasksIntroCollapse(): void {
    const boardTop =
      this.elements.boardLayout.getBoundingClientRect().top +
      this.window.scrollY;
    const topbarHeight = this.elements.topbar.getBoundingClientRect().height;
    this.tasksCollapsedScrollY = Math.max(0, boardTop - topbarHeight);
  }

  /** Debounces outer task-page scrolling so only the nearest title endpoint remains visible. */
  private handleTaskPageScroll(): void {
    if (this.route.view !== 'tasks' || this.tasksCollapsedScrollY <= 0) return;
    this.clearTaskPageScrollTimer();
    this.taskPageScrollTimer = this.window.setTimeout(() => {
      this.taskPageScrollTimer = null;
      this.snapTaskPageScroll();
    }, 80);
  }

  /** Snaps an interrupted outer task-page scroll to either the expanded or collapsed endpoint. */
  private snapTaskPageScroll(): void {
    if (this.route.view !== 'tasks' || this.tasksCollapsedScrollY <= 0) return;
    const midpoint = this.tasksCollapsedScrollY / 2;
    const target =
      this.window.scrollY > midpoint ? this.tasksCollapsedScrollY : 0;
    if (Math.abs(this.window.scrollY - target) < 1) return;
    this.window.scrollTo({ top: target, behavior: 'auto' });
  }

  /** Cancels a pending outer task-page snap before leaving the task view. */
  private clearTaskPageScrollTimer(): void {
    if (this.taskPageScrollTimer === null) return;
    this.window.clearTimeout(this.taskPageScrollTimer);
    this.taskPageScrollTimer = null;
  }

  /** Filters and renders the in-memory task snapshot without network requests. */
  private renderTasks(): void {
    const visible = filterTasks(this.tasks, {
      scope: this.route.scope,
      filter: this.route.filter,
      query: this.route.query,
      currentUserId: this.currentUserId,
      knownUserIds: this.knownUserIds(),
    });
    this.elements.resultLabel.textContent =
      this.route.scope === 'mine'
        ? '我的任务'
        : this.route.filter === '全部'
          ? '全部任务'
          : this.route.filter;
    this.elements.resultCount.textContent = `${visible.length} 项任务${this.route.query ? ' · 搜索结果' : ''}`;
    renderTaskGrid(
      this.document,
      this.elements.taskGrid,
      visible,
      this.route.scope,
    );
  }

  /** Renders the loaded administrator overview or leaves the protected view empty. */
  private renderAdmin(): void {
    if (
      this.route.view !== 'admin' ||
      !this.adminOverview ||
      !this.canManage()
    ) {
      this.elements.adminView.replaceChildren();
      return;
    }
    renderAdminView(this.document, this.elements.adminView, this.adminOverview);
  }

  /** Re-renders the selected drawer or closes it if a refresh removed the task. */
  private renderDrawer(): void {
    const task = this.tasks.find(
      (candidate) => candidate.id === this.selectedTaskId,
    );
    if (!task) {
      this.closeDrawer();
      return;
    }
    renderTaskDrawer(
      this.document,
      this.elements.drawerInner,
      task,
      this.currentUserId,
      this.currentUser()?.permissions,
    );
    this.elements.drawer.classList.add('is-open');
    this.elements.drawerBackdrop.classList.add('is-open');
    this.elements.drawer.setAttribute('aria-hidden', 'false');
  }

  /** Opens one task drawer by ID. */
  private openDrawer(taskId: string): void {
    this.selectedTaskId = taskId;
    this.renderDrawer();
  }

  /** Closes the drawer and clears its selection. */
  private closeDrawer(): void {
    this.selectedTaskId = null;
    this.elements.drawer.classList.remove('is-open');
    this.elements.drawerBackdrop.classList.remove('is-open');
    this.elements.drawer.setAttribute('aria-hidden', 'true');
  }

  /** Opens and resets the task creation modal before focusing its first control. */
  private openModal(): void {
    this.elements.formError.textContent = '';
    this.elements.taskForm.reset();
    this.elements.modal.classList.add('is-open');
    this.elements.modalBackdrop.classList.add('is-open');
    this.elements.modal.setAttribute('aria-hidden', 'false');
    (
      this.elements.taskForm.elements.namedItem(
        'title',
      ) as HTMLInputElement | null
    )?.focus();
  }

  /** Closes the creation modal without mutating its server state. */
  private closeModal(): void {
    this.elements.modal.classList.remove('is-open');
    this.elements.modalBackdrop.classList.remove('is-open');
    this.elements.modal.setAttribute('aria-hidden', 'true');
  }

  /** Synchronizes profile panel visibility and its accessibility state. */
  private setProfileMenuOpen(open: boolean): void {
    this.elements.profileMenu.classList.toggle('is-open', open);
    this.elements.profileButton.setAttribute('aria-expanded', String(open));
    this.elements.profilePanel.setAttribute('aria-hidden', String(!open));
    this.elements.profilePanel.hidden = !open;
  }

  /** Closes the profile panel and restores trigger focus when a panel control owned focus. */
  private closeProfileMenu(): void {
    const focusInside = this.elements.profilePanel.contains(
      this.document.activeElement,
    );
    const wasOpen = this.elements.profileMenu.classList.contains('is-open');
    this.setProfileMenuOpen(false);
    if (wasOpen && focusInside) this.elements.profileButton.focus();
  }

  /** Toggles the profile panel from its avatar trigger. */
  private toggleProfileMenu(): void {
    this.setProfileMenuOpen(
      !this.elements.profileMenu.classList.contains('is-open'),
    );
  }

  /** Applies a theme atomically and keeps both root theme attributes synchronized. */
  private renderStyle(styleId: string): void {
    const applied = this.styles.apply(
      styleId,
      this.document.documentElement.style,
    );
    this.document.documentElement.dataset.style = applied;
    this.document.body.dataset.style = applied;
    this.elements.styleSelect.value = applied;
    this.currentStyleId = applied;
  }

  /** Persists a theme only after successful visual application. */
  private changeStyle(): void {
    try {
      this.renderStyle(this.elements.styleSelect.value);
      saveStyleId(this.storage, this.styles, this.currentStyleId);
    } catch {
      this.elements.styleSelect.value = this.currentStyleId;
      this.showToast('视觉风格切换失败，请重试');
    }
  }

  /** Updates the task hash from status shortcut buttons on the home view. */
  private handleStatusShortcut(event: Event): void {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-status-shortcut]')
        : null;
    if (!target) return;
    this.navigateTasks(
      'mine',
      (target.dataset.statusShortcut ?? '全部') as FilterLabel,
      '',
    );
  }

  /** Routes application hash links without allowing native fragment scrolling to change the captured view. */
  private handleHashNavigation(event: Event): void {
    if (event.defaultPrevented) return;
    const mouseEvent = event as MouseEvent;
    if (
      (typeof mouseEvent.button === 'number' && mouseEvent.button !== 0) ||
      mouseEvent.metaKey ||
      mouseEvent.ctrlKey ||
      mouseEvent.shiftKey ||
      mouseEvent.altKey
    )
      return;
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[href^="#"]');
    const hash = link?.getAttribute('href');
    if (!link || !hash) return;
    if (normalizeHash(hash) === normalizeHash(this.window.location.hash))
      return;
    event.preventDefault();
    this.window.history.pushState(null, '', hash);
    void this.handleRouteChange();
  }

  /** Updates task scope from the sidebar controls. */
  private handleScope(event: Event): void {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-scope]')
        : null;
    if (!target) return;
    this.navigateTasks(
      (target.dataset.scope ?? 'all') as TaskScope,
      this.route.filter,
      this.route.query,
    );
  }

  /** Updates status filtering from the sidebar controls. */
  private handleFilter(event: Event): void {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-filter]')
        : null;
    if (!target || target.hidden) return;
    this.navigateTasks(
      this.route.scope,
      (target.dataset.filter ?? '全部') as FilterLabel,
      this.route.query,
    );
  }

  /** Replaces only the search portion of the current hash to avoid navigation churn while typing. */
  private handleSearch(): void {
    this.route = { ...this.route, query: this.elements.searchInput.value };
    this.window.history.replaceState(null, '', buildTaskHash(this.route));
    this.resetTaskInnerScroll();
    this.renderTasks();
  }

  /** Navigates to one normalized task-board hash. */
  private navigateTasks(
    scope: TaskScope,
    filter: FilterLabel,
    query: string,
  ): void {
    const hash = normalizeHash(buildTaskHash({ scope, filter, query }));
    if (hash === normalizeHash(this.window.location.hash)) return;
    this.window.history.pushState(null, '', hash);
    void this.handleRouteChange();
  }

  /** Resets the independently scrolling task grid and sidebar after task-route edits. */
  private resetTaskInnerScroll(): void {
    this.elements.taskGrid.scrollTop = 0;
    const sidebar =
      this.elements.boardLayout.querySelector<HTMLElement>('.board-sidebar');
    if (sidebar) sidebar.scrollTop = 0;
  }

  /** Opens a task from pointer activation using event delegation. */
  private handleTaskOpen(event: Event): void {
    const card =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-task-id]')
        : null;
    if (card?.dataset.taskId) this.openDrawer(card.dataset.taskId);
  }

  /** Opens a task card from Enter or Space keyboard activation. */
  private handleTaskKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-task-id]')
        : null;
    if (card?.dataset.taskId) {
      event.preventDefault();
      this.openDrawer(card.dataset.taskId);
    }
  }

  /** Handles drawer close and optimistic action buttons through one delegated listener. */
  private async handleDrawerClick(event: Event): Promise<void> {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-close-drawer]')) {
      this.closeDrawer();
      return;
    }
    const button = event.target.closest<HTMLElement>('[data-action]');
    const task = this.tasks.find(
      (candidate) => candidate.id === this.selectedTaskId,
    );
    if (!button?.dataset.action || !task) return;
    const action = button.dataset.action as TaskAction;
    await this.gate.run(`task:${task.id}`, async () => {
      const request = this.requestSnapshot();
      try {
        const updated = await this.api.actOnTask(request.actorId, task.id, {
          action,
          expectedVersion: task.version,
        });
        if (!this.isCurrentRequest(request)) return;
        this.replaceTask(updated);
        this.render();
        this.showToast('任务状态已更新');
      } catch (error) {
        if (!this.isCurrentRequest(request)) return;
        await this.resynchronizeTasks(request);
        if (!this.isCurrentRequest(request)) return;
        this.showToast(this.errorMessage(error));
      }
    });
  }

  /** Replaces one projection after a successful command. */
  private replaceTask(updated: TaskResource): void {
    const index = this.tasks.findIndex((task) => task.id === updated.id);
    if (index === -1) this.tasks = [updated, ...this.tasks];
    else
      this.tasks = this.tasks.map((task) =>
        task.id === updated.id ? updated : task,
      );
  }

  /** Switches the current demo identity and persists only its ID. */
  private async changeIdentity(): Promise<void> {
    this.captureRenderedViewScroll();
    const sequence = ++this.identityChangeSequence;
    const actorId = saveCurrentUserId(
      this.storage,
      this.elements.identitySelect.value,
      this.knownUserIds(),
    );
    this.currentUserId = actorId;
    this.adminOverview = null;
    this.tasks = [];
    this.tasksLoaded = false;
    this.render();
    const identity = { actorId, sequence };
    try {
      const tasks = await this.loadTasksForCurrentUser(actorId);
      if (!this.isCurrentIdentity(identity)) return;
      this.tasks = tasks;
      this.tasksLoaded = true;
      if (this.canForActor(actorId, 'system.manage')) {
        const adminRequestSequence = this.beginAdminRequest();
        const overview = await this.api.getAdminOverview(actorId);
        if (
          !this.isCurrentIdentity(identity) ||
          adminRequestSequence !== this.adminRefreshSequence
        )
          return;
        this.adminOverview = overview;
      }
      if (!this.isCurrentIdentity(identity)) return;
      this.render();
      this.showToast('已切换当前身份');
    } catch (error) {
      if (!this.isCurrentIdentity(identity)) return;
      this.tasks = [];
      this.render();
      this.showToast(this.errorMessage(error));
    }
  }

  /** Loads the protected management overview when hash navigation enters admin. */
  private async handleRouteChange(): Promise<void> {
    const previousRoute = this.route;
    this.route = parseHash(this.window.location.hash);
    if (
      previousRoute.view === 'tasks' &&
      this.route.view === 'tasks' &&
      (previousRoute.scope !== this.route.scope ||
        previousRoute.filter !== this.route.filter ||
        previousRoute.query !== this.route.query)
    ) {
      this.resetTaskInnerScroll();
    }
    const request = {
      ...this.requestSnapshot(),
      routeSequence: ++this.routeChangeSequence,
    };
    const isCurrentRouteRequest = (): boolean => this.isCurrentRequest(request);
    if (!this.tasksLoaded) {
      try {
        const tasks = await this.loadTasksForCurrentUser(request.actorId);
        if (!isCurrentRouteRequest()) return;
        this.tasks = tasks;
        this.tasksLoaded = true;
      } catch (error) {
        if (!isCurrentRouteRequest()) return;
        this.showToast(this.errorMessage(error));
        this.render();
        return;
      }
    }
    if (
      this.route.view === 'admin' &&
      this.canForActor(request.actorId, 'system.manage')
    ) {
      const adminRequestSequence = this.beginAdminRequest();
      const isCurrentAdminRouteRequest = (): boolean =>
        this.isCurrentAdminRequest(request, adminRequestSequence);
      try {
        const overview = await this.api.getAdminOverview(request.actorId);
        if (!isCurrentAdminRouteRequest()) return;
        this.adminOverview = overview;
      } catch (error) {
        if (!isCurrentAdminRouteRequest()) return;
        if (
          error instanceof ApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          this.adminOverview = null;
          try {
            await this.refreshAdminOverview(request, request.routeSequence);
          } catch (refreshError) {
            if (!isCurrentRouteRequest()) return;
            this.route = parseHash('#home');
            this.window.history.replaceState(null, '', '#home');
            ++this.routeChangeSequence;
            this.render();
            this.showToast(this.errorMessage(refreshError));
          }
          if (!isCurrentRouteRequest()) return;
          return;
        }
        if (!isCurrentRouteRequest()) return;
        this.adminOverview = null;
        this.showToast(this.errorMessage(error));
      }
    }
    if (!isCurrentRouteRequest()) return;
    this.render();
  }

  /** Applies server reset, restores user A, and refreshes the in-memory snapshot once. */
  private async resetDemo(): Promise<void> {
    if (
      !this.window.confirm('确定要恢复初始演示任务吗？当前服务器任务会被清除。')
    )
      return;
    await this.gate.run('reset', async () => {
      const request = this.requestSnapshot();
      let activeRequest = request;
      try {
        await this.api.resetDemo(request.actorId);
        if (!this.isCurrentRequest(request)) return;
        const taskReader =
          this.users.find((user) => user.permissions?.includes('tasks.view')) ??
          this.users[0];
        const actorId = saveCurrentUserId(
          this.storage,
          taskReader?.id ?? '',
          this.knownUserIds(),
        );
        const sequence = ++this.identityChangeSequence;
        this.currentUserId = actorId;
        this.route = parseHash('#tasks?scope=all&filter=全部');
        this.window.history.replaceState(null, '', buildTaskHash(this.route));
        const nextRequest = {
          actorId,
          sequence,
          routeSequence: ++this.routeChangeSequence,
        };
        activeRequest = nextRequest;
        this.tasks = [];
        this.tasksLoaded = false;
        this.adminOverview = null;
        this.closeProfileMenu();
        this.closeDrawer();
        this.render();
        const tasks = await this.loadTasksForCurrentUser(actorId);
        if (!this.isCurrentRequest(nextRequest)) return;
        this.tasks = tasks;
        this.tasksLoaded = true;
        if (!this.isCurrentRequest(nextRequest)) return;
        this.render();
        this.showToast('演示数据已恢复');
      } catch (error) {
        if (!this.isCurrentRequest(activeRequest)) return;
        await this.resynchronizeTasks(activeRequest);
        if (!this.isCurrentRequest(activeRequest)) return;
        this.showToast(this.errorMessage(error));
      }
    });
  }

  /** Serializes and creates a valid task form exactly once while its request is pending. */
  private async createTask(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    await this.gate.run('create', async () => {
      const request = this.requestSnapshot();
      const form = new FormData(this.elements.taskForm);
      const command: CreateTaskRequest = {
        title: formText(form, 'title'),
        type: formText(form, 'type') as TaskType,
        description: formText(form, 'description'),
        reward: formText(form, 'reward'),
        dueDate: formText(form, 'dueDate'),
      };
      try {
        const created = await this.api.createTask(request.actorId, command);
        if (!this.isCurrentRequest(request)) return;
        this.tasks = [created, ...this.tasks];
        this.closeModal();
        this.render();
        this.openDrawer(created.id);
        this.showToast('新任务已发布');
      } catch (error) {
        if (!this.isCurrentRequest(request)) return;
        await this.resynchronizeTasks(request);
        if (!this.isCurrentRequest(request)) return;
        this.elements.formError.textContent = this.errorMessage(error);
      }
    });
  }

  /** Handles safe admin creation and edit forms through one delegated submit path. */
  private async handleAdminSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.adminForm) return;
    const values = new FormData(form);
    const kind = form.dataset.adminForm;
    await this.gate.run(
      `admin:${kind}:${form.dataset.adminId ?? 'new'}`,
      async () => {
        const request = this.requestSnapshot();
        try {
          if (kind === 'create-user') {
            await this.api.createAdminUser(request.actorId, {
              name: formText(values, 'name'),
              roleId: formText(values, 'roleId'),
            });
          } else if (kind === 'user') {
            await this.api.updateAdminUser(
              request.actorId,
              form.dataset.adminId ?? '',
              {
                name: formText(values, 'name'),
                roleId: formText(values, 'roleId'),
              },
            );
          } else if (kind === 'create-role') {
            await this.api.createAdminRole(request.actorId, {
              name: formText(values, 'name'),
              permissions: values.getAll('permissions') as PermissionCode[],
            });
          } else if (kind === 'role') {
            await this.api.updateAdminRole(
              request.actorId,
              form.dataset.adminId ?? '',
              {
                name: formText(values, 'name'),
                permissions: values.getAll('permissions') as PermissionCode[],
              },
            );
          } else return;
          if (!this.isCurrentRequest(request)) return;
          const refreshed = await this.refreshAdminOverview(
            request,
            request.routeSequence,
          );
          if (!refreshed || !this.isCurrentRequest(request)) return;
          this.showToast('管理信息已更新');
        } catch (error) {
          if (!this.isCurrentRequest(request)) return;
          this.showToast(this.errorMessage(error));
        }
      },
    );
  }

  /** Handles admin lifecycle buttons while keeping destructive operations soft-delete only. */
  private async handleAdminClick(event: Event): Promise<void> {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>(
      '[data-admin-action]',
    );
    if (!button?.dataset.adminAction || !button.dataset.adminId) return;
    const action = button.dataset.adminAction;
    const id = button.dataset.adminId;
    await this.gate.run(`admin:${action}:${id}`, async () => {
      const request = this.requestSnapshot();
      try {
        if (action === 'delete-user')
          await this.api.deleteAdminUser(request.actorId, id);
        else if (action === 'restore-user')
          await this.api.restoreAdminUser(request.actorId, id);
        else if (action === 'delete-role')
          await this.api.deleteAdminRole(request.actorId, id);
        else if (action === 'restore-role')
          await this.api.restoreAdminRole(request.actorId, id);
        if (!this.isCurrentRequest(request)) return;
        const refreshed = await this.refreshAdminOverview(
          request,
          request.routeSequence,
        );
        if (!refreshed || !this.isCurrentRequest(request)) return;
        this.showToast('管理信息已更新');
      } catch (error) {
        if (!this.isCurrentRequest(request)) return;
        this.showToast(this.errorMessage(error));
      }
    });
  }

  /** Re-reads admin state and falls back to the first manager if the current one lost access. */
  private async refreshAdminOverview(
    identity: IdentitySnapshot = this.identitySnapshot(),
    routeSequence = this.routeChangeSequence,
  ): Promise<boolean> {
    const refreshSequence = this.beginAdminRequest();
    const request: RequestSnapshot = {
      ...identity,
      routeSequence,
    };
    const isCurrentRequest = (): boolean =>
      this.isCurrentRequest(request) &&
      refreshSequence === this.adminRefreshSequence;
    try {
      const users = await this.api.listDemoUsers();
      if (!isCurrentRequest()) return false;
      this.users = users;
      if (!this.canForActor(identity.actorId, 'system.manage')) {
        const fallback =
          this.users.find(
            (user) =>
              user.id !== identity.actorId &&
              (user.permissions?.includes('system.manage') ||
                (user.permissions === undefined &&
                  user.role === 'system_admin')),
          ) ??
          this.users.find((user) => user.id !== identity.actorId) ??
          this.users[0];
        const actorId = saveCurrentUserId(
          this.storage,
          fallback?.id ?? '',
          this.knownUserIds(),
        );
        const sequence = ++this.identityChangeSequence;
        this.currentUserId = actorId;
        this.adminOverview = null;
        this.tasks = [];
        this.tasksLoaded = false;
        this.closeProfileMenu();
        this.closeDrawer();
        this.route = parseHash('#home');
        this.window.history.replaceState(null, '', '#home');
        this.render();
        const nextIdentity = { actorId, sequence };
        const fallbackRouteSequence = ++this.routeChangeSequence;
        const nextRequest = {
          ...nextIdentity,
          routeSequence: fallbackRouteSequence,
        };
        const tasks = await this.loadTasksForCurrentUser(actorId);
        if (
          !this.isCurrentRequest(nextRequest) ||
          refreshSequence !== this.adminRefreshSequence
        )
          return false;
        this.tasks = tasks;
        this.tasksLoaded = true;
        this.render();
        return true;
      }
      const overview = await this.api.getAdminOverview(request.actorId);
      if (!isCurrentRequest()) return false;
      this.adminOverview = overview;
      const tasks = await this.loadTasksForCurrentUser(request.actorId);
      if (!isCurrentRequest()) return false;
      this.tasks = tasks;
      this.tasksLoaded = true;
      this.render();
      return true;
    } catch (error) {
      if (!isCurrentRequest()) return false;
      throw error;
    }
  }

  /** Closes the profile menu for clicks outside both trigger and floating panel. */
  private handleOutsideClick(event: Event): void {
    if (!(event.target instanceof Element)) return;
    if (
      !event.target.closest('#profileMenu') &&
      !event.target.closest('#profilePanel')
    )
      this.closeProfileMenu();
  }

  /** Preserves Escape priority: profile menu, creation modal, then detail drawer. */
  private handleEscape(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    if (this.elements.profileMenu.classList.contains('is-open'))
      this.closeProfileMenu();
    else if (this.elements.modal.classList.contains('is-open'))
      this.closeModal();
    else if (this.elements.drawer.classList.contains('is-open'))
      this.closeDrawer();
  }

  /** Reloads tasks for one captured identity after a failed mutation or conflict. */
  private async resynchronizeTasks(
    request: RequestSnapshot = this.requestSnapshot(),
  ): Promise<void> {
    if (!this.isCurrentRequest(request)) return;
    try {
      const tasks = await this.api.listTasks(request.actorId);
      if (!this.isCurrentRequest(request)) return;
      this.tasks = tasks;
      this.tasksLoaded = true;
      this.render();
    } catch {
      // The original command error remains the most useful message when refresh also fails.
    }
  }

  /** Extracts user-facing messages while hiding non-API internal errors. */
  private errorMessage(error: unknown): string {
    return error instanceof ApiError ? error.message : '请求失败，请稍后重试';
  }

  /** Adds a polite status toast at the top of the independent notification stack. */
  private showToast(message: string): void {
    const notification = createNode(
      this.document,
      'div',
      'toast-item',
      message,
    );
    this.elements.toast.prepend(notification);
    this.window.requestAnimationFrame(() =>
      notification.classList.add('is-visible'),
    );
    this.window.setTimeout(() => {
      notification.classList.remove('is-visible');
      this.window.setTimeout(() => notification.remove(), 200);
    }, 2600);
  }
}
