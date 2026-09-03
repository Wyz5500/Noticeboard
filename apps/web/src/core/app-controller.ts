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
  buildAdminHash,
  normalizeHash,
  parseHash,
  type FilterLabel,
  type RouteState,
  type TaskScope,
} from './router.js';
import { nextAdminSort, type AdminSortField } from '../admin/admin-sort.js';
import type {
  AdminEditorDraft,
  AdminEditorState,
  AdminUserStatusFilter,
} from '../admin/admin-renderer.js';
import {
  loadCurrentUserId,
  saveCurrentUserId,
} from '../profile/identity-preference.js';
import { filterTasks, taskCounts } from '../tasks/task-filter.js';
import {
  type CommentEditorState,
  renderTaskDrawer,
  renderTaskGrid,
} from '../tasks/task-renderer.js';
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

/** Captures submitted admin values so a failed mutation can rebuild the same editor draft. */
function adminEditorDraft(kind: string, values: FormData): AdminEditorDraft {
  if (kind === 'create-user' || kind === 'user') {
    return {
      name: formText(values, 'name'),
      roleId: formText(values, 'roleId'),
    };
  }
  return {
    name: formText(values, 'name'),
    permissions: values
      .getAll('permissions')
      .filter(
        (value): value is string => typeof value === 'string',
      ) as PermissionCode[],
  };
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
  statExpired: HTMLElement;
  statClosed: HTMLElement;
  scopeSwitcher: HTMLElement;
  filterList: HTMLElement;
  filterDisclosure: HTMLDetailsElement;
  resultLabel: HTMLElement;
  resultCount: HTMLElement;
  searchInput: HTMLInputElement;
  newTaskButton: HTMLButtonElement;
  taskGrid: HTMLElement;
  identitySelect: HTMLSelectElement;
  drawer: HTMLElement;
  drawerBackdrop: HTMLElement;
  drawerInner: HTMLElement;
  renewalModal: HTMLElement;
  renewalBackdrop: HTMLElement;
  closeRenewalButton: HTMLButtonElement;
  cancelRenewalButton: HTMLButtonElement;
  renewalForm: HTMLFormElement;
  renewalCurrentDueDate: HTMLElement;
  renewalWorkflowStatus: HTMLElement;
  renewalDueDate: HTMLInputElement;
  renewalPreserveLabel: HTMLElement;
  renewalError: HTMLElement;
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

interface CommentEditSession extends CommentEditorState {
  expectedVersion: number;
  sessionId: number;
}

interface ViewScrollState {
  windowY: number;
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
    statExpired: requiredElement(document, '#statExpired'),
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
    taskGrid: requiredElement(document, '#taskGrid'),
    identitySelect: requiredElement(document, '#identitySelect'),
    drawer: requiredElement(document, '#detailDrawer'),
    drawerBackdrop: requiredElement(document, '#drawerBackdrop'),
    drawerInner: requiredElement(document, '#drawerInner'),
    renewalModal: requiredElement(document, '#renewalModal'),
    renewalBackdrop: requiredElement(document, '#renewalBackdrop'),
    closeRenewalButton: requiredElement(document, '#closeRenewalButton'),
    cancelRenewalButton: requiredElement(document, '#cancelRenewalButton'),
    renewalForm: requiredElement(document, '#renewalForm'),
    renewalCurrentDueDate: requiredElement(document, '#renewalCurrentDueDate'),
    renewalWorkflowStatus: requiredElement(document, '#renewalWorkflowStatus'),
    renewalDueDate: requiredElement(document, '#renewalDueDate'),
    renewalPreserveLabel: requiredElement(document, '#renewalPreserveLabel'),
    renewalError: requiredElement(document, '#renewalError'),
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
  private readonly commentDrafts = new Map<string, string>();
  private commentEditor: CommentEditSession | null = null;
  private commentEditSequence = 0;
  private readonly compactTaskQuery: MediaQueryList;
  private users: ActorResource[] = [];
  private tasks: TaskResource[] = [];
  private tasksLoaded = false;
  private adminOverview: AdminOverviewResource | null = null;
  private adminEditor: AdminEditorState | null = null;
  private adminUserQuery = '';
  private adminUserRole = 'all';
  private adminUserStatus: AdminUserStatusFilter = 'active';
  private currentUserId = '';
  private identityChangeSequence = 0;
  private routeChangeSequence = 0;
  private adminRefreshSequence = 0;
  private taskProjectionSequence = 0;
  private currentStyleId = '';
  private route: RouteState;
  private selectedTaskId: string | null = null;
  private renderedView: RouteState['view'] | null = null;
  private readonly viewScrollStates = new Map<
    RouteState['view'],
    ViewScrollState
  >();
  private pendingScrollRestoreView: RouteState['view'] | null = null;
  private scrollRestoreSequence = 0;
  private taskRefreshScheduled = false;

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
    this.compactTaskQuery.addEventListener('change', () =>
      this.syncTaskFilterDisclosure(),
    );
    this.window.addEventListener('hashchange', () => {
      void this.handleRouteChange();
    });
    this.window.addEventListener('focus', () => this.scheduleTaskRefresh());
    this.document.addEventListener('visibilitychange', () => {
      if (this.document.visibilityState === 'visible')
        this.scheduleTaskRefresh();
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
    this.elements.adminView.addEventListener(
      'change',
      (event) => void this.handleAdminChange(event),
    );
    this.elements.adminView.addEventListener('input', (event) =>
      this.handleAdminInput(event),
    );
    this.elements.drawerInner.addEventListener(
      'click',
      (event) => void this.handleDrawerClick(event),
    );
    this.elements.drawerInner.addEventListener('input', (event) =>
      this.handleDrawerInput(event),
    );
    this.elements.drawerInner.addEventListener(
      'submit',
      (event) => void this.handleDrawerSubmit(event),
    );
    this.elements.drawerBackdrop.addEventListener('click', () =>
      this.closeDrawer(),
    );
    this.elements.closeRenewalButton.addEventListener('click', () =>
      this.closeRenewalDialog(),
    );
    this.elements.cancelRenewalButton.addEventListener('click', () =>
      this.closeRenewalDialog(),
    );
    this.elements.renewalBackdrop.addEventListener('click', () =>
      this.closeRenewalDialog(),
    );
    this.elements.renewalForm.addEventListener(
      'submit',
      (event) => void this.handleRenewalSubmit(event),
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

  /** Coalesces focus and visibility recovery into one animation-frame refresh. */
  private scheduleTaskRefresh(): void {
    if (this.document.visibilityState === 'hidden' || this.taskRefreshScheduled)
      return;
    this.taskRefreshScheduled = true;
    this.window.requestAnimationFrame(() => {
      this.taskRefreshScheduled = false;
      if (this.document.visibilityState === 'visible')
        void this.refreshTasksAfterResume();
    });
  }

  /** Reloads effective task projections after the page resumes across a business-date boundary. */
  private async refreshTasksAfterResume(): Promise<void> {
    if (!this.currentUserId) return;
    await this.gate.run('tasks:resume', async () => {
      const request = this.requestSnapshot();
      const taskProjectionSequence = this.taskProjectionSequence ?? 0;
      const isCurrentProjectionRequest = (): boolean =>
        this.isCurrentRequest(request) &&
        taskProjectionSequence === (this.taskProjectionSequence ?? 0);
      try {
        const tasks = await this.loadTasksForCurrentUser(request.actorId);
        if (!isCurrentProjectionRequest()) return;
        this.tasks = tasks;
        this.tasksLoaded = true;
        this.render();
      } catch (error) {
        if (!isCurrentProjectionRequest()) return;
        this.showToast(this.errorMessage(error));
      }
    });
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
    this.elements.statExpired.textContent = String(counts.expired);
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
      this.window.location.hash = '#home';
      return;
    }
    const enteringView = this.renderedView !== this.route.view;
    if (enteringView) {
      this.captureRenderedViewScroll();
      if (this.renderedView !== null) {
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
    for (const link of this.elements.viewNav.querySelectorAll<HTMLElement>(
      '[data-view]',
    )) {
      const active = link.dataset.view === this.route.view;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    this.renderedView = this.route.view;
    if (enteringTasks) {
      this.syncTaskFilterDisclosure(true);
      this.window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
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

  /** Captures the document position owned by the currently rendered top-level view. */
  private captureRenderedViewScroll(): void {
    if (this.renderedView == null) return;
    this.viewScrollStates.set(this.renderedView, {
      windowY: this.window?.scrollY ?? 0,
    });
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
        const state = this.viewScrollStates.get(view);
        this.window.scrollTo({
          left: 0,
          top: state?.windowY ?? 0,
          behavior: 'instant',
        });
      });
    });
  }

  /** Filters and renders the in-memory task snapshot without network requests. */
  private renderTasks(): void {
    const documentScrollY = this.window.scrollY;
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
    if (this.renderedView === 'tasks' && documentScrollY > 0) {
      this.window.scrollTo({
        top: documentScrollY,
        left: 0,
        behavior: 'instant',
      });
    }
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
    const state: Parameters<typeof renderAdminView>[3] = {};
    if (this.route.section) state.section = this.route.section;
    if (this.route.sort) state.sort = this.route.sort;
    if (this.adminEditor) state.editor = this.adminEditor;
    if (this.adminUserQuery) state.userQuery = this.adminUserQuery;
    if (this.adminUserRole && this.adminUserRole !== 'all')
      state.userRole = this.adminUserRole;
    if (this.adminUserStatus && this.adminUserStatus !== 'active')
      state.userStatus = this.adminUserStatus;
    renderAdminView(
      this.document,
      this.elements.adminView,
      this.adminOverview,
      state,
    );
  }

  /** Builds an identity-scoped key for one task comment draft. */
  private commentDraftKey(actorId: string, taskId: string): string {
    return `${actorId}\u0000${taskId}`;
  }

  /** Returns the active identity's in-memory draft for one task. */
  private commentDraft(taskId: string): string {
    return (
      this.commentDrafts.get(
        this.commentDraftKey(this.currentUserId, taskId),
      ) ?? ''
    );
  }

  /** Drops an edit state that no longer matches an editable server comment. */
  private reconcileCommentEditor(): void {
    if (!this.commentEditor) return;
    const task = this.tasks.find(
      (candidate) => candidate.id === this.commentEditor?.taskId,
    );
    const comment = task?.timeline.find(
      (entry) =>
        entry.kind === 'comment' &&
        entry.commentId === this.commentEditor?.commentId,
    );
    if (
      this.commentEditor.actorId !== this.currentUserId ||
      !task ||
      task.workflowStatus === 'closed' ||
      comment?.kind !== 'comment' ||
      comment.deleted ||
      comment.content === null ||
      comment.actor.id !== this.currentUserId
    ) {
      this.commentEditor = null;
      return;
    }
    if (this.commentEditor.expectedVersion !== task.version)
      this.commentEditor = {
        ...this.commentEditor,
        expectedVersion: task.version,
      };
  }

  /** Restores keyboard focus to one comment's edit trigger after cancellation. */
  private focusCommentEditButton(commentId: string): void {
    for (const button of this.elements.drawerInner.querySelectorAll<HTMLButtonElement>(
      '[data-edit-comment-id]',
    )) {
      if (button.dataset.editCommentId === commentId) {
        button.focus();
        return;
      }
    }
  }

  /** Re-renders the selected drawer or closes it if a refresh removed the task. */
  private renderDrawer(): void {
    this.reconcileCommentEditor();
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
      this.commentDraft(task.id),
      this.commentEditor ?? undefined,
    );
    this.elements.drawer.classList.add('is-open');
    this.elements.drawerBackdrop.classList.add('is-open');
    this.elements.drawer.setAttribute('aria-hidden', 'false');
    if (this.commentEditor)
      this.elements.drawerInner
        .querySelector<HTMLTextAreaElement>('[data-edit-comment-input]')
        ?.focus();
  }

  /** Loads the current server projection before opening one task drawer by ID. */
  private async openDrawer(taskId: string): Promise<void> {
    this.selectedTaskId = taskId;
    await this.gate.run(`task-read:${taskId}`, async () => {
      const request = this.requestSnapshot();
      try {
        const task = await this.api.getTask(taskId, request.actorId);
        if (!this.isCurrentRequest(request) || this.selectedTaskId !== taskId)
          return;
        this.replaceTask(task);
        this.renderDrawer();
      } catch (error) {
        if (!this.isCurrentRequest(request) || this.selectedTaskId !== taskId)
          return;
        this.selectedTaskId = null;
        this.showToast(this.errorMessage(error));
      }
    });
  }

  /** Closes the drawer and clears its selection. */
  private closeDrawer(): void {
    this.closeRenewalDialog();
    this.commentEditor = null;
    this.selectedTaskId = null;
    this.elements.drawer.classList.remove('is-open');
    this.elements.drawerBackdrop.classList.remove('is-open');
    this.elements.drawer.setAttribute('aria-hidden', 'true');
  }

  /** Opens the expired-task renewal dialog with the persisted workflow context. */
  private openRenewalDialog(): void {
    const task = this.tasks.find(
      (candidate) => candidate.id === this.selectedTaskId,
    );
    if (!task || task.status !== 'expired') return;
    this.elements.renewalForm.reset();
    this.elements.renewalError.textContent = '';
    this.elements.renewalCurrentDueDate.textContent = task.dueDate;
    this.elements.renewalWorkflowStatus.textContent = task.workflowStatusLabel;
    this.elements.renewalPreserveLabel.textContent = `保留原状态：${task.workflowStatusLabel}`;
    this.elements.renewalDueDate.value = '';
    this.elements.renewalModal.classList.add('is-open');
    this.elements.renewalBackdrop.classList.add('is-open');
    this.elements.renewalModal.setAttribute('aria-hidden', 'false');
    this.elements.renewalDueDate.focus();
  }

  /** Closes the expired-task renewal dialog without changing server state. */
  private closeRenewalDialog(): void {
    this.elements.renewalModal.classList.remove('is-open');
    this.elements.renewalBackdrop.classList.remove('is-open');
    this.elements.renewalModal.setAttribute('aria-hidden', 'true');
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
    event.preventDefault();
    if (normalizeHash(hash) === normalizeHash(this.window.location.hash))
      return;
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

  /** Opens a task from pointer activation using event delegation. */
  private handleTaskOpen(event: Event): void {
    const card =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-task-id]')
        : null;
    if (card?.dataset.taskId) void this.openDrawer(card.dataset.taskId);
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
      void this.openDrawer(card.dataset.taskId);
    }
  }

  /** Stores delegated textarea input in the active identity's task-scoped memory draft. */
  private handleDrawerInput(event: Event): void {
    if (!(event.target instanceof Element)) return;
    const editInput = event.target.closest<HTMLTextAreaElement>(
      '[data-edit-comment-input]',
    );
    if (
      editInput?.dataset.editCommentInput &&
      this.commentEditor?.commentId === editInput.dataset.editCommentInput
    ) {
      this.commentEditor = { ...this.commentEditor, draft: editInput.value };
      return;
    }
    const input = event.target.closest<HTMLTextAreaElement>(
      '[data-comment-input]',
    );
    const taskId = input?.dataset.commentInput;
    if (!input || !taskId) return;
    this.commentDrafts.set(
      this.commentDraftKey(this.currentUserId, taskId),
      input.value,
    );
  }

  /** Creates one timeline comment while retaining its draft through command failures. */
  private async handleDrawerSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const editCommentId = form.dataset.editCommentForm;
    if (editCommentId) {
      const task = this.tasks.find(
        (candidate) => candidate.id === this.selectedTaskId,
      );
      if (
        !task ||
        !this.commentEditor ||
        this.commentEditor.actorId !== this.currentUserId ||
        this.commentEditor.taskId !== task.id ||
        this.commentEditor.commentId !== editCommentId
      )
        return;
      const content = formText(new FormData(form), 'content');
      await this.gate.run(`task:${task.id}`, async () => {
        const editor = this.commentEditor;
        if (
          !editor ||
          editor.actorId !== this.currentUserId ||
          editor.taskId !== task.id ||
          editor.commentId !== editCommentId
        )
          return;
        const expectedVersion = editor.expectedVersion;
        const submittedEditor = { ...editor, draft: content };
        this.commentEditor = submittedEditor;
        const request = this.requestSnapshot();
        try {
          const updated = await this.api.editTaskComment(
            request.actorId,
            task.id,
            editCommentId,
            { content, expectedVersion },
          );
          if (!this.isCurrentRequest(request)) return;
          if (
            this.commentEditor?.sessionId === submittedEditor.sessionId &&
            this.commentEditor.draft === submittedEditor.draft
          )
            this.commentEditor = null;
          this.replaceTask(updated);
          this.render();
          this.showToast('评论已更新');
        } catch (error) {
          if (!this.isCurrentRequest(request)) return;
          await this.resynchronizeTask(task.id, request);
          if (!this.isCurrentRequest(request)) return;
          this.showToast(this.errorMessage(error));
        }
      });
      return;
    }
    if (!form.dataset.commentForm) return;
    const task = this.tasks.find(
      (candidate) =>
        candidate.id === form.dataset.commentForm &&
        candidate.id === this.selectedTaskId,
    );
    if (!task) return;
    const content = formText(new FormData(form), 'content');
    const draftKey = this.commentDraftKey(this.currentUserId, task.id);
    this.commentDrafts.set(draftKey, content);
    await this.gate.run(`task:${task.id}`, async () => {
      const request = this.requestSnapshot();
      try {
        const updated = await this.api.createTaskComment(
          request.actorId,
          task.id,
          {
            content,
            expectedVersion: task.version,
          },
        );
        this.commentDrafts.delete(
          this.commentDraftKey(request.actorId, task.id),
        );
        if (!this.isCurrentRequest(request)) return;
        this.replaceTask(updated);
        this.render();
        this.showToast('评论已发表');
      } catch (error) {
        if (!this.isCurrentRequest(request)) return;
        await this.resynchronizeTasks(request);
        if (!this.isCurrentRequest(request)) return;
        this.showToast(this.errorMessage(error));
      }
    });
  }

  /** Handles drawer close, comment deletion, and task actions through one delegated listener. */
  private async handleDrawerClick(event: Event): Promise<void> {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-close-drawer]')) {
      this.closeDrawer();
      return;
    }
    if (event.target.closest('[data-renew-expired]')) {
      this.openRenewalDialog();
      return;
    }
    const task = this.tasks.find(
      (candidate) => candidate.id === this.selectedTaskId,
    );
    if (!task) return;
    const cancelEdit = event.target.closest<HTMLElement>(
      '[data-cancel-comment-edit]',
    );
    if (
      cancelEdit?.dataset.cancelCommentEdit &&
      this.commentEditor?.commentId === cancelEdit.dataset.cancelCommentEdit
    ) {
      const commentId = cancelEdit.dataset.cancelCommentEdit;
      this.commentEditor = null;
      this.renderDrawer();
      this.focusCommentEditButton(commentId);
      return;
    }
    const editButton = event.target.closest<HTMLElement>(
      '[data-edit-comment-id]',
    );
    if (editButton?.dataset.editCommentId) {
      if (this.commentEditor) return;
      const comment = task.timeline.find(
        (entry) =>
          entry.kind === 'comment' &&
          entry.commentId === editButton.dataset.editCommentId,
      );
      if (
        comment?.kind !== 'comment' ||
        comment.deleted ||
        task.workflowStatus === 'closed' ||
        comment.actor.id !== this.currentUserId ||
        comment.content === null
      )
        return;
      this.commentEditor = {
        actorId: this.currentUserId,
        taskId: task.id,
        commentId: comment.commentId,
        draft: comment.content,
        expectedVersion: task.version,
        sessionId: (this.commentEditSequence ?? 0) + 1,
      };
      this.commentEditSequence = this.commentEditor.sessionId;
      this.renderDrawer();
      return;
    }
    const deleteButton = event.target.closest<HTMLElement>(
      '[data-delete-comment-id]',
    );
    if (deleteButton?.dataset.deleteCommentId) {
      const commentId = deleteButton.dataset.deleteCommentId;
      await this.gate.run(`task:${task.id}`, async () => {
        const request = this.requestSnapshot();
        try {
          const updated = await this.api.deleteTaskComment(
            request.actorId,
            task.id,
            commentId,
            { expectedVersion: task.version },
          );
          if (!this.isCurrentRequest(request)) return;
          this.replaceTask(updated);
          this.render();
          this.showToast('评论已删除');
        } catch (error) {
          if (!this.isCurrentRequest(request)) return;
          await this.resynchronizeTasks(request);
          if (!this.isCurrentRequest(request)) return;
          this.showToast(this.errorMessage(error));
        }
      });
      return;
    }
    const button = event.target.closest<HTMLElement>('[data-action]');
    if (!button?.dataset.action) return;
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

  /** Serializes the renewal dialog fields into one atomic server command. */
  private async handleRenewalSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const values = new FormData(this.elements.renewalForm);
    await this.renewSelectedTask({
      dueDate: formText(values, 'dueDate'),
      recoveryStrategy: formText(values, 'recoveryStrategy') as
        'preserve_status' | 'reopened',
    });
  }

  /** Renews the selected expired task with one optimistic command. */
  private async renewSelectedTask(command: {
    dueDate: string;
    recoveryStrategy: 'preserve_status' | 'reopened';
  }): Promise<void> {
    const task = this.tasks.find(
      (candidate) => candidate.id === this.selectedTaskId,
    );
    if (!task) return;
    await this.gate.run(`task:${task.id}`, async () => {
      const request = this.requestSnapshot();
      try {
        const updated = await this.api.renewExpiredTask(
          request.actorId,
          task.id,
          { ...command, expectedVersion: task.version },
        );
        if (!this.isCurrentRequest(request)) return;
        this.replaceTask(updated);
        this.closeRenewalDialog();
        this.render();
        this.showToast('任务已续期');
      } catch (error) {
        if (!this.isCurrentRequest(request)) return;
        await this.resynchronizeTasks(request);
        if (!this.isCurrentRequest(request)) return;
        this.elements.renewalError.textContent = this.errorMessage(error);
      }
    });
  }

  /** Replaces one projection after a successful command. */
  private replaceTask(updated: TaskResource): void {
    this.taskProjectionSequence = (this.taskProjectionSequence ?? 0) + 1;
    const index = this.tasks.findIndex((task) => task.id === updated.id);
    if (index === -1) this.tasks = [updated, ...this.tasks];
    else
      this.tasks = this.tasks.map((task) =>
        task.id === updated.id ? updated : task,
      );
    this.reconcileCommentEditor();
  }

  /** Switches the current demo identity and persists only its ID. */
  private async changeIdentity(): Promise<void> {
    this.captureRenderedViewScroll();
    const sequence = ++this.identityChangeSequence;
    this.adminEditor = null;
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
    this.route = parseHash(this.window.location.hash);
    this.adminEditor = null;
    if (
      this.route.view === 'admin' &&
      this.route.section &&
      this.route.section !== 'overview' &&
      this.route.sort
    ) {
      const canonicalHash = buildAdminHash(this.route.section, this.route.sort);
      if (this.window.location.hash !== canonicalHash)
        this.window.history.replaceState(null, '', canonicalHash);
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
        this.commentDrafts.clear();
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
        await this.openDrawer(created.id);
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
        const editor = this.adminEditor;
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
          this.adminEditor = null;
          this.render();
          this.showToast('管理信息已更新');
        } catch (error) {
          if (!this.isCurrentRequest(request)) return;
          this.adminEditor = editor
            ? { ...editor, draft: adminEditorDraft(kind, values) }
            : null;
          this.render();
          this.showToast(this.errorMessage(error));
        }
      },
    );
  }

  /** Handles admin lifecycle buttons while keeping destructive operations soft-delete only. */
  private async handleAdminClick(event: Event): Promise<void> {
    if (!(event.target instanceof Element)) return;
    const close = event.target.closest<HTMLElement>('[data-admin-close]');
    if (close?.dataset.adminClose === 'dialog') {
      this.adminEditor = null;
      this.render();
      return;
    }
    const open = event.target.closest<HTMLElement>('[data-admin-open]');
    if (open?.dataset.adminOpen) {
      const value = open.dataset.adminOpen;
      if (value === 'create-user' || value === 'create-role') {
        this.adminEditor = {
          kind: value === 'create-user' ? 'user' : 'role',
          mode: 'create',
        };
      } else if (
        (value === 'user' || value === 'role') &&
        open.dataset.adminId
      ) {
        const record =
          value === 'user'
            ? this.adminOverview?.users.find(
                (candidate) => candidate.id === open.dataset.adminId,
              )
            : this.adminOverview?.roles.find(
                (candidate) => candidate.id === open.dataset.adminId,
              );
        if (!record) return;
        this.adminEditor = {
          kind: value,
          mode: 'edit',
          record,
        } as AdminEditorState;
      } else return;
      this.render();
      return;
    }
    const sort = event.target.closest<HTMLElement>('[data-admin-sort]');
    if (sort?.dataset.adminSort) {
      this.updateAdminSort(sort.dataset.adminSort as AdminSortField);
      return;
    }
    const direction = event.target.closest<HTMLElement>(
      '[data-admin-direction]',
    );
    if (direction) {
      const section = this.route.section;
      if (section === 'users' || section === 'roles') {
        this.updateAdminSort(this.route.sort?.field ?? 'updatedAt', true);
      }
      return;
    }
    const button = event.target.closest<HTMLButtonElement>(
      '[data-admin-action]',
    );
    if (!button?.dataset.adminAction || !button.dataset.adminId) return;
    const action = button.dataset.adminAction;
    const id = button.dataset.adminId;
    if (
      action === 'delete-user' &&
      !this.window.confirm(
        '确定删除该用户吗？删除后该用户将无法参与正常业务流程。',
      )
    )
      return;
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
        this.adminEditor = null;
        this.render();
        this.showToast('管理信息已更新');
      } catch (error) {
        if (!this.isCurrentRequest(request)) return;
        this.showToast(this.errorMessage(error));
      }
    });
  }

  /** Applies user list filters or mobile sort fields without requesting a fresh overview. */
  private handleAdminChange(event: Event): void {
    if (!(event.target instanceof Element)) return;
    const role = event.target.closest<HTMLSelectElement>(
      '[data-admin-user-role]',
    );
    if (role) {
      this.adminUserRole = role.value || 'all';
      this.render();
      return;
    }
    const status = event.target.closest<HTMLSelectElement>(
      '[data-admin-user-status]',
    );
    if (status) {
      this.adminUserStatus = ['active', 'deleted', 'all'].includes(status.value)
        ? (status.value as AdminUserStatusFilter)
        : 'active';
      this.render();
      return;
    }
    const select = event.target.closest<HTMLSelectElement>(
      '[data-admin-sort-select]',
    );
    if (!select?.value) return;
    this.updateAdminSort(select.value as AdminSortField);
  }

  /** Filters users as the administrator types and restores focus after safe rerendering. */
  private handleAdminInput(event: Event): void {
    if (!(event.target instanceof Element)) return;
    const input = event.target.closest<HTMLInputElement>(
      '[data-admin-user-query]',
    );
    if (!input) return;
    this.adminUserQuery = input.value;
    this.render();
    const replacement = this.elements.adminView.querySelector<HTMLInputElement>(
      '[data-admin-user-query]',
    );
    if (!replacement) return;
    replacement.focus();
    replacement.setSelectionRange(
      replacement.value.length,
      replacement.value.length,
    );
  }

  /** Replaces only the active admin child sort hash and re-renders memory state. */
  private updateAdminSort(field: AdminSortField, directionOnly = false): void {
    const section = this.route.section;
    if (section !== 'users' && section !== 'roles') return;
    const current = this.route.sort ?? {
      field: 'updatedAt',
      direction: 'desc',
    };
    const sort = nextAdminSort(
      section,
      current,
      directionOnly ? current.field : field,
    );
    this.route = { ...this.route, sort };
    this.window.history.replaceState(null, '', buildAdminHash(section, sort));
    this.render();
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
    else if (this.elements.renewalModal.classList.contains('is-open'))
      this.closeRenewalDialog();
    else if (this.adminEditor) {
      this.adminEditor = null;
      this.render();
    } else if (this.commentEditor) {
      const commentId = this.commentEditor.commentId;
      this.commentEditor = null;
      this.renderDrawer();
      this.focusCommentEditButton(commentId);
    } else if (this.elements.modal.classList.contains('is-open'))
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
      this.taskProjectionSequence = (this.taskProjectionSequence ?? 0) + 1;
      this.reconcileCommentEditor();
      this.render();
    } catch {
      // The original command error remains the most useful message when refresh also fails.
    }
  }

  /** Reloads only one affected task while retaining a retryable comment edit draft. */
  private async resynchronizeTask(
    taskId: string,
    request: RequestSnapshot = this.requestSnapshot(),
  ): Promise<void> {
    if (!this.isCurrentRequest(request)) return;
    try {
      const task = await this.api.getTask(taskId, request.actorId);
      if (!this.isCurrentRequest(request)) return;
      this.replaceTask(task);
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
