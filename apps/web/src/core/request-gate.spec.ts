/** Verifies UI command locks suppress duplicate submissions without changing normal rendering. */
import { describe, expect, it } from 'vitest';

import { RequestGate } from './request-gate.js';

describe('RequestGate', () => {
  /** Proves a second command using the same key is ignored while the first remains pending. */
  it('prevents duplicate in-flight commands and releases the key afterward', async () => {
    const gate = new RequestGate();
    let release: (() => void) | undefined;
    let calls = 0;
    const pending = gate.run('task:accept', async () => {
      calls += 1;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return 'complete';
    });

    await expect(
      gate.run('task:accept', async () => 'duplicate'),
    ).resolves.toBeNull();
    expect(calls).toBe(1);
    release!();
    await expect(pending).resolves.toBe('complete');
    await expect(gate.run('task:accept', async () => 'next')).resolves.toBe(
      'next',
    );
  });

  /** Proves rejected commands also release their lock for a retry. */
  it('releases a key after failure', async () => {
    const gate = new RequestGate();

    await expect(
      gate.run('reset', async () => {
        throw new Error('network');
      }),
    ).rejects.toThrow('network');
    await expect(gate.run('reset', async () => 'retry')).resolves.toBe('retry');
  });
});
