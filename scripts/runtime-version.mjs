/** Enforces the repository's fixed Node runtime before lifecycle or test orchestration starts. */
const REQUIRED_NODE_VERSION = '24.20.0';

/** Rejects unsupported Node runtimes before they can create or mutate Docker resources. */
export function assertSupportedNodeVersion(
  actualVersion = process.versions.node,
) {
  if (actualVersion !== REQUIRED_NODE_VERSION) {
    throw new Error(
      `需要 Node ${REQUIRED_NODE_VERSION}，当前为 Node ${actualVersion}；请先切换运行时再重试`,
    );
  }
}
