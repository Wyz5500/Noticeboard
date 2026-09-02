/** Renders administrator landing cards, sortable lists, and safe editor dialogs. */
import type {
  AdminOverviewResource,
  AdminRoleResource,
  AdminUserResource,
  PermissionCode,
} from '../core/api-types.js';
import { createNode } from '../core/dom.js';
import {
  defaultAdminSort,
  sortAdminRecords,
  type AdminSection,
  type AdminSortField,
  type AdminSortState,
} from './admin-sort.js';

const DEFAULT_USER_ROLE_ID = 'role-user';

export type AdminUserStatusFilter = 'active' | 'deleted' | 'all';

export interface AdminEditorDraft {
  name: string;
  roleId?: string;
  permissions?: PermissionCode[];
}

export type AdminEditorState =
  | {
      kind: 'user';
      mode: 'create';
      record?: undefined;
      draft?: AdminEditorDraft;
    }
  | {
      kind: 'user';
      mode: 'edit';
      record: AdminUserResource;
      draft?: AdminEditorDraft;
    }
  | {
      kind: 'role';
      mode: 'create';
      record?: undefined;
      draft?: AdminEditorDraft;
    }
  | {
      kind: 'role';
      mode: 'edit';
      record: AdminRoleResource;
      draft?: AdminEditorDraft;
    };

export interface AdminRenderState {
  section?: AdminSection;
  sort?: AdminSortState;
  editor?: AdminEditorState;
  userQuery?: string;
  userRole?: string;
  userStatus?: AdminUserStatusFilter;
}

/** Formats an API timestamp in the browser's local calendar and clock. */
function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '时间未知';
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Creates one labeled text input while keeping supplied content out of markup. */
function field(
  document: Document,
  label: string,
  name: string,
  value: string,
  required = true,
): HTMLLabelElement {
  const wrapper = createNode(document, 'label', 'admin-field');
  wrapper.append(createNode(document, 'span', undefined, label));
  const input = createNode(document, 'input');
  input.type = 'text';
  input.name = name;
  input.value = value;
  input.required = required;
  wrapper.append(input);
  return wrapper;
}

/** Creates the single-role user select used by create and edit forms. */
function roleSelect(
  document: Document,
  roles: AdminRoleResource[],
  selected: string,
): HTMLLabelElement {
  const wrapper = createNode(document, 'label', 'admin-field');
  wrapper.append(createNode(document, 'span', undefined, '角色'));
  const select = createNode(document, 'select');
  select.name = 'roleId';
  select.required = true;
  for (const role of roles.filter((candidate) => candidate.active)) {
    const option = createNode(document, 'option', undefined, role.name);
    option.value = role.id;
    option.selected = role.id === selected;
    select.append(option);
  }
  wrapper.append(select);
  return wrapper;
}

/** Creates the permission checkbox group for role forms. */
function permissionChecks(
  document: Document,
  overview: AdminOverviewResource,
  selected: readonly PermissionCode[],
): HTMLElement {
  const group = createNode(document, 'fieldset', 'admin-permissions');
  group.append(createNode(document, 'legend', undefined, '权限'));
  for (const permission of overview.permissions) {
    const label = createNode(document, 'label', 'admin-permission');
    const input = createNode(document, 'input');
    input.type = 'checkbox';
    input.name = 'permissions';
    input.value = permission.code;
    input.checked = selected.includes(permission.code);
    label.append(
      input,
      createNode(
        document,
        'span',
        undefined,
        `${permission.name}：${permission.description}`,
      ),
    );
    group.append(label);
  }
  return group;
}

/** Returns the lifecycle or built-in label shared by desktop rows and mobile cards. */
function adminStatusText(
  kind: 'user' | 'role',
  record: AdminUserResource | AdminRoleResource,
): string {
  if (kind === 'user') return record.active ? '活跃' : '已删除';
  const role = record as AdminRoleResource;
  return role.builtin ? '内置角色' : role.active ? '自定义角色' : '已删除';
}

/** Creates one delegated action button with stable admin data attributes. */
function adminButton(
  document: Document,
  label: string,
  action: string,
  id?: string,
): HTMLButtonElement {
  const button = createNode(
    document,
    'button',
    'secondary-button admin-action',
    label,
  );
  button.type = 'button';
  button.dataset.adminAction = action;
  if (id) button.dataset.adminId = id;
  return button;
}

/** Creates a delete or restore action, omitting lifecycle mutation for built-ins. */
function lifecycleButton(
  document: Document,
  kind: 'user' | 'role',
  record: AdminUserResource | AdminRoleResource,
): HTMLButtonElement | null {
  if ('builtin' in record && record.builtin) return null;
  return adminButton(
    document,
    kind === 'user' && record.active
      ? '删除'
      : record.active
        ? '逻辑删除'
        : '恢复',
    `${record.active ? 'delete' : 'restore'}-${kind}`,
    record.id,
  );
}

/** Creates a compact monochrome user status with a non-color visual cue. */
function userStatusNode(
  document: Document,
  user: AdminUserResource,
): HTMLElement {
  const status = createNode(
    document,
    'span',
    `admin-user-status ${user.active ? 'is-active' : 'is-deleted'}`,
  );
  const marker = createNode(
    document,
    'span',
    'admin-status-marker',
    user.active ? '●' : '○',
  );
  marker.setAttribute('aria-hidden', 'true');
  status.append(
    marker,
    createNode(document, 'span', undefined, adminStatusText('user', user)),
  );
  return status;
}

/** Groups lower-emphasis user actions in a native keyboard-operable disclosure. */
function userActions(document: Document, user: AdminUserResource): HTMLElement {
  const actions = createNode(
    document,
    'div',
    'admin-record-actions admin-user-actions',
  );
  actions.append(editButton(document, 'user', user.id));
  const more = createNode(document, 'details', 'admin-more-actions');
  const summary = createNode(document, 'summary', undefined, '•••');
  summary.setAttribute('aria-label', `更多用户操作：${user.name}`);
  const menu = createNode(document, 'div', 'admin-more-menu');
  menu.append(editButton(document, 'user', user.id));
  const lifecycle = lifecycleButton(document, 'user', user);
  if (lifecycle) {
    if (user.active) lifecycle.className += ' is-danger';
    menu.append(lifecycle);
  }
  more.append(summary, menu);
  actions.append(more);
  return actions;
}

/** Creates a delegated edit button for a record. */
function editButton(
  document: Document,
  kind: 'user' | 'role',
  id: string,
): HTMLButtonElement {
  const button = createNode(
    document,
    'button',
    'secondary-button admin-edit',
    '编辑',
  );
  button.type = 'button';
  button.dataset.adminOpen = kind;
  button.dataset.adminId = id;
  return button;
}

/** Appends a local updated-at value to a record information block. */
function updatedAtNode(
  document: Document,
  value: string,
  withLabel = true,
): HTMLElement {
  return createNode(
    document,
    'p',
    'admin-updated-at',
    `${withLabel ? '修改时间：' : ''}${formatUpdatedAt(value)}`,
  );
}

/** Creates a semantic desktop user row with information on the left and actions on the right. */
function userRow(
  document: Document,
  user: AdminUserResource,
): HTMLTableRowElement {
  const row = createNode(document, 'tr');
  const name = createNode(document, 'td');
  const nameContent = createNode(document, 'div', 'admin-record-info');
  nameContent.append(createNode(document, 'strong', undefined, user.name));
  name.append(nameContent);
  const role = createNode(document, 'td');
  role.append(createNode(document, 'span', 'admin-role-tag', user.roleName));
  const status = createNode(document, 'td');
  status.append(userStatusNode(document, user));
  const updatedAt = createNode(document, 'td');
  updatedAt.append(updatedAtNode(document, user.updatedAt, false));
  const actions = createNode(document, 'td');
  actions.append(userActions(document, user));
  row.append(name, role, status, updatedAt, actions);
  return row;
}

/** Creates a semantic desktop role row with permissions and built-in handling. */
function roleRow(
  document: Document,
  role: AdminRoleResource,
): HTMLTableRowElement {
  const row = createNode(document, 'tr');
  const name = createNode(document, 'td', 'admin-record-info');
  name.append(createNode(document, 'strong', undefined, role.name));
  const code = createNode(document, 'td', 'admin-meta', role.code);
  const permissions = createNode(
    document,
    'td',
    'admin-meta',
    String(role.permissions.length),
  );
  const status = createNode(
    document,
    'td',
    'admin-status',
    adminStatusText('role', role),
  );
  const updatedAt = createNode(document, 'td');
  updatedAt.append(updatedAtNode(document, role.updatedAt));
  const actions = createNode(document, 'td', 'admin-record-actions');
  actions.append(editButton(document, 'role', role.id));
  const lifecycle = lifecycleButton(document, 'role', role);
  if (lifecycle) actions.append(lifecycle);
  row.append(name, code, permissions, status, updatedAt, actions);
  return row;
}

/** Creates a mobile card with the same delegated actions as its desktop row. */
function mobileCard(
  document: Document,
  kind: 'user' | 'role',
  record: AdminUserResource | AdminRoleResource,
): HTMLElement {
  const card = createNode(
    document,
    'article',
    kind === 'user'
      ? 'admin-mobile-card admin-user-mobile-card'
      : 'admin-mobile-card',
  );
  const info = createNode(document, 'div', 'admin-record-info');
  if (kind === 'user') {
    const user = record as AdminUserResource;
    const metadata = createNode(document, 'div', 'admin-user-mobile-meta');
    metadata.append(
      createNode(document, 'span', 'admin-role-tag', user.roleName),
      userStatusNode(document, user),
    );
    info.append(
      createNode(document, 'strong', undefined, user.name),
      metadata,
      updatedAtNode(document, user.updatedAt, false),
    );
    card.append(info, userActions(document, user));
    return card;
  }
  const role = record as AdminRoleResource;
  info.append(
    createNode(document, 'strong', undefined, role.name),
    createNode(document, 'span', 'admin-meta', `代码：${role.code}`),
    createNode(document, 'span', 'admin-status', adminStatusText('role', role)),
    updatedAtNode(document, role.updatedAt),
  );
  const actions = createNode(document, 'div', 'admin-record-actions');
  actions.append(editButton(document, 'role', role.id));
  const lifecycle = lifecycleButton(document, 'role', role);
  if (lifecycle) actions.append(lifecycle);
  card.append(info, actions);
  return card;
}

/** Creates the fixed mobile sorting controls for a child page. */
function sortControls(
  document: Document,
  section: 'users' | 'roles',
  sort: AdminSortState,
): HTMLElement {
  const fields: readonly [AdminSortField, string][] =
    section === 'users'
      ? [
          ['name', '名称'],
          ['role', '角色'],
          ['status', '状态'],
          ['updatedAt', '最近修改'],
        ]
      : [
          ['name', '名称'],
          ['code', '代码'],
          ['permissions', '权限数'],
          ['status', '状态'],
          ['updatedAt', '最近修改'],
        ];
  const bar = createNode(document, 'div', 'admin-sort-bar');
  const select = createNode(document, 'select');
  select.name = 'sort';
  select.dataset.adminSortSelect = section;
  for (const [fieldName, label] of fields) {
    const option = createNode(document, 'option', undefined, label);
    option.value = fieldName;
    option.selected = sort.field === fieldName;
    select.append(option);
  }
  const direction = adminButton(
    document,
    sort.direction === 'asc' ? '升序' : '降序',
    `direction-${sort.direction}`,
  );
  direction.className = 'secondary-button admin-direction';
  direction.dataset.adminDirection = sort.direction;
  bar.append(select, direction);
  return bar;
}

/** Creates desktop table markup with one delegated sort button per sortable field. */
function desktopTable(
  document: Document,
  section: 'users' | 'roles',
  records: readonly (AdminUserResource | AdminRoleResource)[],
  sort: AdminSortState,
): HTMLTableElement {
  const table = createNode(document, 'table', 'admin-table');
  const head = createNode(document, 'thead');
  const header = createNode(document, 'tr');
  const fields: readonly [AdminSortField, string][] =
    section === 'users'
      ? [
          ['name', '用户'],
          ['role', '角色'],
          ['status', '状态'],
          ['updatedAt', '最近修改'],
        ]
      : [
          ['name', '名称'],
          ['code', '代码'],
          ['permissions', '权限数'],
          ['status', '状态'],
          ['updatedAt', '最近修改'],
        ];
  for (const [fieldName, label] of fields) {
    const cell = createNode(document, 'th');
    const button = createNode(document, 'button', 'admin-sort-button');
    button.type = 'button';
    button.dataset.adminSort = fieldName;
    cell.ariaSort =
      sort.field === fieldName
        ? sort.direction === 'asc'
          ? 'ascending'
          : 'descending'
        : 'none';
    button.append(createNode(document, 'span', undefined, label));
    if (section === 'users' && sort.field === fieldName) {
      const indicator = createNode(
        document,
        'span',
        'admin-sort-indicator',
        sort.direction === 'asc' ? '⌃' : '⌄',
      );
      indicator.dataset.adminSortIndicator = fieldName;
      indicator.setAttribute('aria-hidden', 'true');
      button.append(indicator);
    }
    cell.append(button);
    header.append(cell);
  }
  header.append(createNode(document, 'th', undefined, '操作'));
  head.append(header);
  const body = createNode(document, 'tbody');
  for (const record of records)
    body.append(
      section === 'users'
        ? userRow(document, record as AdminUserResource)
        : roleRow(document, record as AdminRoleResource),
    );
  table.append(head, body);
  return table;
}

/** Creates the compact user search and filters toolbar. */
function userToolbar(
  document: Document,
  overview: AdminOverviewResource,
  state: AdminRenderState,
): HTMLElement {
  const toolbar = createNode(document, 'div', 'admin-user-toolbar');
  const filters = createNode(document, 'div', 'admin-user-filters');
  const searchLabel = createNode(document, 'label', 'admin-user-search');
  searchLabel.append(createNode(document, 'span', 'sr-only', '搜索用户'));
  const search = createNode(document, 'input');
  search.type = 'search';
  search.placeholder = '搜索用户…';
  search.value = state.userQuery ?? '';
  search.dataset.adminUserQuery = 'true';
  search.setAttribute('aria-label', '搜索用户');
  searchLabel.append(search);

  const roleLabel = createNode(document, 'label');
  roleLabel.append(createNode(document, 'span', 'sr-only', '按角色筛选'));
  const role = createNode(document, 'select');
  role.dataset.adminUserRole = 'true';
  role.setAttribute('aria-label', '按角色筛选');
  const allRoles = createNode(document, 'option', undefined, '全部角色');
  allRoles.value = 'all';
  allRoles.selected = (state.userRole ?? 'all') === 'all';
  role.append(allRoles);
  for (const candidate of overview.roles) {
    const option = createNode(document, 'option', undefined, candidate.name);
    option.value = candidate.id;
    option.selected = state.userRole === candidate.id;
    role.append(option);
  }
  roleLabel.append(role);

  const statusLabel = createNode(document, 'label');
  statusLabel.append(createNode(document, 'span', 'sr-only', '按状态筛选'));
  const status = createNode(document, 'select');
  status.dataset.adminUserStatus = 'true';
  status.setAttribute('aria-label', '按状态筛选');
  const selectedStatus = state.userStatus ?? 'active';
  for (const [value, label] of [
    ['active', '活跃用户'],
    ['deleted', '已删除用户'],
    ['all', '全部状态'],
  ] as const) {
    const option = createNode(document, 'option', undefined, label);
    option.value = value;
    option.selected = selectedStatus === value;
    status.append(option);
  }
  statusLabel.append(status);
  filters.append(searchLabel, roleLabel, statusLabel);
  toolbar.append(filters);
  return toolbar;
}

/** Creates a compact mobile header exposing every user sort field. */
function userMobileSort(document: Document, sort: AdminSortState): HTMLElement {
  const header = createNode(document, 'nav', 'admin-user-mobile-sort');
  header.setAttribute('aria-label', '用户列表排序');
  for (const [fieldName, label] of [
    ['name', '用户'],
    ['role', '角色'],
    ['status', '状态'],
    ['updatedAt', '最近修改'],
  ] as const) {
    const button = createNode(document, 'button', 'admin-mobile-sort-button');
    button.type = 'button';
    button.dataset.adminSort = fieldName;
    button.setAttribute('aria-label', `按${label}排序`);
    button.append(createNode(document, 'span', undefined, label));
    if (sort.field === fieldName) {
      const indicator = createNode(
        document,
        'span',
        'admin-sort-indicator',
        sort.direction === 'asc' ? '⌃' : '⌄',
      );
      indicator.dataset.adminSortIndicator = fieldName;
      indicator.setAttribute('aria-hidden', 'true');
      button.append(indicator);
    }
    header.append(button);
  }
  return header;
}

/** Creates a delegated create button for the selected child management page. */
function createButton(
  document: Document,
  kind: 'user' | 'role',
): HTMLButtonElement {
  const button = createNode(
    document,
    'button',
    'primary-button',
    kind === 'user' ? '+ 创建用户' : '创建角色',
  );
  button.type = 'button';
  button.dataset.adminOpen = `create-${kind}`;
  return button;
}

/** Filters the complete administrator user snapshot for the current local controls. */
function filteredUsers(
  users: readonly AdminUserResource[],
  state: AdminRenderState,
): AdminUserResource[] {
  const query = (state.userQuery ?? '').trim().toLocaleLowerCase('zh-Hans');
  const role = state.userRole ?? 'all';
  const status = state.userStatus ?? 'active';
  return users.filter((user) => {
    const matchesQuery =
      !query || user.name.toLocaleLowerCase('zh-Hans').includes(query);
    const matchesRole = role === 'all' || user.roleId === role;
    const matchesStatus =
      status === 'all' || (status === 'active' ? user.active : !user.active);
    return matchesQuery && matchesRole && matchesStatus;
  });
}

/** Creates the compact user-management title block and its single primary action. */
function userHeader(document: Document): HTMLElement {
  const header = createNode(document, 'header', 'admin-user-header');
  const copy = createNode(document, 'div', 'admin-user-header-copy');
  const breadcrumb = createNode(document, 'nav', 'admin-breadcrumb');
  breadcrumb.setAttribute('aria-label', '面包屑');
  const back = createNode(document, 'a', undefined, '管理');
  back.href = '#admin';
  const separator = createNode(document, 'span', undefined, '/');
  separator.setAttribute('aria-hidden', 'true');
  const current = createNode(document, 'span', undefined, '用户管理');
  current.setAttribute('aria-current', 'page');
  breadcrumb.append(back, separator, current);
  copy.append(
    breadcrumb,
    createNode(document, 'h1', undefined, '用户管理'),
    createNode(
      document,
      'p',
      'admin-user-description',
      '管理系统中的用户账号、角色与账号状态',
    ),
  );
  header.append(copy, createButton(document, 'user'));
  return header;
}

/** Summarizes the complete user collection independently of local filters. */
function userSummary(
  document: Document,
  overview: AdminOverviewResource,
): HTMLElement {
  const activeCount = overview.users.filter((user) => user.active).length;
  return createNode(
    document,
    'p',
    'admin-user-summary',
    `${overview.users.length} 个用户 · ${activeCount} 个活跃 · ${overview.users.length - activeCount} 个已删除`,
  );
}

/** Renders the management landing page with two complete navigational cards. */
function landing(document: Document): HTMLElement {
  const section = createNode(document, 'section', 'admin-landing');
  for (const entry of [
    {
      number: '01',
      title: '用户管理',
      description: '管理系统用户、账户状态与角色分配',
      details: ['用户列表', '账户状态', '角色分配'],
      href: '#admin/users',
    },
    {
      number: '02',
      title: '角色管理',
      description: '维护系统角色及其权限范围',
      details: ['角色列表', '权限配置', '角色成员'],
      href: '#admin/roles',
    },
  ] as const) {
    const card = createNode(document, 'article', 'admin-entry-card');
    const link = createNode(document, 'a', 'admin-entry-link');
    link.href = entry.href;
    const details = createNode(document, 'ul', 'admin-entry-details');
    for (const detail of entry.details)
      details.append(createNode(document, 'li', undefined, detail));
    const arrow = createNode(document, 'span', 'admin-entry-arrow', '↗');
    arrow.setAttribute('aria-hidden', 'true');
    link.append(
      createNode(document, 'span', 'admin-entry-number', entry.number),
      createNode(document, 'h2', 'admin-entry-title', entry.title),
      createNode(document, 'p', 'admin-entry-description', entry.description),
      details,
      arrow,
    );
    card.append(link);
    section.append(card);
  }
  return section;
}

/** Creates the editor form for a user or role and preserves existing FormData names. */
function editorDialog(
  document: Document,
  overview: AdminOverviewResource,
  editor: AdminEditorState,
): HTMLDialogElement {
  const dialog = createNode(document, 'dialog', 'admin-dialog');
  const kind = editor.kind;
  const record = editor.record;
  const draft = editor.draft;
  const title =
    editor.mode === 'create'
      ? kind === 'user'
        ? '创建用户'
        : '创建角色'
      : kind === 'user'
        ? '编辑用户'
        : '编辑角色';
  const heading = createNode(document, 'h2', undefined, title);
  heading.id = 'admin-editor-title';
  dialog.setAttribute('aria-labelledby', heading.id);
  dialog.append(heading);
  const form = createNode(document, 'form', 'admin-form');
  form.dataset.adminForm = editor.mode === 'create' ? `create-${kind}` : kind;
  if (record) form.dataset.adminId = record.id;
  if (kind === 'user') {
    const user = record as AdminUserResource | undefined;
    form.append(
      field(document, '用户名称', 'name', draft?.name ?? user?.name ?? ''),
      roleSelect(
        document,
        overview.roles,
        draft?.roleId ??
          user?.roleId ??
          overview.roles.find(
            (role) => role.active && role.id === DEFAULT_USER_ROLE_ID,
          )?.id ??
          overview.roles.find((role) => role.active)?.id ??
          '',
      ),
    );
  } else {
    const role = record as AdminRoleResource | undefined;
    const name = field(
      document,
      '角色名称',
      'name',
      draft?.name ?? role?.name ?? '',
    );
    if (role?.builtin)
      name.querySelector('input')?.setAttribute('readonly', '');
    form.append(
      name,
      permissionChecks(
        document,
        overview,
        draft?.permissions ?? role?.permissions ?? [],
      ),
    );
  }
  const actions = createNode(document, 'div', 'admin-form-actions');
  const save = createNode(document, 'button', 'primary-button', '保存');
  save.type = 'submit';
  const close = createNode(document, 'button', 'secondary-button', '取消');
  close.type = 'button';
  close.dataset.adminClose = 'dialog';
  actions.append(save, close);
  const lifecycle = record ? lifecycleButton(document, kind, record) : null;
  if (lifecycle) actions.append(lifecycle);
  form.append(actions);
  dialog.append(form);
  return dialog;
}

/** Renders landing, desktop/mobile child lists, and an optional editor dialog. */
export function renderAdminView(
  document: Document,
  container: HTMLElement,
  overview: AdminOverviewResource,
  state: AdminRenderState = {},
): void {
  const section = state.section ?? 'overview';
  const intro = createNode(
    document,
    'section',
    section === 'overview' ? 'admin-intro admin-intro-overview' : 'admin-intro',
  );
  if (section === 'overview') {
    intro.append(
      createNode(document, 'p', 'eyebrow', 'ADMINISTRATION'),
      createNode(document, 'h1', undefined, '管理'),
      createNode(
        document,
        'p',
        'admin-intro-description',
        '用户、角色与权限配置',
      ),
    );
  } else {
    intro.append(
      createNode(document, 'p', 'eyebrow', '公会管理 / 管理'),
      createNode(
        document,
        'h1',
        undefined,
        section === 'users' ? '用户管理' : '角色管理',
      ),
    );
  }
  if (section === 'overview') {
    container.replaceChildren(intro, landing(document));
    return;
  }
  const sort = state.sort ?? defaultAdminSort(section);
  if (section === 'users') {
    const records = sortAdminRecords(
      'users',
      filteredUsers(overview.users, state),
      sort,
    );
    const child = createNode(
      document,
      'section',
      'admin-section admin-section-users',
    );
    child.append(
      userToolbar(document, overview, state),
      desktopTable(document, 'users', records, sort),
      userMobileSort(document, sort),
    );
    const mobile = createNode(document, 'div', 'admin-mobile-list');
    for (const record of records)
      mobile.append(mobileCard(document, 'user', record));
    child.append(mobile);
    const children: HTMLElement[] = [
      userHeader(document),
      userSummary(document, overview),
      child,
    ];
    const dialog = state.editor
      ? editorDialog(document, overview, state.editor)
      : undefined;
    if (dialog) children.push(dialog);
    container.replaceChildren(...children);
    if (dialog) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.open = true;
    }
    return;
  }
  const records = sortAdminRecords('roles', overview.roles, sort);
  const child = createNode(document, 'section', 'admin-section');
  const back = createNode(document, 'a', 'admin-back-link', '返回管理首页');
  back.href = '#admin';
  child.append(
    back,
    sortControls(document, 'roles', sort),
    createButton(document, 'role'),
    desktopTable(document, 'roles', records, sort),
  );
  const mobile = createNode(document, 'div', 'admin-mobile-list');
  for (const record of records)
    mobile.append(mobileCard(document, 'role', record));
  child.append(mobile);
  const children: HTMLElement[] = [intro, child];
  const dialog = state.editor
    ? editorDialog(document, overview, state.editor)
    : undefined;
  if (dialog) children.push(dialog);
  container.replaceChildren(...children);
  if (dialog) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.open = true;
  }
}
