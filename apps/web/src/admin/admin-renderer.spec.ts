/** Verifies safe defaults in the user and role management renderer. */
import { describe, expect, it } from 'vitest';

import type { AdminOverviewResource } from '../core/api-types.js';
import { renderAdminView } from './admin-renderer.js';

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly tagName: string;
  className = '';
  href = '';
  ariaSort = '';
  ariaModal = '';
  ariaLabelledBy = '';
  open = false;
  id = '';
  private ownTextContent = '';
  type = '';
  name = '';
  value = '';
  placeholder = '';
  required = false;
  selected = false;
  checked = false;
  readOnly = false;
  disabled = false;
  modal = false;
  showModalCalled = false;
  showModalConnected = false;
  isConnected = false;

  /** Returns the final child using the browser DOM's null-on-empty contract. */
  get lastElementChild(): FakeElement | null {
    return this.children.at(-1) ?? null;
  }

  /** Creates the minimal DOM node surface exercised by the renderer. */
  constructor(tagName: string) {
    this.tagName = tagName;
  }

  /** Appends child nodes in the same order as the browser DOM. */
  append(...children: FakeElement[]): void {
    this.children.push(...children);
    if (this.isConnected) children.forEach((child) => child.connectTree());
  }

  /** Mirrors browser textContent reads across descendant nodes for assertions. */
  get textContent(): string {
    return (
      this.ownTextContent ||
      this.children.map((child) => child.textContent).join('')
    );
  }

  /** Mirrors browser textContent writes for the small fake DOM surface. */
  set textContent(value: string) {
    this.ownTextContent = value;
  }

  /** Supports the readonly attribute used by the editor contract. */
  setAttribute(name: string, value: string): void {
    if (name === 'readonly') this.readOnly = true;
    if (name === 'aria-sort') this.ariaSort = value;
    if (name === 'aria-labelledby') this.ariaLabelledBy = value;
  }

  /** Opens the fake dialog as a modal while preserving the browser dialog contract. */
  showModal(): void {
    if (!this.isConnected) throw new Error('Dialog must be connected');
    this.showModalCalled = true;
    this.showModalConnected = this.isConnected;
    this.modal = true;
    this.open = true;
  }

  /** Closes the fake dialog and clears its modal state. */
  close(): void {
    this.modal = false;
    this.open = false;
  }

  /** Replaces all child nodes while preserving the container instance. */
  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
    if (this.isConnected) children.forEach((child) => child.connectTree());
  }

  /** Marks this fake node and all descendants as connected to the fake document. */
  private connectTree(): void {
    this.isConnected = true;
    this.children.forEach((child) => child.connectTree());
  }

  /** Finds the first descendant with the requested simple tag selector. */
  querySelector(selector: string): FakeElement | null {
    for (const child of this.children) {
      if (child.tagName === selector) return child;
      const descendant = child.querySelector(selector);
      if (descendant) return descendant;
    }
    return null;
  }
}

class FakeDocument {
  /** Creates a fake node accepted by the renderer's DOM factory calls. */
  createElement(tagName: string): FakeElement {
    const element = new FakeElement(tagName);
    element.isConnected = tagName === 'main';
    return element;
  }
}

const overview: AdminOverviewResource = {
  users: [
    {
      id: 'user-zeta',
      name: '乙用户',
      roleId: 'role-user',
      roleCode: 'user',
      roleName: '用户',
      active: true,
      deletedAt: null,
      updatedAt: '2026-08-30T09:00:00.000Z',
    },
    {
      id: 'user-alpha',
      name: '甲用户',
      roleId: 'role-user',
      roleCode: 'user',
      roleName: '用户',
      active: false,
      deletedAt: '2026-08-29T09:00:00.000Z',
      updatedAt: 'not-a-date',
    },
  ],
  roles: [
    {
      id: 'role-custom-first',
      code: 'custom_first',
      name: '先排序的自定义角色',
      builtin: false,
      permissions: [],
      active: true,
      deletedAt: null,
      updatedAt: '2026-08-30T09:00:00.000Z',
    },
    {
      id: 'role-user',
      code: 'user',
      name: '用户',
      builtin: true,
      permissions: ['tasks.view'],
      active: true,
      deletedAt: null,
      updatedAt: '2026-08-30T09:00:00.000Z',
    },
  ],
  permissions: [
    {
      code: 'tasks.view',
      name: '查看任务',
      description: '查看任务列表与详情',
    },
  ],
};

/** Collects fake descendants by tag or class without relying on browser selectors. */
function findAll(
  root: FakeElement,
  predicate: (element: FakeElement) => boolean,
): FakeElement[] {
  return root.children.flatMap((child) => [
    ...(predicate(child) ? [child] : []),
    ...findAll(child, predicate),
  ]);
}

/** Finds a fake element by its stable data-admin attribute. */
function findData(
  root: FakeElement,
  key: string,
  value: string,
): FakeElement | undefined {
  return findAll(root, (element) => element.dataset[key] === value)[0];
}

describe('admin renderer', () => {
  /** Ensures the create-user editor explicitly selects the standard user role. */
  it('defaults new users to role-user instead of the first active role', () => {
    const document = new FakeDocument();
    const container = document.createElement('main');

    renderAdminView(
      document as unknown as Document,
      container as unknown as HTMLElement,
      overview,
      { section: 'users', editor: { kind: 'user', mode: 'create' } },
    );

    const createUserForm = findData(container, 'adminForm', 'create-user');
    expect(createUserForm).toBeDefined();
    const roleField = createUserForm!.children[1]!;
    const roleSelect = roleField.children[1]!;
    const selectedRole = roleSelect.children.find((option) => option.selected);

    expect(selectedRole?.value).toBe('role-user');
  });

  /** Ensures the landing route presents the compact hierarchy and complete management entry content. */
  it('renders the management introduction and complete linked entry cards', () => {
    const document = new FakeDocument();
    const container = document.createElement('main');

    renderAdminView(
      document as unknown as Document,
      container as unknown as HTMLElement,
      overview,
      {
        section: 'overview',
      },
    );

    const intro = findAll(container, (element) =>
      element.className.split(' ').includes('admin-intro'),
    )[0]!;
    expect(intro.children.map((child) => child.textContent)).toEqual([
      'ADMINISTRATION',
      '管理',
      '用户、角色与权限配置',
    ]);

    const links = findAll(
      container,
      (element) => element.className === 'admin-entry-link',
    );
    expect(links.map((link) => [link.textContent, link.href])).toEqual([
      [
        '01用户管理管理系统用户、账户状态与角色分配用户列表账户状态角色分配↗',
        '#admin/users',
      ],
      [
        '02角色管理维护系统角色及其权限范围角色列表权限配置角色成员↗',
        '#admin/roles',
      ],
    ]);
    expect(
      findAll(container, (element) => element.tagName === 'article').map(
        (card) => card.children[0]?.tagName,
      ),
    ).toEqual(['a', 'a']);
  });

  /** Ensures desktop tables expose ordered records and semantic sortable headers. */
  it('renders a sorted desktop users table with sortable headers and lifecycle actions', () => {
    const document = new FakeDocument();
    const container = document.createElement('main');

    renderAdminView(
      document as unknown as Document,
      container as unknown as HTMLElement,
      overview,
      {
        section: 'users',
        sort: { field: 'name', direction: 'asc' },
        userStatus: 'all',
      },
    );

    const tables = findAll(container, (element) => element.tagName === 'table');
    const rows = findAll(tables[0]!, (element) => element.tagName === 'tr');
    expect(
      rows.slice(1).map((row) => row.querySelector('strong')?.textContent),
    ).toEqual(['甲用户', '乙用户']);
    const nameSort = findData(container, 'adminSort', 'name');
    expect(nameSort?.ariaSort).toBe('');
    expect(
      findAll(
        findAll(container, (element) => element.tagName === 'table')[0]!,
        (element) => element.tagName === 'th',
      )[0]?.ariaSort,
    ).toBe('ascending');
    expect(
      findData(container, 'adminAction', 'restore-user')?.dataset.adminId,
    ).toBe('user-alpha');
    expect(
      findData(container, 'adminAction', 'delete-user')?.dataset.adminId,
    ).toBe('user-zeta');
    const edit = findData(container, 'adminOpen', 'user');
    expect(edit?.dataset.adminId).toBe('user-alpha');
    expect(edit?.dataset.adminAction).toBeUndefined();
    expect(findData(container, 'adminOpen', 'create-user')).toBeDefined();
    expect(findData(container, 'adminDirection', 'asc')).toBeUndefined();
  });

  /** Ensures the normal user list excludes deleted accounts while preserving an explicit recovery view. */
  it('hides deleted users by default and reveals them only through the deleted status filter', () => {
    const document = new FakeDocument();
    const container = document.createElement('main');

    renderAdminView(
      document as unknown as Document,
      container as unknown as HTMLElement,
      overview,
      { section: 'users' },
    );

    const defaultTable = findAll(
      container,
      (element) => element.tagName === 'table',
    )[0]!;
    expect(
      findAll(defaultTable, (element) => element.tagName === 'tr')
        .slice(1)
        .map((row) => row.querySelector('strong')?.textContent),
    ).toEqual(['乙用户']);

    renderAdminView(
      document as unknown as Document,
      container as unknown as HTMLElement,
      overview,
      { section: 'users', userStatus: 'deleted' },
    );

    const deletedTable = findAll(
      container,
      (element) => element.tagName === 'table',
    )[0]!;
    expect(
      findAll(deletedTable, (element) => element.tagName === 'tr')
        .slice(1)
        .map((row) => row.querySelector('strong')?.textContent),
    ).toEqual(['甲用户']);
    expect(findData(container, 'adminAction', 'restore-user')).toBeDefined();
  });

  /** Ensures user search and role filtering operate over the complete administrator snapshot. */
  it('filters users by trimmed case-insensitive name and role selections', () => {
    const document = new FakeDocument();
    const container = document.createElement('main');

    renderAdminView(
      document as unknown as Document,
      container as unknown as HTMLElement,
      {
        ...overview,
        users: [
          ...overview.users,
          {
            ...overview.users[0]!,
            id: 'user-admin',
            name: 'Alpha Admin',
            roleId: 'role-admin',
            roleCode: 'admin',
            roleName: '管理员',
          },
        ],
      },
      {
        section: 'users',
        userQuery: '  ALPHA ',
        userRole: 'role-admin',
      },
    );

    const table = findAll(
      container,
      (element) => element.tagName === 'table',
    )[0]!;
    expect(
      findAll(table, (element) => element.tagName === 'tr')
        .slice(1)
        .map((row) => row.querySelector('strong')?.textContent),
    ).toEqual(['Alpha Admin']);
  });

  /** Ensures the redesigned user header, summary, toolbar, and compact row vocabulary are exposed. */
  it('renders the compact user management hierarchy and accessible toolbar', () => {
    const document = new FakeDocument();
    const container = document.createElement('main');

    renderAdminView(
      document as unknown as Document,
      container as unknown as HTMLElement,
      overview,
      { section: 'users' },
    );

    const intro = findAll(
      container,
      (element) => element.className === 'admin-user-header',
    )[0]!;
    expect(intro.textContent).toBe(
      '管理/用户管理用户管理管理系统中的用户账号、角色与账号状态+ 创建用户',
    );
    expect(
      findAll(
        container,
        (element) => element.className === 'admin-user-summary',
      )[0]?.textContent,
    ).toBe('2 个用户 · 1 个活跃 · 1 个已删除');
    const search = findData(container, 'adminUserQuery', 'true');
    expect(search?.placeholder).toBe('搜索用户…');
    expect(findData(container, 'adminUserRole', 'true')).toBeDefined();
    expect(findData(container, 'adminUserStatus', 'true')).toBeDefined();
    expect(findData(container, 'adminDirection', 'desc')).toBeUndefined();

    const table = findAll(
      container,
      (element) => element.tagName === 'table',
    )[0]!;
    const rows = findAll(table, (element) => element.tagName === 'tr');
    expect(rows[0]!.children.map((cell) => cell.textContent)).toEqual([
      '用户',
      '角色',
      '状态',
      '最近修改⌄',
      '操作',
    ]);
    expect(rows[1]!.children.map((cell) => cell.textContent)).toEqual([
      '乙用户',
      '用户',
      '●活跃',
      expect.stringMatching(/^2026-08-30 \d{2}:\d{2}$/),
      '编辑•••编辑删除',
    ]);
  });

  /** Ensures every desktop user column has a matching cell in the same semantic order. */
  it('aligns user table headers and row cells', () => {
    const document = new FakeDocument();
    const container = document.createElement('main');

    renderAdminView(
      document as unknown as Document,
      container as unknown as HTMLElement,
      overview,
      {
        section: 'users',
        sort: { field: 'name', direction: 'asc' },
        userStatus: 'all',
      },
    );

    const table = findAll(
      container,
      (element) => element.tagName === 'table',
    )[0]!;
    const rows = findAll(table, (element) => element.tagName === 'tr');
    expect(rows[0]!.children.map((cell) => cell.textContent)).toEqual([
      '用户⌃',
      '角色',
      '状态',
      '最近修改',
      '操作',
    ]);
    expect(rows[1]!.children).toHaveLength(5);
    expect(rows[1]!.children.map((cell) => cell.textContent)).toEqual([
      '甲用户',
      '用户',
      '○已删除',
      '时间未知',
      '编辑•••编辑恢复',
    ]);
  });

  /** Ensures every desktop role column has a matching cell in the same semantic order. */
  it('aligns role table headers and row cells', () => {
    const document = new FakeDocument();
    const container = document.createElement('main');

    renderAdminView(
      document as unknown as Document,
      container as unknown as HTMLElement,
      overview,
      { section: 'roles', sort: { field: 'name', direction: 'asc' } },
    );

    const table = findAll(
      container,
      (element) => element.tagName === 'table',
    )[0]!;
    const rows = findAll(table, (element) => element.tagName === 'tr');
    expect(rows[0]!.children.map((cell) => cell.textContent)).toEqual([
      '名称',
      '代码',
      '权限数',
      '状态',
      '最近修改',
      '操作',
    ]);
    expect(rows[1]!.children).toHaveLength(6);
    expect(rows[1]!.children.map((cell) => cell.textContent)).toEqual([
      '先排序的自定义角色',
      'custom_first',
      '0',
      '自定义角色',
      '修改时间：2026-08-30 17:00',
      '编辑逻辑删除',
    ]);
  });

  /** Ensures sortable state belongs to each table column header rather than its action button. */
  it('exposes sort direction on sortable table headers', () => {
    const document = new FakeDocument();
    const container = document.createElement('main');

    renderAdminView(
      document as unknown as Document,
      container as unknown as HTMLElement,
      overview,
      { section: 'users', sort: { field: 'role', direction: 'desc' } },
    );

    const table = findAll(
      container,
      (element) => element.tagName === 'table',
    )[0]!;
    const headers = findAll(table, (element) => element.tagName === 'th');
    expect(headers.map((header) => header.ariaSort)).toEqual([
      'none',
      'descending',
      'none',
      'none',
      '',
    ]);
    expect(findData(container, 'adminSort', 'role')?.ariaSort).toBe('');
    const indicators = findAll(
      table,
      (element) => element.dataset.adminSortIndicator !== undefined,
    );
    expect(indicators.map((indicator) => indicator.textContent)).toEqual(['⌄']);
    expect(findData(container, 'adminSortIndicator', 'role')?.className).toBe(
      'admin-sort-indicator',
    );
  });

  /** Keeps all user sort fields reachable after the desktop-only toolbar sort is removed. */
  it('renders a compact mobile sort header for every user information field', () => {
    const document = new FakeDocument();
    const container = document.createElement('main');

    renderAdminView(
      document as unknown as Document,
      container as unknown as HTMLElement,
      overview,
      { section: 'users', sort: { field: 'updatedAt', direction: 'asc' } },
    );

    const mobileHeader = findAll(
      container,
      (element) => element.className === 'admin-user-mobile-sort',
    )[0]!;
    expect(
      findAll(
        mobileHeader,
        (element) => element.dataset.adminSort !== undefined,
      ).map((button) => button.dataset.adminSort),
    ).toEqual(['name', 'role', 'status', 'updatedAt']);
    expect(
      findAll(
        mobileHeader,
        (element) => element.dataset.adminSortIndicator !== undefined,
      ).map((indicator) => [
        indicator.dataset.adminSortIndicator,
        indicator.textContent,
      ]),
    ).toEqual([['updatedAt', '⌃']]);
  });

  /** Ensures mobile markup has a separate card list and a delegated sort control. */
  it('renders mobile cards with a fixed sort bar and direction control', () => {
    const document = new FakeDocument();
    const container = document.createElement('main');

    renderAdminView(
      document as unknown as Document,
      container as unknown as HTMLElement,
      overview,
      {
        section: 'roles',
        sort: { field: 'updatedAt', direction: 'desc' },
      },
    );

    expect(
      findAll(
        container,
        (element) => element.className === 'admin-mobile-list',
      ),
    ).toHaveLength(1);
    expect(findData(container, 'adminSortSelect', 'roles')?.name).toBe('sort');
    expect(findData(container, 'adminDirection', 'desc')?.textContent).toBe(
      '降序',
    );
  });

  /** Ensures mobile cards retain the lifecycle or built-in status from desktop rows. */
  it('includes record status in mobile cards', () => {
    const document = new FakeDocument();
    const userContainer = document.createElement('main');

    renderAdminView(
      document as unknown as Document,
      userContainer as unknown as HTMLElement,
      overview,
      { section: 'users', userStatus: 'all' },
    );

    const userList = findAll(
      userContainer,
      (element) => element.className === 'admin-mobile-list',
    )[0]!;
    const userStatuses = findAll(userList, (element) =>
      element.className.split(' ').includes('admin-user-status'),
    ).map((element) => element.textContent);
    expect(userStatuses).toHaveLength(2);
    expect(userStatuses).toEqual(expect.arrayContaining(['●活跃', '○已删除']));

    const roleContainer = document.createElement('main');
    renderAdminView(
      document as unknown as Document,
      roleContainer as unknown as HTMLElement,
      overview,
      { section: 'roles' },
    );
    const roleList = findAll(
      roleContainer,
      (element) => element.className === 'admin-mobile-list',
    )[0]!;
    const roleStatuses = findAll(
      roleList,
      (element) => element.className === 'admin-status',
    ).map((element) => element.textContent);
    expect(roleStatuses).toHaveLength(2);
    expect(roleStatuses).toEqual(
      expect.arrayContaining(['自定义角色', '内置角色']),
    );
  });

  /** Ensures date formatting is local and malformed API values never become unsafe markup. */
  it('formats valid updatedAt values and uses a safe placeholder for invalid dates', () => {
    const document = new FakeDocument();
    const container = document.createElement('main');

    renderAdminView(
      document as unknown as Document,
      container as unknown as HTMLElement,
      overview,
      {
        section: 'users',
        userStatus: 'all',
      },
    );

    const metadata = findAll(
      container,
      (element) => element.className === 'admin-updated-at',
    ).map((element) => element.textContent);
    expect(metadata).toContain('时间未知');
    expect(
      metadata.some((value) => /^2026-08-30 \d{2}:\d{2}$/.test(value)),
    ).toBe(true);
  });

  /** Ensures editor dialogs preserve delegated form names and special role/user behavior. */
  it('renders create and edit dialog forms only when an editor is supplied', () => {
    const document = new FakeDocument();
    const container = document.createElement('main');

    renderAdminView(
      document as unknown as Document,
      container as unknown as HTMLElement,
      overview,
      {
        section: 'roles',
        editor: { kind: 'role', mode: 'edit', record: overview.roles[1]! },
      },
    );

    const dialog = findAll(
      container,
      (element) => element.tagName === 'dialog',
    )[0];
    expect(dialog?.open).toBe(true);
    expect(dialog?.modal).toBe(true);
    expect(dialog?.showModalCalled).toBe(true);
    expect(dialog?.showModalConnected).toBe(true);
    expect(dialog?.ariaModal).toBe('');
    expect(dialog?.ariaLabelledBy).toBe('admin-editor-title');
    expect(findData(container, 'adminClose', 'dialog')).toBeDefined();
    const roleForm = findData(container, 'adminForm', 'role');
    expect(roleForm).toBeDefined();
    expect(roleForm?.querySelector('input')?.readOnly).toBe(true);
    expect(
      findAll(roleForm!, (element) => element.type === 'checkbox'),
    ).toHaveLength(1);

    const builtinSave = findAll(
      roleForm!,
      (element) => element.type === 'submit',
    )[0];
    expect(builtinSave?.disabled).toBe(false);
    expect(
      findAll(roleForm!, (element) => element.type === 'checkbox')[0]?.disabled,
    ).toBe(false);

    const regularRoleContainer = document.createElement('main');
    renderAdminView(
      document as unknown as Document,
      regularRoleContainer as unknown as HTMLElement,
      overview,
      {
        section: 'roles',
        editor: {
          kind: 'role',
          mode: 'edit',
          record: overview.roles[0]!,
        },
      },
    );
    const regularRoleForm = findData(regularRoleContainer, 'adminForm', 'role');
    expect(
      findAll(regularRoleForm!, (element) => element.type === 'submit')[0]
        ?.disabled,
    ).toBe(false);

    const noEditor = document.createElement('main');
    renderAdminView(
      document as unknown as Document,
      noEditor as unknown as HTMLElement,
      overview,
      {
        section: 'users',
      },
    );
    expect(
      findAll(noEditor, (element) => element.tagName === 'dialog'),
    ).toHaveLength(0);
  });

  /** Ensures a failed-submit draft takes precedence over the server record when reopening a role editor. */
  it('renders preserved role draft values', () => {
    const document = new FakeDocument();
    const container = document.createElement('main');
    const editor = {
      kind: 'role',
      mode: 'edit',
      record: overview.roles[0]!,
      draft: {
        name: '草稿角色名称',
        permissions: ['tasks.view'] as const,
      },
    } as never;

    renderAdminView(
      document as unknown as Document,
      container as unknown as HTMLElement,
      overview,
      { section: 'roles', editor },
    );

    const roleForm = findData(container, 'adminForm', 'role');
    const inputs = findAll(roleForm!, (element) => element.tagName === 'input');
    expect(inputs[0]?.value).toBe('草稿角色名称');
    expect(
      findAll(roleForm!, (element) => element.type === 'checkbox')[0]?.checked,
    ).toBe(true);
  });

  /** Ensures the rendered modal can be closed through the native dialog contract. */
  it('closes an editor dialog through the native close contract', () => {
    const document = new FakeDocument();
    const container = document.createElement('main');

    renderAdminView(
      document as unknown as Document,
      container as unknown as HTMLElement,
      overview,
      { section: 'users', editor: { kind: 'user', mode: 'create' } },
    );

    const dialog = findAll(
      container,
      (element) => element.tagName === 'dialog',
    )[0]!;
    dialog.close();

    expect(dialog.open).toBe(false);
    expect(dialog.modal).toBe(false);
  });
});
