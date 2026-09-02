/** Declares the demo identities shared with deterministic task seed creation. */
import type { Actor } from './actor.js';

export const DEMO_ACTORS: readonly Actor[] = [
  {
    id: 'noticeboard-master',
    username: 'noticeboard-master',
    name: '用户 A',
    role: 'user',
    roleLabel: '用户',
  },
  {
    id: 'adventurer-a',
    username: 'adventurer-a',
    name: '用户 B',
    role: 'user',
    roleLabel: '用户',
  },
  {
    id: 'adventurer-b',
    username: 'adventurer-b',
    name: '用户 C',
    role: 'user',
    roleLabel: '用户',
  },
];
