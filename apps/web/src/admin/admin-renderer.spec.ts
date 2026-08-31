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
  open = false;
  id = '';
  private ownTextContent = '';
  type = '';
  name = '';
  value = '';
  required = false;
  selected = false;
  checked = false;
  readOnly = false;

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
  }

  /** Replaces all child nodes while preserving the container instance. */
  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
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
    return new FakeElement(tagName);
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

  /** Ensures the landing route exposes exactly the two management entry points. */
  it('renders users and roles as the only landing cards with canonical hrefs', () => {
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

    const links = findAll(container, (element) => element.tagName === 'a');
    expect(links.map((link) => [link.textContent, link.href])).toEqual([
      ['用户管理', '#admin/users'],
      ['角色管理', '#admin/roles'],
    ]);
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
      },
    );

    const tables = findAll(container, (element) => element.tagName === 'table');
    const rows = findAll(tables[0]!, (element) => element.tagName === 'tr');
    expect(
      rows.slice(1).map((row) => row.querySelector('strong')?.textContent),
    ).toEqual(['甲用户', '乙用户']);
    const nameSort = findData(container, 'adminSort', 'name');
    expect(nameSort?.ariaSort).toBe('ascending');
    expect(
      findData(container, 'adminAction', 'restore-user')?.dataset.adminId,
    ).toBe('user-alpha');
    expect(
      findData(container, 'adminAction', 'delete-user')?.dataset.adminId,
    ).toBe('user-zeta');
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
      },
    );

    const metadata = findAll(
      container,
      (element) => element.className === 'admin-updated-at',
    ).map((element) => element.textContent);
    expect(metadata).toContain('修改时间：时间未知');
    expect(
      metadata.some((value) =>
        /^修改时间：2026-08-30 \d{2}:\d{2}$/.test(value),
      ),
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
    expect(findData(container, 'adminClose', 'dialog')).toBeDefined();
    const roleForm = findData(container, 'adminForm', 'role');
    expect(roleForm).toBeDefined();
    expect(roleForm?.querySelector('input')?.readOnly).toBe(true);
    expect(
      findAll(roleForm!, (element) => element.type === 'checkbox'),
    ).toHaveLength(1);

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
});
