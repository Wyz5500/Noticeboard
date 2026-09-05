/** Confirms destructive demo resets before issuing a single SDK request. */
import type { Command } from './arguments.js';
import { requestProfile, type Config } from './config.js';
import { CliError, DemoResetFailure } from './errors.js';
import { safeText } from './output.js';
import type { CliContext } from './run.js';
import { createNoticeboardClient, type DemoResetResult } from './sdk/index.js';

/** Resolves the target locally, then confirms before starting the shared request timeout. */
export async function demoResetCommand(
  command: Command,
  config: Config,
  context: CliContext,
): Promise<{ data: DemoResetResult }> {
  const profile = requestProfile(config, command, context.env);
  if (!command.options.yes) {
    if (!context.isTTY || command.options.json)
      throw new CliError('usage', '非交互或 JSON 重置必须提供 --yes');
    if (
      !(await context.confirm(
        `确认替换 ${safeText(profile.baseUrl)} 的全部任务及时间线为演示数据？[y/N] `,
      ))
    )
      throw new CliError('usage', '已取消重置');
  }
  const client = createNoticeboardClient({
    baseUrl: profile.baseUrl,
    fetch: context.fetch,
    getHeaders: () => ({ 'X-Demo-User-Id': profile.demoUserId }),
  });
  const options = { signal: AbortSignal.timeout(30_000) };
  try {
    return { data: await client.demo.reset(options) };
  } catch (cause) {
    throw new DemoResetFailure(cause);
  }
}
