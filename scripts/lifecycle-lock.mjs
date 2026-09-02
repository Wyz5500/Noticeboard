/** Serializes lifecycle mutations that target the same Docker Compose project. */
import { randomUUID } from 'node:crypto';
import {
  closeSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const WAIT_INTERVAL_MS = 100;
const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_LOCK_AGE_MS = 6 * 60 * 60 * 1000;

/** Sleeps synchronously while another short lifecycle operation owns a lock. */
function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/** Reports whether the process recorded by a lock is still alive. */
function processExists(processId) {
  if (!Number.isInteger(processId) || processId < 1) return false;
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/** Reads both current and legacy lock owner formats. */
function readLockOwner(lockPath) {
  const content = readFileSync(lockPath, 'utf8');
  try {
    const owner = JSON.parse(content);
    return { content, processId: Number(owner.pid) };
  } catch {
    return { content, processId: Number(content.trim()) };
  }
}

/** Reports whether a lock exceeded the maximum lifecycle command duration. */
function lockExpired(lockPath) {
  return Date.now() - statSync(lockPath).mtimeMs >= MAX_LOCK_AGE_MS;
}

/** Restores a quarantined replacement lock without overwriting another owner. */
function restoreReplacementLock(quarantinePath, lockPath) {
  try {
    linkSync(quarantinePath, lockPath);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  } finally {
    rmSync(quarantinePath, { force: true });
  }
}

/** Atomically removes one observed lock without deleting a newer replacement. */
function removeObservedLock(lockPath, observedContent) {
  const quarantinePath = `${lockPath}.stale-${process.pid}-${randomUUID()}`;
  try {
    renameSync(lockPath, quarantinePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
    return false;
  }
  const quarantinedContent = readFileSync(quarantinePath, 'utf8');
  if (quarantinedContent !== observedContent) {
    restoreReplacementLock(quarantinePath, lockPath);
    return false;
  }
  rmSync(quarantinePath, { force: true });
  return true;
}

/** Removes a dead or expired lock while preserving any concurrently replaced owner. */
function removeStaleLock(lockPath) {
  try {
    const owner = readLockOwner(lockPath);
    if (processExists(owner.processId) && !lockExpired(lockPath)) return false;
    return removeObservedLock(lockPath, owner.content);
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
    throw error;
  }
}

/** Runs one operation while holding an atomic project-scoped filesystem lock. */
export function withLifecycleLock(
  lockRoot,
  lockName,
  operation,
  { timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  mkdirSync(lockRoot, { recursive: true });
  const lockPath = join(lockRoot, `${lockName}.lock`);
  const deadline = Date.now() + timeoutMs;
  const ownerContent = JSON.stringify({
    pid: process.pid,
    token: randomUUID(),
    createdAt: new Date().toISOString(),
  });
  let acquired = false;
  while (!acquired) {
    let descriptor;
    try {
      descriptor = openSync(lockPath, 'wx');
      writeFileSync(descriptor, ownerContent);
      acquired = true;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (removeStaleLock(lockPath)) continue;
      if (Date.now() >= deadline) {
        throw new Error(`生命周期命令正在执行：${lockName}`, {
          cause: error,
        });
      }
      wait(WAIT_INTERVAL_MS);
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
    }
  }
  try {
    return operation();
  } finally {
    removeObservedLock(lockPath, ownerContent);
  }
}
