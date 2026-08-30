/** Resolves mandatory demo identities for command use cases without transport coupling. */
import { AppError } from '../../common/application/app-error.js';
import type { Actor } from '../../tasks/domain/task.types.js';
import type { IdentityDirectoryPort } from './ports/identity-directory.port.js';

/** Returns the exact demo actor or raises a stable unauthorized identity failure. */
export async function requireDemoActor(
  directory: IdentityDirectoryPort,
  actorId: string,
): Promise<Actor> {
  const actor = await directory.findById(actorId);
  if (!actor) throw new AppError('UNKNOWN_IDENTITY', '缺失或未知的演示身份');
  return actor;
}
