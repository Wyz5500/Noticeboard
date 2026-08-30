/** Persists only the selected demo identity and removes legacy local task state. */

export const LEGACY_STATE_KEY = 'minecraft-guild-board-state';
export const USER_STORAGE_KEY = 'minecraft-guild-board-user';
const FALLBACK_USER_ID = 'guild-master';

/** Parses an identity-only JSON value and accepts only currently known IDs. */
function parseIdentity(
  value: string | null,
  knownIds: ReadonlySet<string>,
): string | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { currentUserId?: unknown };
    return typeof parsed.currentUserId === 'string' &&
      knownIds.has(parsed.currentUserId)
      ? parsed.currentUserId
      : null;
  } catch {
    return null;
  }
}

/** Loads the new key or migrates one valid identity before deleting all legacy task data. */
export function loadCurrentUserId(
  storage: Storage,
  knownIds: ReadonlySet<string>,
): string {
  let selected: string | null;
  try {
    selected = parseIdentity(storage.getItem(USER_STORAGE_KEY), knownIds);
    if (!selected)
      selected = parseIdentity(storage.getItem(LEGACY_STATE_KEY), knownIds);
    storage.removeItem(LEGACY_STATE_KEY);
  } catch {
    return knownIds.has(FALLBACK_USER_ID)
      ? FALLBACK_USER_ID
      : ([...knownIds][0] ?? '');
  }
  const normalized =
    selected ??
    (knownIds.has(FALLBACK_USER_ID)
      ? FALLBACK_USER_ID
      : ([...knownIds][0] ?? ''));
  try {
    storage.setItem(
      USER_STORAGE_KEY,
      JSON.stringify({ currentUserId: normalized }),
    );
  } catch {
    // Storage can be unavailable in private browsing; the in-memory selection remains usable.
  }
  return normalized;
}

/** Saves a known identity using the minimal identity-only JSON contract. */
export function saveCurrentUserId(
  storage: Storage,
  actorId: string,
  knownIds: ReadonlySet<string>,
): string {
  const normalized = knownIds.has(actorId)
    ? actorId
    : knownIds.has(FALLBACK_USER_ID)
      ? FALLBACK_USER_ID
      : ([...knownIds][0] ?? '');
  try {
    storage.setItem(
      USER_STORAGE_KEY,
      JSON.stringify({ currentUserId: normalized }),
    );
    storage.removeItem(LEGACY_STATE_KEY);
  } catch {
    // A failed preference write must not prevent the selected identity from working in memory.
  }
  return normalized;
}
