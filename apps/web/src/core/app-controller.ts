/** Coordinates API state, hash routing, safe renderers, profile controls, and overlay interactions. */
import type {
  ActorResource,
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
  profileMenu: HTMLElement;
  profileButton: HTMLButtonElement;
  profilePanel: HTMLElement;
  avatarInitial: HTMLElement;
  profileName: HTMLElement;
  resetButton: HTMLButtonElement;
  styleSelect: HTMLSelectElement;
  viewNav: HTMLElement;
  homeView: HTMLElement;
  tasksView: HTMLElement;
  statTotal: HTMLElement;
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

/** Resolves the preserved HTML shell once so contract drift fails during startup. */
function collectElements(document: Document): Elements {
  return {
    profileMenu: requiredElement(document, '#profileMenu'),
    profileButton: requiredElement(document, '#profileButton'),
    profilePanel: requiredElement(document, '#profilePanel'),
    avatarInitial: requiredElement(document, '#avatarInitial'),
    profileName: requiredElement(document, '#profileName'),
    resetButton: requiredElement(document, '#resetButton'),
    styleSelect: requiredElement(document, '#styleSelect'),
    viewNav: requiredElement(document, '.view-nav'),
    homeView: requiredElement(document, '#homeView'),
    tasksView: requiredElement(document, '#tasksView'),
    statTotal: requiredElement(document, '#statTotal'),
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
  private currentUserId = '';
  private currentStyleId = '';
  private route: RouteState;
  private selectedTaskId: string | null = null;
  private toastTimer: number | undefined;

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
    try {
      [this.users, this.tasks] = await Promise.all([
        this.api.listDemoUsers(),
        this.api.listTasks(),
      ]);
      this.currentUserId = loadCurrentUserId(this.storage, this.knownUserIds());
      this.render();
    } catch (error) {
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
    this.window.addEventListener('hashchange', () => {
      this.route = parseHash(this.window.location.hash);
      this.render();
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
    this.elements.identitySelect.addEventListener('change', () =>
      this.changeIdentity(),
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

  /** Returns the selected actor or the first API actor as a transient startup fallback. */
  private currentUser(): ActorResource | null {
    return (
      this.users.find((user) => user.id === this.currentUserId) ??
      this.users[0] ??
      null
    );
  }

  /** Renders profile, statistics, route controls, view visibility, list, and selected drawer. */
  private render(): void {
    this.renderIdentity();
    this.renderStats();
    this.renderControls();
    this.renderView();
    this.renderTasks();
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
    this.elements.homeView.classList.toggle('is-active', !tasksVisible);
    this.elements.tasksView.classList.toggle('is-active', tasksVisible);
    for (const link of this.elements.viewNav.querySelectorAll<HTMLElement>(
      '[data-view]',
    )) {
      const active = link.dataset.view === this.route.view;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
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
        ? 'MY QUESTS'
        : this.route.filter === '全部'
          ? 'ALL QUESTS'
          : this.route.filter.toUpperCase();
    this.elements.resultCount.textContent = `${visible.length} 项任务${this.route.query ? ' · 搜索结果' : ''}`;
    renderTaskGrid(
      this.document,
      this.elements.taskGrid,
      visible,
      this.route.scope,
    );
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
      try {
        const updated = await this.api.actOnTask(this.currentUserId, task.id, {
          action,
          expectedVersion: task.version,
        });
        this.replaceTask(updated);
        this.render();
        this.showToast('任务状态已更新');
      } catch (error) {
        await this.resynchronizeTasks();
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
  private changeIdentity(): void {
    this.currentUserId = saveCurrentUserId(
      this.storage,
      this.elements.identitySelect.value,
      this.knownUserIds(),
    );
    this.render();
    this.showToast('已切换当前身份');
  }

  /** Applies server reset, restores user A, and refreshes the in-memory snapshot once. */
  private async resetDemo(): Promise<void> {
    if (
      !this.window.confirm('确定要恢复初始演示任务吗？当前服务器任务会被清除。')
    )
      return;
    await this.gate.run('reset', async () => {
      try {
        await this.api.resetDemo(this.currentUserId);
        this.tasks = await this.api.listTasks();
        this.currentUserId = saveCurrentUserId(
          this.storage,
          this.users[0]?.id ?? '',
          this.knownUserIds(),
        );
        this.closeProfileMenu();
        this.closeDrawer();
        this.route = parseHash('#tasks?scope=all&filter=全部');
        this.window.location.hash = buildTaskHash(this.route);
        this.render();
        this.showToast('演示数据已恢复');
      } catch (error) {
        await this.resynchronizeTasks();
        this.showToast(this.errorMessage(error));
      }
    });
  }

  /** Serializes and creates a valid task form exactly once while its request is pending. */
  private async createTask(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    await this.gate.run('create', async () => {
      const form = new FormData(this.elements.taskForm);
      const command: CreateTaskRequest = {
        title: formText(form, 'title'),
        type: formText(form, 'type') as TaskType,
        description: formText(form, 'description'),
        reward: formText(form, 'reward'),
        dueDate: formText(form, 'dueDate'),
      };
      try {
        const created = await this.api.createTask(this.currentUserId, command);
        this.tasks = [created, ...this.tasks];
        this.closeModal();
        this.render();
        this.openDrawer(created.id);
        this.showToast('新任务已发布');
      } catch (error) {
        await this.resynchronizeTasks();
        this.elements.formError.textContent = this.errorMessage(error);
      }
    });
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

  /** Reloads tasks after any failed mutation or conflict, retaining visible UI filters. */
  private async resynchronizeTasks(): Promise<void> {
    try {
      this.tasks = await this.api.listTasks();
      this.render();
    } catch {
      // The original command error remains the most useful message when refresh also fails.
    }
  }

  /** Extracts user-facing messages while hiding non-API internal errors. */
  private errorMessage(error: unknown): string {
    return error instanceof ApiError ? error.message : '请求失败，请稍后重试';
  }

  /** Shows a polite status toast and restarts its visibility timeout. */
  private showToast(message: string): void {
    if (this.toastTimer !== undefined)
      this.window.clearTimeout(this.toastTimer);
    this.elements.toast.textContent = message;
    this.elements.toast.classList.add('is-visible');
    this.toastTimer = this.window.setTimeout(
      () => this.elements.toast.classList.remove('is-visible'),
      2600,
    );
  }
}
