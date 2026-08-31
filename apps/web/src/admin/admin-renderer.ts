/** Renders user and role management controls with textContent and safe DOM factories only. */
import type {
  AdminOverviewResource,
  AdminRoleResource,
  AdminUserResource,
  PermissionCode,
} from '../core/api-types.js';
import { createNode } from '../core/dom.js';

const DEFAULT_USER_ROLE_ID = 'role-user';

/** Creates one labeled input with a stable accessible name. */
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

/** Creates a role select for the single-role user binding contract. */
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

/** Creates the fixed permission checkbox group for a role form. */
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

/** Creates a delete or restore action based on one record's lifecycle state. */
function lifecycleButton(
  document: Document,
  kind: 'user' | 'role',
  record: AdminUserResource | AdminRoleResource,
): HTMLButtonElement | null {
  if ('builtin' in record && record.builtin) return null;
  const button = createNode(
    document,
    'button',
    'secondary-button admin-action',
    record.active ? '逻辑删除' : '恢复',
  );
  button.type = 'button';
  button.dataset.adminAction = record.active
    ? `delete-${kind}`
    : `restore-${kind}`;
  button.dataset.adminId = record.id;
  return button;
}

/** Creates one user row and its safe edit form. */
function userCard(
  document: Document,
  overview: AdminOverviewResource,
  user: AdminUserResource,
): HTMLElement {
  const card = createNode(document, 'article', 'admin-card');
  const header = createNode(document, 'div', 'admin-card-heading');
  header.append(
    createNode(document, 'div', 'admin-card-title', user.name),
    createNode(
      document,
      'span',
      `admin-status ${user.active ? 'is-active' : 'is-deleted'}`,
      user.active ? '活跃' : '已删除',
    ),
  );
  const form = createNode(document, 'form', 'admin-form');
  form.dataset.adminForm = 'user';
  form.dataset.adminId = user.id;
  form.append(
    field(document, '用户名称', 'name', user.name),
    roleSelect(document, overview.roles, user.roleId),
  );
  const actions = createNode(document, 'div', 'admin-form-actions');
  const save = createNode(document, 'button', 'primary-button', '保存用户');
  save.type = 'submit';
  actions.append(save);
  const lifecycle = lifecycleButton(document, 'user', user);
  if (lifecycle) actions.append(lifecycle);
  form.append(actions);
  card.append(
    header,
    createNode(
      document,
      'p',
      'admin-meta',
      `ID：${user.id} · 当前角色：${user.roleName}`,
    ),
    form,
  );
  return card;
}

/** Creates one role row and its safe permission-edit form. */
function roleCard(
  document: Document,
  overview: AdminOverviewResource,
  role: AdminRoleResource,
): HTMLElement {
  const card = createNode(document, 'article', 'admin-card');
  const header = createNode(document, 'div', 'admin-card-heading');
  header.append(
    createNode(document, 'div', 'admin-card-title', role.name),
    createNode(
      document,
      'span',
      `admin-status ${role.active ? 'is-active' : 'is-deleted'}`,
      role.builtin ? '内置角色' : role.active ? '自定义角色' : '已删除',
    ),
  );
  const form = createNode(document, 'form', 'admin-form');
  form.dataset.adminForm = 'role';
  form.dataset.adminId = role.id;
  const name = field(document, '角色名称', 'name', role.name);
  if (role.builtin) {
    const input = name.querySelector('input');
    if (input) input.readOnly = true;
  }
  form.append(name, permissionChecks(document, overview, role.permissions));
  const actions = createNode(document, 'div', 'admin-form-actions');
  const save = createNode(document, 'button', 'primary-button', '保存角色');
  save.type = 'submit';
  actions.append(save);
  const lifecycle = lifecycleButton(document, 'role', role);
  if (lifecycle) actions.append(lifecycle);
  form.append(actions);
  card.append(
    header,
    createNode(document, 'p', 'admin-meta', `代码：${role.code}`),
    form,
  );
  return card;
}

/** Renders both management areas and creation forms into the independent admin view. */
export function renderAdminView(
  document: Document,
  container: HTMLElement,
  overview: AdminOverviewResource,
): void {
  const heading = createNode(document, 'section', 'admin-intro');
  heading.append(
    createNode(document, 'p', 'eyebrow', '公会管理 / 管理'),
    createNode(document, 'h1', undefined, '管理用户与角色'),
    createNode(document, 'p', '调整角色权限，维护公会中的演示身份。'),
  );

  const userSection = createNode(document, 'section', 'admin-section');
  userSection.append(createNode(document, 'div', 'section-kicker', '用户管理'));
  const createUser = createNode(
    document,
    'form',
    'admin-form admin-create-form',
  );
  createUser.dataset.adminForm = 'create-user';
  createUser.append(
    field(document, '新用户名称', 'name', ''),
    roleSelect(
      document,
      overview.roles,
      overview.roles.find(
        (role) => role.active && role.id === DEFAULT_USER_ROLE_ID,
      )?.id ??
        overview.roles.find((role) => role.active)?.id ??
        '',
    ),
  );
  const createUserButton = createNode(
    document,
    'button',
    'primary-button',
    '创建用户',
  );
  createUserButton.type = 'submit';
  createUser.append(createUserButton);
  userSection.append(
    createUser,
    createNode(document, 'div', 'admin-grid', undefined),
  );
  const userGrid = userSection.lastElementChild as HTMLElement;
  userGrid.append(
    ...overview.users.map((user) => userCard(document, overview, user)),
  );

  const roleSection = createNode(document, 'section', 'admin-section');
  roleSection.append(createNode(document, 'div', 'section-kicker', '角色管理'));
  const createRole = createNode(
    document,
    'form',
    'admin-form admin-create-form',
  );
  createRole.dataset.adminForm = 'create-role';
  createRole.append(
    field(document, '新角色名称', 'name', ''),
    permissionChecks(document, overview, []),
  );
  const createRoleButton = createNode(
    document,
    'button',
    'primary-button',
    '创建角色',
  );
  createRoleButton.type = 'submit';
  createRole.append(createRoleButton);
  roleSection.append(
    createRole,
    createNode(document, 'div', 'admin-grid', undefined),
  );
  const roleGrid = roleSection.lastElementChild as HTMLElement;
  roleGrid.append(
    ...overview.roles.map((role) => roleCard(document, overview, role)),
  );

  container.replaceChildren(heading, userSection, roleSection);
}
