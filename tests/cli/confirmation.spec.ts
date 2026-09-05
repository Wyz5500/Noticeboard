/** Exercises real readline streams so EOF cannot strand an interactive deletion. */
import { PassThrough } from 'node:stream';
import { setTimeout } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { confirmDeletion } from '../../apps/cli/src/confirmation.js';

/** Affirmative, negative and empty input must resolve using the actual stream adapter. */
it.each([
  ['y\n', true],
  ['YES\n', true],
  ['n\n', false],
  ['\n', false],
  ['', false],
])('handles confirmation input %j', async (inputText, expected) => {
  const input = new PassThrough();
  const output = new PassThrough();
  try {
    const answer = confirmDeletion('确认？', input, output);
    input.end(inputText);
    expect(await Promise.race([answer, setTimeout(100, 'pending')])).toBe(
      expected,
    );
  } finally {
    input.destroy();
    output.destroy();
  }
});
