/** Verifies expired-task renewal controls in the safe task detail renderer. */
import { describe, expect, it } from 'vitest';

import type { TaskResource } from '../core/api-types.js';
import { renderTaskDrawer } from './task-renderer.js';

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  className = '';
  id = '';
  tabIndex = 0;
  type = '';
  textContent = '';

  /** Appends fake child nodes in source order. */
  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  /** Replaces all fake descendants for renderer assertions. */
  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  /** Records only attributes whose values renderer tests need to observe. */
  setAttribute(name: string, value: string): void {
    if (name.startsWith('aria-')) this.dataset[name] = value;
  }

  /** Returns the final fake element using the browser null-on-empty contract. */
  get lastElementChild(): FakeElement | null {
    return this.children.at(-1) ?? null;
  }

  /** Finds all descendants matching a renewal data selector. */
  findRenewalButtons(): FakeElement[] {
    return [
      ...(this.dataset.renewExpired === '' ? [this] : []),
      ...this.children.flatMap((child) => child.findRenewalButtons()),
    ];
  }
}

class FakeDocument {
  /** Creates the minimal element surface used by the task renderer. */
  createElement(): FakeElement {
    return new FakeElement();
  }

  /** Creates a text-only fake node compatible with safe append calls. */
  createTextNode(value: string): FakeElement {
    const node = new FakeElement();
    node.textContent = value;
    return node;
  }
}

const EXPIRED_TASK: TaskResource = {
  id: 'task-expired-renderer',
  title: '失效任务',
  type: 'exploration',
  typeLabel: '探索',
  description: '验证续期入口',
  reward: '10 金币',
  dueDate: '2026-09-01',
  publisher: {
    id: 'noticeboard-master',
    name: '用户 A',
    role: 'user',
    roleLabel: '用户',
  },
  assignee: null,
  workflowStatus: 'in_progress',
  workflowStatusLabel: '进行中',
  status: 'expired',
  statusLabel: '已失效',
  createdAt: '2026-08-30T09:00:00.000Z',
  updatedAt: '2026-08-30T09:00:00.000Z',
  version: 2,
  timeline: [],
};

describe('task detail renderer', () => {
  it('renders the renewal control only for the authorized publisher', () => {
    const document = new FakeDocument();
    const publisherContainer = new FakeElement();
    const otherContainer = new FakeElement();

    renderTaskDrawer(
      document as unknown as Document,
      publisherContainer as unknown as HTMLElement,
      EXPIRED_TASK,
      'noticeboard-master',
      ['tasks.view', 'tasks.review'],
    );
    renderTaskDrawer(
      document as unknown as Document,
      otherContainer as unknown as HTMLElement,
      EXPIRED_TASK,
      'adventurer-a',
      ['tasks.view', 'tasks.review'],
    );

    expect(publisherContainer.findRenewalButtons()).toHaveLength(1);
    expect(otherContainer.findRenewalButtons()).toHaveLength(0);
  });
});
