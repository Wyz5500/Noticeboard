/** Preserves the prototype's hash routing and Chinese task-filter URL vocabulary. */

export const FILTER_LABELS = [
  '全部',
  '未开始',
  '进行中',
  '已完成',
  '重新打开',
  '关闭',
] as const;
export type FilterLabel = (typeof FILTER_LABELS)[number];
export type TaskScope = 'all' | 'mine';

export interface RouteState {
  view: 'home' | 'tasks';
  scope: TaskScope;
  filter: FilterLabel;
  query: string;
}

/** Recognizes only the six visible filter labels supported by the task board. */
function isFilterLabel(value: string | null): value is FilterLabel {
  return FILTER_LABELS.some((label) => label === value);
}

/** Parses a browser hash into normalized in-memory route state. */
export function parseHash(hash: string): RouteState {
  const source = hash.replace(/^#/, '');
  const [path = '', queryString = ''] = source.split('?');
  const params = new URLSearchParams(queryString);
  const filter = params.get('filter');
  return {
    view: path === 'tasks' ? 'tasks' : 'home',
    scope: params.get('scope') === 'mine' ? 'mine' : 'all',
    filter: isFilterLabel(filter) ? filter : '全部',
    query: params.get('q') ?? '',
  };
}

/** Builds the exact task hash used by navigation, status shortcuts, and search. */
export function buildTaskHash(
  route: Pick<RouteState, 'scope' | 'filter' | 'query'>,
): string {
  const query = route.query ? `&q=${encodeURIComponent(route.query)}` : '';
  return `#tasks?scope=${route.scope}&filter=${route.filter}${query}`;
}
