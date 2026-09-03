/** Enforces repository runtime majors before lifecycle or test orchestration starts. */
import { spawnSync } from 'node:child_process';

const REQUIRED_NODE_MAJOR = 24;
const REQUIRED_NPM_MAJOR = 11;

/** Parses one semantic runtime version and returns its major component. */
function parseRuntimeMajor(version, runtimeName) {
  const match = version.match(/^(\d+)\.\d+\.\d+(?:[-+].*)?$/);
  if (!match) throw new Error(`当前不是有效的 ${runtimeName} 版本：${version}`);
  return Number(match[1]);
}

/** Rejects unsupported Node runtimes before they can create or mutate resources. */
export function assertSupportedNodeVersion(
  actualVersion = process.versions.node,
) {
  if (parseRuntimeMajor(actualVersion, 'Node') !== REQUIRED_NODE_MAJOR) {
    throw new Error(
      `需要 Node ${REQUIRED_NODE_MAJOR}.x，当前为 Node ${actualVersion}；请先切换运行时再重试`,
    );
  }
}

/** Rejects unsupported npm releases before lifecycle orchestration starts. */
export function assertSupportedNpmVersion(actualVersion) {
  if (parseRuntimeMajor(actualVersion, 'npm') !== REQUIRED_NPM_MAJOR) {
    throw new Error(
      `需要 npm ${REQUIRED_NPM_MAJOR}.x，当前为 npm ${actualVersion}；请先切换运行时再重试`,
    );
  }
}

/** Reads npm's active version from npm metadata or the current executable search path. */
export function readCurrentNpmVersion(
  environment = process.env,
  runCommand = spawnSync,
) {
  const userAgentMatch = environment.npm_config_user_agent?.match(
    /(?:^|\s)npm\/([^\s]+)/,
  );
  if (userAgentMatch) return userAgentMatch[1];
  const result = runCommand('npm', ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      result.stderr?.trim() ||
        `npm --version 执行失败（退出码 ${result.status}）`,
    );
  }
  return result.stdout.trim();
}

/** Validates both runtime majors used by repository lifecycle commands. */
export function assertSupportedRuntimeVersions({
  nodeVersion = process.versions.node,
  npmVersion = readCurrentNpmVersion(),
} = {}) {
  assertSupportedNodeVersion(nodeVersion);
  assertSupportedNpmVersion(npmVersion);
}
