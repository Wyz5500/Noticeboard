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
  private users: ActorResource[] = [];
  private tasks: TaskResource[] = [];
  private adminOverview: AdminOverviewResource | null = null;
  private currentUserId = '';
  private identityChangeSequence = 0;
  private currentStyleId = '';
  private route: RouteState;
  private selectedTaskId: string | null = null;
  private renderedView: RouteState['view'] | null = null;
  private tasksCollapsedScrollY = 0;
  private taskPageScrollTimer: number | null = null;

  /** Receives browser boundaries and the versioned API client from the entrypoint. */
  constructor(
    private readonly window: Window,
    private readonly document: Document,
    private readonly storage: Storage,
    private readonly api: ApiClient,
  ) {
    this.elements = collectElements(document);
    this.route = parseHash(window.location.hash);
  }

  /** Initializes static controls, preferences, event bindings, and the first API snapshot. */
  async start(): Promise<void> {
    this.renderStaticOptions();
    this.bindEvents();
    this.currentStyleId = loadStyleId(this.storage, this.styles);
    this.renderStyle(this.currentStyleId);
    let identity: IdentitySnapshot | null = null;
    try {
      this.users = await this.api.listDemoUsers();
      this.currentUserId = loadCurrentUserId(this.storage, this.knownUserIds());
      identity = this.identitySnapshot();
      const tasks = await this.loadTasksForCurrentUser(identity.actorId);
      if (!this.isCurrentIdentity(identity)) return;
      this.tasks = tasks;
      if (
        this.route.view === 'admin' &&
        this.canForActor(identity.actorId, 'system.manage')
      ) {
        const overview = await this.api.getAdminOverview(identity.actorId);
        if (!this.isCurrentIdentity(identity)) return;
        this.adminOverview = overview;
      }
      if (!this.isCurrentIdentity(identity)) return;
      this.render();
    } catch (error) {
      if (identity && !this.isCurrentIdentity(identity)) return;
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
    this.window.addEventListener('scroll', () => this.handleTaskPageScroll(), {
      passive: true,
    });
    this.window.addEventListener('hashchange', () => {
      void this.handleRouteChange();
    });
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

  /** Rejects responses from an actor or identity generation that is no longer current. */
  private isCurrentIdentity(identity: IdentitySnapshot): boolean {
    return (
      identity.actorId === this.currentUserId &&
      identity.sequence === this.identityChangeSequence
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
    const enteringTasks = tasksVisible && this.renderedView !== 'tasks';
    this.elements.homeView.classList.toggle(
      'is-active',
      !tasksVisible && !adminVisible,
    );
    this.elements.tasksView.classList.toggle('is-active', tasksVisible);
    this.elements.adminView.classList.toggle('is-active', adminVisible);
    if (this.route.view === 'admin' && !adminVisible) {
      this.window.location.hash = '#home';
      return;
    }
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
    this.renderedView = this.route.view === 'admin' ? 'home' : this.route.view;
    if (enteringTasks) {
      this.measureTasksIntroCollapse();
    } else if (!tasksVisible) {
      this.clearTaskPageScrollTimer();
      this.tasksCollapsedScrollY = 0;
    }
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
    this.window.location.hash = buildTaskHash({ scope, filter, query });
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
      const identity = this.identitySnapshot();
      try {
        const updated = await this.api.actOnTask(identity.actorId, task.id, {
          action,
          expectedVersion: task.version,
        });
        if (!this.isCurrentIdentity(identity)) return;
        this.replaceTask(updated);
        this.render();
        this.showToast('任务状态已更新');
      } catch (error) {
        if (!this.isCurrentIdentity(identity)) return;
        await this.resynchronizeTasks(identity);
        if (!this.isCurrentIdentity(identity)) return;
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
    const sequence = ++this.identityChangeSequence;
    const actorId = saveCurrentUserId(
      this.storage,
      this.elements.identitySelect.value,
      this.knownUserIds(),
    );
    this.currentUserId = actorId;
    this.adminOverview = null;
    this.tasks = [];
    this.render();
    const identity = { actorId, sequence };
    try {
      const tasks = await this.loadTasksForCurrentUser(actorId);
      if (!this.isCurrentIdentity(identity)) return;
      this.tasks = tasks;
      if (this.canForActor(actorId, 'system.manage')) {
        const overview = await this.api.getAdminOverview(actorId);
        if (!this.isCurrentIdentity(identity)) return;
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
    const identity = this.identitySnapshot();
    if (
      this.route.view === 'admin' &&
      this.canForActor(identity.actorId, 'system.manage')
    ) {
      try {
        const overview = await this.api.getAdminOverview(identity.actorId);
        if (!this.isCurrentIdentity(identity)) return;
        this.adminOverview = overview;
      } catch (error) {
        if (!this.isCurrentIdentity(identity)) return;
        if (
          error instanceof ApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          this.adminOverview = null;
          try {
            const users = await this.api.listDemoUsers();
            if (!this.isCurrentIdentity(identity)) return;
            this.users = users;
          } catch {
            // Keep the existing identity list when the permission refresh also fails.
          }
          if (!this.isCurrentIdentity(identity)) return;
          this.route = parseHash('#home');
          this.window.location.hash = '#home';
        }
        if (!this.isCurrentIdentity(identity)) return;
        this.showToast(this.errorMessage(error));
      }
    }
    if (!this.isCurrentIdentity(identity)) return;
    this.render();
  }

  /** Applies server reset, restores user A, and refreshes the in-memory snapshot once. */
  private async resetDemo(): Promise<void> {
    if (
      !this.window.confirm('确定要恢复初始演示任务吗？当前服务器任务会被清除。')
    )
      return;
    await this.gate.run('reset', async () => {
      const identity = this.identitySnapshot();
      let activeIdentity = identity;
      try {
        await this.api.resetDemo(identity.actorId);
        if (!this.isCurrentIdentity(identity)) return;
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
        const nextIdentity = { actorId, sequence };
        activeIdentity = nextIdentity;
        this.tasks = [];
        this.adminOverview = null;
        const tasks = await this.loadTasksForCurrentUser(actorId);
        if (!this.isCurrentIdentity(nextIdentity)) return;
        this.tasks = tasks;
        this.closeProfileMenu();
        this.closeDrawer();
        this.route = parseHash('#tasks?scope=all&filter=全部');
        this.window.location.hash = buildTaskHash(this.route);
        if (!this.isCurrentIdentity(nextIdentity)) return;
        this.render();
        this.showToast('演示数据已恢复');
      } catch (error) {
        if (!this.isCurrentIdentity(activeIdentity)) return;
        await this.resynchronizeTasks(activeIdentity);
        if (!this.isCurrentIdentity(activeIdentity)) return;
        this.showToast(this.errorMessage(error));
      }
    });
  }

  /** Serializes and creates a valid task form exactly once while its request is pending. */
  private async createTask(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    await this.gate.run('create', async () => {
      const identity = this.identitySnapshot();
      const form = new FormData(this.elements.taskForm);
      const command: CreateTaskRequest = {
        title: formText(form, 'title'),
        type: formText(form, 'type') as TaskType,
        description: formText(form, 'description'),
        reward: formText(form, 'reward'),
        dueDate: formText(form, 'dueDate'),
      };
      try {
        const created = await this.api.createTask(identity.actorId, command);
        if (!this.isCurrentIdentity(identity)) return;
        this.tasks = [created, ...this.tasks];
        this.closeModal();
        this.render();
        this.openDrawer(created.id);
        this.showToast('新任务已发布');
      } catch (error) {
        if (!this.isCurrentIdentity(identity)) return;
        await this.resynchronizeTasks(identity);
        if (!this.isCurrentIdentity(identity)) return;
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
        const identity = this.identitySnapshot();
        try {
          if (kind === 'create-user') {
            await this.api.createAdminUser(identity.actorId, {
              name: formText(values, 'name'),
              roleId: formText(values, 'roleId'),
            });
          } else if (kind === 'user') {
            await this.api.updateAdminUser(
              identity.actorId,
              form.dataset.adminId ?? '',
              {
                name: formText(values, 'name'),
                roleId: formText(values, 'roleId'),
              },
            );
          } else if (kind === 'create-role') {
            await this.api.createAdminRole(identity.actorId, {
              name: formText(values, 'name'),
              permissions: values.getAll('permissions') as PermissionCode[],
            });
          } else if (kind === 'role') {
            await this.api.updateAdminRole(
              identity.actorId,
              form.dataset.adminId ?? '',
              {
                name: formText(values, 'name'),
                permissions: values.getAll('permissions') as PermissionCode[],
              },
            );
          } else return;
          if (!this.isCurrentIdentity(identity)) return;
          await this.refreshAdminOverview(identity);
          if (!this.isCurrentIdentity(identity)) return;
          this.showToast('管理信息已更新');
        } catch (error) {
          if (!this.isCurrentIdentity(identity)) return;
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
      const identity = this.identitySnapshot();
      try {
        if (action === 'delete-user')
          await this.api.deleteAdminUser(identity.actorId, id);
        else if (action === 'restore-user')
          await this.api.restoreAdminUser(identity.actorId, id);
        else if (action === 'delete-role')
          await this.api.deleteAdminRole(identity.actorId, id);
        else if (action === 'restore-role')
          await this.api.restoreAdminRole(identity.actorId, id);
        if (!this.isCurrentIdentity(identity)) return;
        await this.refreshAdminOverview(identity);
        if (!this.isCurrentIdentity(identity)) return;
        this.showToast('管理信息已更新');
      } catch (error) {
        if (!this.isCurrentIdentity(identity)) return;
        this.showToast(this.errorMessage(error));
      }
    });
  }

  /** Re-reads admin state and falls back to the first manager if the current one lost access. */
  private async refreshAdminOverview(
    identity = this.identitySnapshot(),
  ): Promise<void> {
    const users = await this.api.listDemoUsers();
    if (!this.isCurrentIdentity(identity)) return;
    this.users = users;
    if (!this.canForActor(identity.actorId, 'system.manage')) {
      const fallback =
        this.users.find(
          (user) =>
            user.id !== identity.actorId &&
            (user.permissions?.includes('system.manage') ||
              (user.permissions === undefined && user.role === 'system_admin')),
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
      this.closeProfileMenu();
      this.closeDrawer();
      this.route = parseHash('#home');
      this.window.location.hash = '#home';
      this.render();
      const nextIdentity = { actorId, sequence };
      const tasks = await this.loadTasksForCurrentUser(actorId);
      if (!this.isCurrentIdentity(nextIdentity)) return;
      this.tasks = tasks;
      this.render();
      return;
    }
    const overview = await this.api.getAdminOverview(identity.actorId);
    if (!this.isCurrentIdentity(identity)) return;
    this.adminOverview = overview;
    const tasks = await this.loadTasksForCurrentUser(identity.actorId);
    if (!this.isCurrentIdentity(identity)) return;
    this.tasks = tasks;
    this.render();
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
    identity = this.identitySnapshot(),
  ): Promise<void> {
    if (!this.isCurrentIdentity(identity)) return;
    try {
      const tasks = await this.api.listTasks(identity.actorId);
      if (!this.isCurrentIdentity(identity)) return;
      this.tasks = tasks;
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
