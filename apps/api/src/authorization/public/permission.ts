/** Defines the stable permission catalog shared through the authorization public boundary. */

export const ALL_PERMISSION_CODES = [
  'system.manage',
  'tasks.view',
  'tasks.create',
  'tasks.accept',
  'tasks.complete',
  'tasks.review',
  'tasks.close',
  'demo.reset',
] as const;

export type PermissionCode = (typeof ALL_PERMISSION_CODES)[number];
