/** Verifies safe defaults in the user and role management renderer. */
import { describe, expect, it } from 'vitest';

import type { AdminOverviewResource } from '../core/api-types.js';
import { renderAdminView } from './admin-renderer.js';

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly tagName: string;
  className = '';
  textContent = '';
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
  users: [],
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

describe('admin renderer', () => {
  /** Ensures the new-user form explicitly selects the standard user role. */
  it('defaults new users to role-user instead of the first active role', () => {
    const document = new FakeDocument();
    const container = document.createElement('main');

    renderAdminView(
      document as unknown as Document,
      container as unknown as HTMLElement,
      overview,
    );

    const userSection = container.children[1]!;
    const createUserForm = userSection.children[1]!;
    const roleField = createUserForm.children[1]!;
    const roleSelect = roleField.children[1]!;
    const selectedRole = roleSelect.children.find((option) => option.selected);

    expect(selectedRole?.value).toBe('role-user');
  });
});
