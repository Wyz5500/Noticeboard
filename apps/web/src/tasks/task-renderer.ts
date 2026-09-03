/** Renders task cards, details, timelines, and action controls using safe DOM node creation. */
import type {
  PermissionCode,
  TaskAction,
  TaskResource,
} from '../core/api-types.js';
import { createNode, createTextAreaNode } from '../core/dom.js';
import { availableActions, canRenewExpiredTask } from './task-permissions.js';

const ACTION_LABELS: Record<TaskAction, string> = {
  accept: '接取任务',
  complete: '标记为已完成',
  approve: '验收通过并关闭',
  reopen: '验收不通过，重新打开',
  close: '直接关闭任务',
};

export interface CommentEditorState {
  actorId: string;
  taskId: string;
  commentId: string;
  draft: string;
}

/** Formats an ISO timestamp using the same compact Chinese date language as the prototype. */
function formatDate(value: string, includeTime: boolean): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  const datePart = new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
  }).format(date);
  if (!includeTime) return datePart;
  const time = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return `${datePart} ${time}`;
}

/** Formats a date-only deadline without timezone drift. */
function formatDueDate(value: string): string {
  return formatDate(`${value}T12:00:00`, false);
}

/** Creates a labeled metadata pair used in task cards. */
function cardMeta(
  document: Document,
  label: string,
  value: string,
): HTMLSpanElement {
  const container = createNode(document, 'span', undefined, label);
  container.append(createNode(document, 'strong', undefined, value));
  return container;
}

/** Creates one keyboard-accessible task card with only text-node content. */
export function renderTaskCard(
  document: Document,
  task: TaskResource,
): HTMLElement {
  const card = createNode(document, 'article', 'task-card');
  card.dataset.taskId = task.id;
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `查看任务：${task.title}`);

  const top = createNode(document, 'div', 'task-card-top');
  top.append(
    createNode(document, 'span', 'task-type', `${task.typeLabel} / 任务`),
    createNode(
      document,
      'span',
      `status-badge status-${task.statusLabel}`,
      task.statusLabel,
    ),
  );
  const footer = createNode(document, 'div', 'task-card-footer');
  const metadata = createNode(document, 'div', 'task-card-meta');
  metadata.append(
    cardMeta(document, '发布者', task.publisher.name),
    cardMeta(document, '截止', formatDueDate(task.dueDate)),
    cardMeta(document, '接取者', task.assignee?.name ?? '未接取'),
  );
  footer.append(metadata, createNode(document, 'span', 'task-card-arrow', '↗'));
  footer.lastElementChild?.setAttribute('aria-hidden', 'true');
  card.append(
    top,
    createNode(document, 'h3', undefined, task.title),
    createNode(document, 'p', 'task-summary', task.description),
    footer,
  );
  return card;
}

/** Renders task cards or the preserved contextual empty state. */
export function renderTaskGrid(
  document: Document,
  container: HTMLElement,
  tasks: TaskResource[],
  scope: 'all' | 'mine',
): void {
  if (tasks.length) {
    container.replaceChildren(
      ...tasks.map((task) => renderTaskCard(document, task)),
    );
    return;
  }
  const empty = createNode(document, 'div', 'empty-state');
  empty.append(
    createNode(document, 'strong', undefined, '这里暂时没有任务'),
    createNode(
      document,
      'p',
      undefined,
      scope === 'mine'
        ? '当前身份还没有符合条件的任务。'
        : '换一个筛选条件，或发布一项新的冒险委托。',
    ),
  );
  container.replaceChildren(empty);
}

/** Creates one task detail fact block. */
function detailFact(
  document: Document,
  label: string,
  value: string,
  wide = false,
): HTMLDivElement {
  const fact = createNode(document, 'div', 'detail-fact');
  if (wide) fact.style.gridColumn = '1 / -1';
  fact.append(
    createNode(document, 'span', undefined, label),
    createNode(document, 'strong', undefined, value),
  );
  return fact;
}

/** Creates action buttons for the current actor without bypassing server-side authorization. */
function actionControls(
  document: Document,
  task: TaskResource,
  actorId: string,
  permissions?: readonly PermissionCode[],
): HTMLElement {
  const container = createNode(document, 'div', 'drawer-actions');
  if (canRenewExpiredTask(task, actorId, permissions)) {
    const button = createNode(
      document,
      'button',
      'primary-button',
      '续期并重新打开',
    );
    button.type = 'button';
    button.dataset.renewExpired = '';
    container.append(button);
    return container;
  }
  const actions = availableActions(task, actorId, permissions);
  if (!actions.length) {
    container.append(
      createNode(
        document,
        'p',
        'drawer-hint',
        task.status === 'expired'
          ? '任务已失效，仅任务发布者可以设置新截止日期后重新打开。'
          : '当前身份在此任务状态下暂无可执行操作。',
      ),
    );
    return container;
  }
  for (const action of actions) {
    const primary =
      action === 'accept' || action === 'complete' || action === 'approve';
    const label =
      action === 'accept' && task.status === 'reopened'
        ? '重新接取任务'
        : ACTION_LABELS[action];
    const button = createNode(
      document,
      'button',
      primary ? 'primary-button' : 'secondary-button',
      label,
    );
    button.type = 'button';
    button.dataset.action = action;
    if (primary)
      button.append(
        document.createTextNode(' '),
        createNode(document, 'span', undefined, '↗'),
      );
    container.append(button);
  }
  return container;
}

/** Creates one activity entry in the reverse-chronological task timeline. */
function activityEntry(
  document: Document,
  event: Extract<TaskResource['timeline'][number], { kind: 'activity' }>,
): HTMLLIElement {
  const item = createNode(document, 'li', 'timeline-activity');
  item.append(
    createNode(document, 'span', 'timeline-action', event.actionLabel),
    createNode(
      document,
      'span',
      'timeline-meta',
      `${event.actor.name} · ${formatDate(event.at, true)}`,
    ),
    createNode(document, 'span', 'timeline-detail', event.detail),
  );
  return item;
}

/** Creates the accessible inline form for one active comment edit. */
function commentEditForm(
  document: Document,
  commentId: string,
  draft: string,
): HTMLFormElement {
  const form = createNode(document, 'form', 'comment-edit-form');
  form.dataset.editCommentForm = commentId;
  const label = createNode(document, 'label', 'comment-field');
  label.append(createNode(document, 'span', undefined, '编辑评论'));
  const textarea = createTextAreaNode(document, 'comment-textarea', draft);
  textarea.name = 'content';
  textarea.dataset.editCommentInput = commentId;
  textarea.required = true;
  textarea.rows = 4;
  label.append(textarea);
  const actions = createNode(document, 'div', 'comment-edit-actions');
  const save = createNode(document, 'button', 'primary-button', '保存');
  save.type = 'submit';
  const cancel = createNode(document, 'button', 'secondary-button', '取消');
  cancel.type = 'button';
  cancel.dataset.cancelCommentEdit = commentId;
  actions.append(save, cancel);
  form.append(label, actions);
  return form;
}

/** Creates one safe comment entry and its ownership-aware controls. */
function commentEntry(
  document: Document,
  event: Extract<TaskResource['timeline'][number], { kind: 'comment' }>,
  task: TaskResource,
  actorId: string,
  editor?: CommentEditorState,
  permissions?: readonly PermissionCode[],
): HTMLLIElement {
  const item = createNode(document, 'li', 'timeline-comment');
  const heading = createNode(document, 'div', 'comment-heading');
  const metadata = createNode(document, 'div', 'comment-metadata');
  metadata.append(
    createNode(document, 'span', 'timeline-action', `@${event.actor.username}`),
    createNode(document, 'span', 'timeline-meta', formatDate(event.at, true)),
  );
  if (event.edited && !event.deleted)
    metadata.append(createNode(document, 'span', 'comment-edited', '已编辑'));
  heading.append(metadata);
  item.append(heading);
  if (event.deleted) {
    item.append(
      createNode(
        document,
        'span',
        'comment-deleted',
        `该评论已被@${event.deletedByUsername}删除`,
      ),
    );
    return item;
  }
  const editing =
    editor?.actorId === actorId &&
    editor.taskId === task.id &&
    editor.commentId === event.commentId;
  if (editing)
    item.append(commentEditForm(document, event.commentId, editor.draft));
  else
    item.append(
      createNode(document, 'p', 'comment-content', event.content ?? ''),
    );
  const actions = createNode(document, 'div', 'comment-actions');
  if (
    !editing &&
    task.workflowStatus !== 'closed' &&
    event.actor.id === actorId
  ) {
    const edit = createNode(
      document,
      'button',
      'comment-edit-button',
      '编辑评论',
    );
    edit.type = 'button';
    edit.dataset.editCommentId = event.commentId;
    actions.append(edit);
  }
  if (
    !editing &&
    (event.actor.id === actorId || permissions?.includes('system.manage'))
  ) {
    const remove = createNode(
      document,
      'button',
      'comment-delete-button',
      '删除评论',
    );
    remove.type = 'button';
    remove.dataset.deleteCommentId = event.commentId;
    actions.append(remove);
  }
  if (actions.children.length > 0) item.append(actions);
  return item;
}

/** Creates the multiline comment form for one open task visible to the actor. */
function commentForm(
  document: Document,
  task: TaskResource,
  draft: string,
): HTMLFormElement {
  const form = createNode(document, 'form', 'comment-form');
  form.dataset.commentForm = task.id;
  const label = createNode(document, 'label', 'comment-field');
  label.append(createNode(document, 'span', undefined, '添加评论'));
  const textarea = createTextAreaNode(document, 'comment-textarea', draft);
  textarea.name = 'content';
  textarea.dataset.commentInput = task.id;
  textarea.required = true;
  textarea.rows = 4;
  label.append(textarea);
  const button = createNode(
    document,
    'button',
    'primary-button comment-submit-button',
    '发表评论',
  );
  button.type = 'submit';
  form.append(label, button);
  return form;
}

/** Creates the reverse-chronological activity and comment timeline. */
function timeline(
  document: Document,
  task: TaskResource,
  actorId: string,
  permissions: readonly PermissionCode[] | undefined,
  draft: string,
  editor?: CommentEditorState,
): HTMLElement {
  const section = createNode(document, 'section', 'timeline-section');
  const title = createNode(document, 'div', 'timeline-title', '操作时间线 ');
  title.append(createNode(document, 'span', undefined, '/ 操作记录'));
  const list = createNode(document, 'ol', 'timeline');
  for (const event of task.timeline.slice().reverse()) {
    list.append(
      event.kind === 'activity'
        ? activityEntry(document, event)
        : commentEntry(document, event, task, actorId, editor, permissions),
    );
  }
  section.append(title, list);
  if (task.status !== 'closed' && permissions?.includes('tasks.view'))
    section.append(commentForm(document, task, draft));
  return section;
}

/** Renders the complete selected task detail drawer using only safe nodes. */
export function renderTaskDrawer(
  document: Document,
  container: HTMLElement,
  task: TaskResource,
  actorId: string,
  permissions?: readonly PermissionCode[],
  commentDraft = '',
  commentEditor?: CommentEditorState,
): void {
  const header = createNode(document, 'div', 'drawer-header');
  const heading = createNode(document, 'div');
  const eyebrow = createNode(document, 'p', 'eyebrow', `${task.typeLabel} `);
  eyebrow.append(
    createNode(document, 'span', undefined, '/'),
    document.createTextNode(' 任务详情'),
  );
  const title = createNode(document, 'h2', undefined, task.title);
  title.id = 'drawerTitle';
  heading.append(eyebrow, title);
  const close = createNode(document, 'button', 'icon-button', '×');
  close.type = 'button';
  close.dataset.closeDrawer = '';
  close.setAttribute('aria-label', '关闭任务详情');
  header.append(heading, close);

  const facts = createNode(document, 'div', 'detail-facts');
  facts.append(
    detailFact(document, '当前状态', task.statusLabel),
    detailFact(document, '截止时间', formatDueDate(task.dueDate)),
    detailFact(document, '任务发布者', task.publisher.name),
    detailFact(document, '当前接取者', task.assignee?.name ?? '未接取'),
    detailFact(document, '任务奖励', task.reward, true),
  );
  container.replaceChildren(
    header,
    createNode(document, 'p', 'drawer-description', task.description),
    facts,
    actionControls(document, task, actorId, permissions),
    timeline(document, task, actorId, permissions, commentDraft, commentEditor),
  );
}
