/** Preserves the prototype's hash routing and Chinese task-filter URL vocabulary. */

import {
  defaultAdminSort,
  isAdminSortField,
  type AdminSection,
  type AdminSortDirection,
  type AdminSortField,
  type AdminSortState,
} from '../admin/admin-sort.js';

export const FILTER_LABELS = [
  '全部',
  '未开始',
  '进行中',
  '已完成',
  '重新打开',
  '已失效',
  '关闭',
] as const;
export type FilterLabel = (typeof FILTER_LABELS)[number];
export type TaskScope = 'all' | 'mine';

export interface RouteState {
  view: 'home' | 'tasks' | 'admin';
  scope: TaskScope;
  filter: FilterLabel;
  query: string;
  section?: AdminSection | undefined;
  sort?: AdminSortState | undefined;
}

/** Recognizes only the seven visible filter labels supported by the task board. */
function isFilterLabel(value: string | null): value is FilterLabel {
  return FILTER_LABELS.some((label) => label === value);
}

/** Parses a browser hash into normalized in-memory route state. */
export function parseHash(hash: string): RouteState {
  const source = hash.replace(/^#/, '');
  const [path = '', queryString = ''] = source.split('?');
  const params = new URLSearchParams(queryString);
  const filter = params.get('filter');
  const section: AdminSection =
    path === 'admin/users'
      ? 'users'
      : path === 'admin/roles'
        ? 'roles'
        : 'overview';
  const isAdminChild = section !== 'overview';
  const field = params.get('sort');
  const direction = params.get('direction');
  const sortDirection: AdminSortDirection | null =
    direction === 'asc' || direction === 'desc' ? direction : null;
  const sort = isAdminChild
    ? isAdminSortField(section, field as AdminSortField) &&
      sortDirection !== null
      ? {
          field: field as AdminSortField,
          direction: sortDirection,
        }
      : defaultAdminSort(section)
    : undefined;
  return {
    view:
      path === 'tasks'
        ? 'tasks'
        : path === 'admin' || isAdminChild
          ? 'admin'
          : 'home',
    scope: params.get('scope') === 'mine' ? 'mine' : 'all',
    filter: isFilterLabel(filter) ? filter : '全部',
    query: params.get('q') ?? '',
    ...(path === 'admin' || isAdminChild ? { section } : {}),
    ...(sort ? { sort } : {}),
  };
}

/** Builds the canonical hash for an administrator section and its child-page sort. */
export function buildAdminHash(
  section: AdminSection,
  sort: AdminSortState = defaultAdminSort(section),
): string {
  if (section === 'overview') return '#admin';
  const safeSort =
    isAdminSortField(section, sort.field) &&
    (sort.direction === 'asc' || sort.direction === 'desc')
      ? sort
      : defaultAdminSort(section);
  return `#admin/${section}?sort=${encodeURIComponent(safeSort.field)}&direction=${safeSort.direction}`;
}

/** Builds the exact task hash used by navigation, status shortcuts, and search. */
export function buildTaskHash(
  route: Pick<RouteState, 'scope' | 'filter' | 'query'>,
): string {
  const query = route.query ? `&q=${encodeURIComponent(route.query)}` : '';
  return `#tasks?scope=${route.scope}&filter=${route.filter}${query}`;
}

/** Rebuilds a browser hash from its semantic route state using canonical URL vocabulary. */
export function normalizeHash(hash: string): string {
  const route = parseHash(hash);
  if (route.view === 'tasks') {
    return buildTaskHash(route);
  }
  if (route.view !== 'admin') return '#home';
  return route.section && route.section !== 'overview' && route.sort
    ? buildAdminHash(route.section, route.sort)
    : '#admin';
}
