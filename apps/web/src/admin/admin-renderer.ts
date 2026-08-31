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

export type AdminEditorState =
  | { kind: 'user'; mode: 'create'; record?: undefined }
  | { kind: 'user'; mode: 'edit'; record: AdminUserResource }
  | { kind: 'role'; mode: 'create'; record?: undefined }
  | { kind: 'role'; mode: 'edit'; record: AdminRoleResource };

export interface AdminRenderState {
  section?: AdminSection;
  sort?: AdminSortState;
  editor?: AdminEditorState;
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
    record.active ? '逻辑删除' : '恢复',
    `${record.active ? 'delete' : 'restore'}-${kind}`,
    record.id,
  );
}

/** Creates a delegated edit button for a record. */
function editButton(
  document: Document,
  kind: 'user' | 'role',
  id: string,
): HTMLButtonElement {
  const button = adminButton(document, '编辑', kind, id);
  button.dataset.adminOpen = kind;
  return button;
}

/** Appends a local updated-at value to a record information block. */
function updatedAtNode(document: Document, value: string): HTMLElement {
  return createNode(
    document,
    'p',
    'admin-updated-at',
    `修改时间：${formatUpdatedAt(value)}`,
  );
}

/** Creates a semantic desktop user row with information on the left and actions on the right. */
function userRow(
  document: Document,
  user: AdminUserResource,
): HTMLTableRowElement {
  const row = createNode(document, 'tr');
  const info = createNode(document, 'td', 'admin-record-info');
  info.append(
    createNode(document, 'strong', undefined, user.name),
    createNode(document, 'span', 'admin-meta', `角色：${user.roleName}`),
    updatedAtNode(document, user.updatedAt),
  );
  const status = createNode(
    document,
    'td',
    'admin-status',
    user.active ? '活跃' : '已删除',
  );
  const actions = createNode(document, 'td', 'admin-record-actions');
  actions.append(editButton(document, 'user', user.id));
  const lifecycle = lifecycleButton(document, 'user', user);
  if (lifecycle) actions.append(lifecycle);
  row.append(info, status, actions);
  return row;
}

/** Creates a semantic desktop role row with permissions and built-in handling. */
function roleRow(
  document: Document,
  role: AdminRoleResource,
): HTMLTableRowElement {
  const row = createNode(document, 'tr');
  const info = createNode(document, 'td', 'admin-record-info');
  info.append(
    createNode(document, 'strong', undefined, role.name),
    createNode(document, 'span', 'admin-meta', `代码：${role.code}`),
    createNode(
      document,
      'span',
      'admin-meta',
      `权限数：${role.permissions.length}`,
    ),
    updatedAtNode(document, role.updatedAt),
  );
  const status = createNode(
    document,
    'td',
    'admin-status',
    role.builtin ? '内置角色' : role.active ? '自定义角色' : '已删除',
  );
  const actions = createNode(document, 'td', 'admin-record-actions');
  actions.append(editButton(document, 'role', role.id));
  const lifecycle = lifecycleButton(document, 'role', role);
  if (lifecycle) actions.append(lifecycle);
  row.append(info, status, actions);
  return row;
}

/** Creates a mobile card with the same delegated actions as its desktop row. */
function mobileCard(
  document: Document,
  kind: 'user' | 'role',
  record: AdminUserResource | AdminRoleResource,
): HTMLElement {
  const card = createNode(document, 'article', 'admin-mobile-card');
  const info = createNode(document, 'div', 'admin-record-info');
  info.append(
    createNode(document, 'strong', undefined, record.name),
    createNode(
      document,
      'span',
      'admin-meta',
      kind === 'user'
        ? `角色：${(record as AdminUserResource).roleName}`
        : `代码：${(record as AdminRoleResource).code}`,
    ),
    updatedAtNode(document, record.updatedAt),
  );
  const actions = createNode(document, 'div', 'admin-record-actions');
  actions.append(editButton(document, kind, record.id));
  const lifecycle = lifecycleButton(document, kind, record);
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
  for (const [fieldName, label] of fields) {
    const cell = createNode(document, 'th');
    const button = createNode(document, 'button', 'admin-sort-button', label);
    button.type = 'button';
    button.dataset.adminSort = fieldName;
    button.ariaSort =
      sort.field === fieldName
        ? sort.direction === 'asc'
          ? 'ascending'
          : 'descending'
        : 'none';
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

/** Creates a delegated create button for the selected child management page. */
function createButton(
  document: Document,
  kind: 'user' | 'role',
): HTMLButtonElement {
  const button = createNode(
    document,
    'button',
    'primary-button',
    kind === 'user' ? '创建用户' : '创建角色',
  );
  button.type = 'button';
  button.dataset.adminOpen = `create-${kind}`;
  return button;
}

/** Renders the management landing page with exactly two navigational cards. */
function landing(document: Document): HTMLElement {
  const section = createNode(document, 'section', 'admin-landing');
  for (const [label, href] of [
    ['用户管理', '#admin/users'],
    ['角色管理', '#admin/roles'],
  ] as const) {
    const card = createNode(document, 'article', 'admin-entry-card');
    const link = createNode(document, 'a', 'admin-entry-link', label);
    link.href = href;
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
  dialog.open = true;
  const kind = editor.kind;
  const record = editor.record;
  const title =
    editor.mode === 'create'
      ? kind === 'user'
        ? '创建用户'
        : '创建角色'
      : kind === 'user'
        ? '编辑用户'
        : '编辑角色';
  dialog.append(createNode(document, 'h2', undefined, title));
  const form = createNode(document, 'form', 'admin-form');
  form.dataset.adminForm = editor.mode === 'create' ? `create-${kind}` : kind;
  if (record) form.dataset.adminId = record.id;
  if (kind === 'user') {
    const user = record as AdminUserResource | undefined;
    form.append(
      field(document, '用户名称', 'name', user?.name ?? ''),
      roleSelect(
        document,
        overview.roles,
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
    const name = field(document, '角色名称', 'name', role?.name ?? '');
    if (role?.builtin)
      name.querySelector('input')?.setAttribute('readonly', '');
    form.append(
      name,
      permissionChecks(document, overview, role?.permissions ?? []),
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
  const intro = createNode(document, 'section', 'admin-intro');
  intro.append(
    createNode(document, 'p', 'eyebrow', '公会管理 / 管理'),
    createNode(
      document,
      'h1',
      undefined,
      section === 'overview'
        ? '管理用户与角色'
        : section === 'users'
          ? '用户管理'
          : '角色管理',
    ),
  );
  if (section === 'overview') {
    container.replaceChildren(intro, landing(document));
    return;
  }
  const sort = state.sort ?? defaultAdminSort(section);
  const records =
    section === 'users'
      ? sortAdminRecords('users', overview.users, sort)
      : sortAdminRecords('roles', overview.roles, sort);
  const child = createNode(document, 'section', 'admin-section');
  const back = createNode(document, 'a', 'admin-back-link', '返回管理首页');
  back.href = '#admin';
  child.append(
    back,
    sortControls(document, section, sort),
    createButton(document, section === 'users' ? 'user' : 'role'),
    desktopTable(document, section, records, sort),
  );
  const mobile = createNode(document, 'div', 'admin-mobile-list');
  for (const record of records)
    mobile.append(
      mobileCard(document, section === 'users' ? 'user' : 'role', record),
    );
  child.append(mobile);
  const children: HTMLElement[] = [intro, child];
  if (state.editor)
    children.push(editorDialog(document, overview, state.editor));
  container.replaceChildren(...children);
}
