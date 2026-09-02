/** Resolves mandatory identities for task use cases through the identity public contract. */
import { AppError } from '../../common/application/app-error.js';
import type { Actor } from '../../identity/public/actor.js';
import type { IdentityDirectoryPort } from '../../identity/public/identity-directory.port.js';

/** Returns the exact demo actor or raises a stable unauthorized identity failure. */
export async function requireDemoActor(
  directory: IdentityDirectoryPort,
  actorId: string,
): Promise<Actor> {
  const actor = await directory.findById(actorId);
  if (!actor) throw new AppError('UNKNOWN_IDENTITY', '缺失或未知的演示身份');
  return actor;
}
