/** Runs browser checks against an injected instance or a dedicated dynamic worktree instance. */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRawPlaywright, runStandalonePlaywright } from './instance.mjs';
import { assertSupportedNodeVersion } from './runtime-version.mjs';

/** Parses one browser test mode while forwarding Playwright's own arguments unchanged. */
function parseArguments(argumentsFromCli) {
  const [mode, ...argumentsAfterMode] = argumentsFromCli;
  if (mode !== 'e2e' && mode !== 'visual') {
    throw new Error(
      '用法：node scripts/run-playwright.mjs <e2e|visual> [Playwright 参数] [--dry-run]',
    );
  }
  return {
    mode,
    dryRun: argumentsAfterMode.includes('--dry-run'),
    playwrightArguments: argumentsAfterMode.filter(
      (argument) => argument !== '--dry-run',
    ),
  };
}

/** Executes Playwright without fixed host-port fallbacks. */
export function runPlaywrightCommand(
  argumentsFromCli,
  environment = process.env,
) {
  try {
    assertSupportedNodeVersion();
  } catch (error) {
    process.stderr.write(`错误：${error.message}\n`);
    return 1;
  }
  let options;
  try {
    options = parseArguments(argumentsFromCli);
  } catch (error) {
    process.stderr.write(`错误：${error.message}\n`);
    return 64;
  }
  try {
    const baseUrl = environment.E2E_BASE_URL?.trim();
    if (baseUrl) {
      runRawPlaywright(options.mode, environment, options);
    } else {
      runStandalonePlaywright(options.mode, options);
    }
    return 0;
  } catch (error) {
    process.stderr.write(
      `错误：${error instanceof Error ? error.message : String(error)}\n`,
    );
    if (!environment.E2E_BASE_URL?.trim() && !options.dryRun) {
      process.stderr.write(
        'Playwright 验证失败，独立实例已保留；再次运行相同命令将升级并重试。\n',
      );
    }
    return 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = runPlaywrightCommand(process.argv.slice(2));
}
