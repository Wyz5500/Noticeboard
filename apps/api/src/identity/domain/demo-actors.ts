/** Declares the demo-only identities shared by identity lookup and deterministic seed data. */
import type { Actor } from '../../tasks/domain/task.types.js';

export const DEMO_ACTORS: readonly Actor[] = [
  {
    id: 'guild-master',
    name: '用户 A',
    role: 'user',
    roleLabel: '用户',
  },
  { id: 'adventurer-a', name: '用户 B', role: 'user', roleLabel: '用户' },
  { id: 'adventurer-b', name: '用户 C', role: 'user', roleLabel: '用户' },
];
