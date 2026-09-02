/** Verifies task timeline comments render as safe, permission-aware drawer controls. */
import { describe, expect, it } from 'vitest';

import type { TaskResource } from '../core/api-types.js';
import { renderTaskDrawer } from './task-renderer.js';

class FakeNode {
  public parentNode: FakeElement | null = null;
  public children: FakeNode[] = [];
  private ownText = '';

  /** Replaces this fake node's text without interpreting markup. */
  set textContent(value: string) {
    this.ownText = value;
    this.children = [];
  }

  /** Returns this fake node's own and descendant text. */
  get textContent(): string {
    return (
      this.ownText + this.children.map((child) => child.textContent).join('')
    );
  }

  /** Appends fake nodes while preserving parent relationships. */
  append(...nodes: FakeNode[]): void {
    for (const node of nodes) {
      node.parentNode = this instanceof FakeElement ? this : null;
      this.children.push(node);
    }
  }
}

class FakeText extends FakeNode {
  /** Creates one inert fake text node. */
  constructor(value: string) {
    super();
    this.textContent = value;
  }
}

class FakeElement extends FakeNode {
  public className = '';
  public dataset: Record<string, string> = {};
  public style: Record<string, string> = {};
  public attributes: Record<string, string> = {};
  public id = '';
  public type = '';
  public value = '';
  public required = false;
  public maxLength = -1;
  public tabIndex = -1;

  /** Creates one fake HTML element by tag name. */
  constructor(public readonly tagName: string) {
    super();
  }

  /** Stores one attribute for renderer assertions. */
  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  /** Returns the last fake element child. */
  get lastElementChild(): FakeElement | null {
    const elements = this.children.filter(
      (child): child is FakeElement => child instanceof FakeElement,
    );
    return elements.at(-1) ?? null;
  }

  /** Replaces fake children exactly like the browser API used by renderers. */
  replaceChildren(...nodes: FakeNode[]): void {
    this.children = [];
    this.append(...nodes);
  }
}

class FakeDocument {
  /** Creates a fake element compatible with the safe node factory. */
  createElement(tag: string): FakeElement {
    return new FakeElement(tag);
  }

  /** Creates an inert fake text node. */
  createTextNode(value: string): FakeText {
    return new FakeText(value);
  }
}

/** Reads a repository file through Node 24 without widening the browser tsconfig types. */
function readFixture(url: URL): string {
  const runtime = globalThis as typeof globalThis & {
    process: {
      getBuiltinModule(name: 'fs'): {
        readFileSync(path: URL, encoding: 'utf8'): string;
      };
    };
  };
  return runtime.process.getBuiltinModule('fs').readFileSync(url, 'utf8');
}

/** Returns all descendant elements matching one predicate. */
function findAll(
  node: FakeNode,
  predicate: (element: FakeElement) => boolean,
): FakeElement[] {
  const matches: FakeElement[] = [];
  for (const child of node.children) {
    if (child instanceof FakeElement && predicate(child)) matches.push(child);
    matches.push(...findAll(child, predicate));
  }
  return matches;
}

/** Creates a complete comment-capable task resource fixture. */
function task(overrides: Partial<TaskResource> = {}): TaskResource {
  const publisher = {
    id: 'publisher',
    username: 'publisher-user',
    name: '发布者',
    role: 'user',
    roleLabel: '演示用户',
  };
  return {
    id: 'task-comments',
    title: '调查霜狼踪迹',
    type: 'exploration',
    typeLabel: '探索',
    description: '检查北境道路',
    reward: '20 金币',
    dueDate: '2026-09-10',
    publisher,
    assignee: null,
    status: 'not_started',
    statusLabel: '未开始',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    version: 3,
    timeline: [
      {
        kind: 'activity',
        sequence: 1,
        action: 'created',
        actionLabel: '创建任务',
        actor: publisher,
        at: '2026-09-01T08:00:00.000Z',
        detail: '任务发布至冒险家工会',
      },
      {
        kind: 'comment',
        sequence: 2,
        commentId: 'comment-live',
        actor: {
          id: 'commenter',
          username: 'commenter-user',
          name: '评论者',
          role: 'user',
          roleLabel: '演示用户',
        },
        at: '2026-09-01T09:00:00.000Z',
        content: '<img src=x onerror=alert(1)>\n第二行',
        deleted: false,
        deletedAt: null,
        deletedByUsername: null,
      },
      {
        kind: 'comment',
        sequence: 3,
        commentId: 'comment-deleted',
        actor: publisher,
        at: '2026-09-01T10:00:00.000Z',
        content: null,
        deleted: true,
        deletedAt: '2026-09-01T10:30:00.000Z',
        deletedByUsername: 'guild-admin',
      },
    ],
    ...overrides,
  };
}

/** Renders one task into the fake DOM and returns its drawer container. */
function render(
  value: TaskResource,
  actorId: string,
  permissions: readonly ('tasks.view' | 'system.manage')[],
  draft = '',
): FakeElement {
  const document = new FakeDocument();
  const container = new FakeElement('div');
  renderTaskDrawer(
    document as unknown as Document,
    container as unknown as HTMLElement,
    value,
    actorId,
    permissions,
    draft,
  );
  return container;
}

describe('task comment renderer', () => {
  /** Proves the existing drawer node order is preserved while the timeline section gains comments. */
  it('keeps the drawer top-level order and renders mixed timeline entries newest first', () => {
    const container = render(task(), 'commenter', ['tasks.view']);

    expect(
      container.children.map((child) =>
        child instanceof FakeElement ? child.className : '',
      ),
    ).toEqual([
      'drawer-header',
      'drawer-description',
      'detail-facts',
      'drawer-actions',
      'timeline-section',
    ]);
    const entries = findAll(container, (element) => element.tagName === 'li');
    expect(entries.map((entry) => entry.textContent)).toEqual([
      expect.stringContaining('该评论已被@guild-admin删除'),
      expect.stringContaining('<img src=x onerror=alert(1)>\n第二行'),
      expect.stringContaining('创建任务'),
    ]);
    expect(container.textContent).not.toContain('undefined');
  });

  /** Proves deleted comments expose only the exact tombstone and never original content. */
  it('renders deleted comments without their original content', () => {
    const deleted = task({
      timeline: [
        {
          kind: 'comment',
          sequence: 1,
          commentId: 'comment-secret',
          actor: task().publisher,
          at: '2026-09-01T09:00:00.000Z',
          content: '绝不能出现的原评论',
          deleted: true,
          deletedAt: '2026-09-01T10:00:00.000Z',
          deletedByUsername: 'moderator',
        },
      ],
    });

    const container = render(deleted, 'publisher', ['tasks.view']);

    expect(container.textContent).toContain('该评论已被@moderator删除');
    expect(container.textContent).not.toContain('绝不能出现的原评论');
  });

  /** Proves eligible viewers receive a constrained multiline form with their in-memory draft. */
  it('renders the required 1000-character comment form for an open visible task', () => {
    const container = render(task(), 'commenter', ['tasks.view'], '保留\n草稿');
    const forms = findAll(
      container,
      (element) => element.dataset.commentForm === 'task-comments',
    );
    const textareas = findAll(
      container,
      (element) => element.tagName === 'textarea',
    );

    expect(forms).toHaveLength(1);
    expect(textareas).toHaveLength(1);
    expect(textareas[0]).toMatchObject({
      required: true,
      maxLength: 1000,
      value: '保留\n草稿',
    });
  });

  /** Proves closed tasks and actors without tasks.view never receive a comment form. */
  it.each([
    [task({ status: 'closed', statusLabel: '关闭' }), ['tasks.view'] as const],
    [task(), [] as const],
  ])(
    'hides the comment form when commenting is unavailable',
    (value, permissions) => {
      const container = render(value, 'commenter', permissions);

      expect(
        findAll(container, (element) => Boolean(element.dataset.commentForm)),
      ).toEqual([]);
    },
  );

  /** Proves only the author or a manager can delete an undeleted comment. */
  it.each([
    ['commenter', ['tasks.view'] as const, 1],
    ['manager', ['tasks.view', 'system.manage'] as const, 1],
    ['publisher', ['tasks.view'] as const, 0],
  ])(
    'renders delete controls according to comment ownership',
    (actorId, permissions, count) => {
      const container = render(task(), actorId, permissions);

      expect(
        findAll(container, (element) =>
          Boolean(element.dataset.deleteCommentId),
        ),
      ).toHaveLength(count);
    },
  );

  /** Proves multiline user content wraps safely without introducing a new color literal. */
  it('uses the required safe wrapping rules for comment content', () => {
    const css = readFixture(new URL('../../../../styles.css', import.meta.url));
    const rule = css.match(/\.comment-content\s*\{(?<body>[^}]*)\}/)?.groups
      ?.body;

    expect(rule).toContain('white-space: pre-wrap');
    expect(rule).toContain('overflow-wrap: anywhere');
    expect(rule).not.toMatch(/#[0-9a-f]{3,8}|rgb\(|hsl\(/i);
  });
});
