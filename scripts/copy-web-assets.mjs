/** Copies the preserved HTML and CSS shell beside compiled native browser modules. */
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const OUTPUT_DIRECTORY = join(process.cwd(), 'dist', 'web');

/** Copies static shell assets after TypeScript has emitted browser modules. */
async function copyWebAssets() {
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await Promise.all([
    copyFile(
      join(process.cwd(), 'index.html'),
      join(OUTPUT_DIRECTORY, 'index.html'),
    ),
    copyFile(
      join(process.cwd(), 'styles.css'),
      join(OUTPUT_DIRECTORY, 'styles.css'),
    ),
  ]);
}

await copyWebAssets();
