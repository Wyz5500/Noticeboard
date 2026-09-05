/** Adapts process streams and TTY confirmation to the independently testable CLI dispatcher. */
import { confirmDeletion } from './confirmation.js';
import { runCli } from './run.js';
import { frameHumanOutput } from './output.js';
import { readStdin } from './write-commands.js';

let streamExitCode: number | undefined;

/** Handles asynchronous stdout failures without mistaking a closed downstream pipe for a CLI defect. */
function handleStdoutError(error: NodeJS.ErrnoException): void {
  streamExitCode = error.code === 'EPIPE' ? 0 : 1;
  process.exitCode = streamExitCode;
  if (error.code === 'EPIPE') return;
  const failure = {
    error: {
      kind: 'internal',
      code: error.code ?? 'OUTPUT_ERROR',
      message: '无法写入标准输出',
    },
    meta: { exitCode: 1 },
  };
  process.stderr.write(
    process.argv.includes('--json')
      ? `${JSON.stringify(failure)}\n`
      : frameHumanOutput(`错误：${failure.error.message}\n`),
  );
}

process.stdout.on('error', handleStdoutError);
process.stderr.on('error', () => {
  streamExitCode = 1;
  process.exitCode = 1;
});

if (process.versions.node.split('.')[0] !== '24') {
  const error = {
    error: { kind: 'usage', message: 'noticeboard 需要 Node 24.x' },
    meta: { exitCode: 64 },
  };
  process.stderr.write(
    process.argv.includes('--json')
      ? `${JSON.stringify(error)}\n`
      : frameHumanOutput(`${error.error.message}\n`),
  );
  process.exitCode = 64;
} else {
  const commandExitCode = await runCli(process.argv.slice(2), {
    env: process.env,
    stdout: (text) => {
      process.stdout.write(text);
    },
    stderr: (text) => {
      process.stderr.write(text);
    },
    isTTY: Boolean(process.stdin.isTTY && process.stderr.isTTY),
    confirm: (question) =>
      confirmDeletion(question, process.stdin, process.stderr),
    fetch: globalThis.fetch,
    readStdin: () => readStdin(process.stdin),
  });
  process.exitCode = streamExitCode ?? commandExitCode;
}
