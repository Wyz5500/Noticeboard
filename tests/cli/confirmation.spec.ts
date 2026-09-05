/** Exercises real readline streams so EOF cannot strand an interactive deletion. */
import { PassThrough } from 'node:stream';
import { setTimeout } from 'node:timers/promises';
import stringWidth from 'string-width';
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
    expect(output.read()?.toString()).toBe('------\n确认？\n------\n');
  } finally {
    input.destroy();
    output.destroy();
  }
});

/** Confirmation borders use the prompt stream's latest width without affecting consent. */
it('caps confirmation rules to the output stream width', async () => {
  const input = new PassThrough();
  const output = Object.assign(new PassThrough(), { columns: 4 });
  try {
    const answer = confirmDeletion('确认删除当前目标？', input, output);
    input.end('yes\n');
    expect(await answer).toBe(true);
    const captured = output.read() as Buffer;
    const lines = captured.toString().trimEnd().split('\n');
    expect(lines[0]).toBe('----');
    expect(lines.at(-1)).toBe('----');
    expect(lines.slice(1, -1).join('')).toBe('确认删除当前目标？');
    for (const line of lines) expect(stringWidth(line)).toBeLessThanOrEqual(4);
  } finally {
    input.destroy();
    output.destroy();
  }
});
