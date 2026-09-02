/** Delegates the project quality gate to the current worktree's isolated Compose instance. */
import { runInstanceCommand } from './instance.mjs';

/** Runs verify while preserving the existing npm entry point and cleanup contract. */
function main() {
  return runInstanceCommand(['verify', ...process.argv.slice(2)]);
}

process.exitCode = main();
