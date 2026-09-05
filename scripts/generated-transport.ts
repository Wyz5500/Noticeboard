/** Generates the internal Fetch transport exclusively from the tracked v1 candidate and checks complete-tree drift. */
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from 'orval';
import { createFetchClient } from './openapi-fetch-client.js';

const ARTIFACT = 'openapi/v1/noticeboard.openapi.json';
const GENERATED = 'apps/cli/src/sdk/internal/generated';
type FileTree = ReadonlyMap<string, Buffer>;

/** Distinguishes an absent file from permission, IO and other filesystem failures. */
function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** Reads sorted POSIX relative paths and original bytes, rejecting symlinks and non-file entries. */
export async function readGeneratedTree(root: string): Promise<FileTree> {
  const files = new Map<string, Buffer>();
  const visit = async (directory: string, prefix: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute, path);
      else if (entry.isFile()) files.set(path, await readFile(absolute));
      else throw new Error(`生成目录只允许普通文件和目录：${path}`);
    }
  };
  // Only the root may be absent. A file disappearing during traversal is an IO failure.
  try {
    await readdir(root);
  } catch (error) {
    if (isMissing(error)) return files;
    throw error;
  }
  await visit(root, '');
  return new Map(
    [...files].sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
}

/** Compares complete file membership and bytes without timestamps or platform separators. */
export function compareGeneratedTrees(
  tracked: FileTree,
  candidate: FileTree,
): string[] {
  return [...new Set([...tracked.keys(), ...candidate.keys()])]
    .sort()
    .flatMap((path) => {
      const oldBytes = tracked.get(path);
      const newBytes = candidate.get(path);
      if (!oldBytes) return [`missing: ${path}`];
      if (!newBytes) return [`stale: ${path}`];
      return oldBytes.equals(newBytes) ? [] : [`changed: ${path}`];
    });
}

/** Installs a complete sibling stage, restoring the old tree on failure and retaining unrecoverable backups. */
export async function replaceGeneratedTree(
  staged: string,
  tracked: string,
): Promise<void> {
  const backupRoot = await mkdtemp(
    join(dirname(tracked), '.generated-backup-'),
  );
  const backup = join(backupRoot, 'previous');
  let movedOld = false;
  let keepBackup = false;
  try {
    try {
      await rename(tracked, backup);
      movedOld = true;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    try {
      await rename(staged, tracked);
    } catch (error) {
      if (movedOld) {
        try {
          await rename(backup, tracked);
        } catch (restoreError) {
          keepBackup = true;
          throw new AggregateError(
            [error, restoreError],
            `生成目录替换和恢复均失败；旧文件保留在 ${backup}`,
            { cause: restoreError },
          );
        }
      }
      throw error;
    }
  } finally {
    if (!keepBackup) await rm(backupRoot, { recursive: true, force: true });
  }
}

/** Runs pinned Orval codegen with the JSON Fetch client extension without mutators, transformations, formatters or runtime dependencies. */
async function generateTransport(root: string, output: string): Promise<void> {
  await generate({
    input: resolve(root, ARTIFACT),
    output: {
      target: join(output, 'transport.ts'),
      client: createFetchClient,
      mode: 'single',
      // Omitting formatter and hooks preserves the generator's original bytes.
      baseUrl: '',
      override: {
        useDates: false,
      },
    },
  });
  if (!(await readGeneratedTree(output)).size)
    throw new Error('生成器没有输出任何文件');
}

/** Executes generate/check with fixed repository paths and shell-compatible usage/failure codes. */
export async function runGeneratedTransportCommand(
  args: readonly string[],
): Promise<number> {
  const [command, ...extra] = args;
  if ((command !== 'generate' && command !== 'check') || extra.length) {
    process.stderr.write('用法：generated-transport <generate|check>\n');
    return 64;
  }
  let stageRoot: string | undefined;
  try {
    const root = process.cwd();
    const tracked = resolve(root, GENERATED);
    const temporaryParent =
      command === 'generate' ? dirname(tracked) : tmpdir();
    if (command === 'generate')
      await mkdir(temporaryParent, { recursive: true });
    stageRoot = await mkdtemp(join(temporaryParent, '.noticeboard-generated-'));
    const output = join(stageRoot, 'candidate');
    await generateTransport(root, output);
    if (command === 'generate') {
      await replaceGeneratedTree(output, tracked);
      process.stdout.write(`Generated transport 已生成：${GENERATED}\n`);
    } else {
      const differences = compareGeneratedTrees(
        await readGeneratedTree(tracked),
        await readGeneratedTree(output),
      );
      if (differences.length)
        throw new Error(
          `Generated transport 漂移：\n${differences.join('\n')}`,
        );
      process.stdout.write('generated transport drift check passed\n');
    }
    return 0;
  } catch (error) {
    process.stderr.write(
      `错误：${error instanceof Error ? error.message : String(error)}\n请运行 npm run client:generate 并审查差异\n`,
    );
    return 1;
  } finally {
    if (stageRoot) await rm(stageRoot, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await runGeneratedTransportCommand(process.argv.slice(2));
}
