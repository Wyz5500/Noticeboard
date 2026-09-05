/** Owns readline confirmation without letting terminal lifetime leak into command logic. */
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

/** Treats only an explicit affirmative answer as consent and always closes readline. */
export async function confirmDeletion(
  question: string,
  input: Readable,
  output: Writable,
): Promise<boolean> {
  const readline = createInterface({ input, output });
  try {
    return await new Promise<boolean>((resolve) => {
      readline.once('line', (answer) =>
        resolve(/^(y|yes)$/i.test(answer.trim())),
      );
      readline.once('close', () => resolve(false));
      readline.once('SIGINT', () => resolve(false));
      readline.setPrompt(question);
      readline.prompt();
    });
  } finally {
    readline.close();
  }
}
