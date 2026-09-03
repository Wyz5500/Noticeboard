/** Starts host application processes on dynamic loopback ports and guarantees cleanup. */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const DEPLOYMENT_PORT = 3000;

/** Forces one host application to loopback and operating-system port allocation. */
export function createLocalApplicationEnvironment(environment) {
  return {
    ...environment,
    HOST: '127.0.0.1',
    PORT: '0',
  };
}

/** Parses one structured application-ready log line into a safe local base URL. */
export function parseApplicationReadyLine(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return null;
  }
  if (message?.event !== 'application.ready') return null;
  if (typeof message.url !== 'string') {
    throw new Error('本机应用就绪事件缺少 URL');
  }
  const url = new URL(message.url);
  const port = Number(url.port);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') {
    throw new Error('本机应用必须监听 http://127.0.0.1');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`本机应用返回了无效端口：${url.port || '空端口'}`);
  }
  if (port === DEPLOYMENT_PORT) {
    throw new Error('本机应用不得占用永久部署的保留端口 3000');
  }
  return url.origin;
}

/** Stops one application child gracefully before using a bounded forced termination. */
export async function stopLocalApplicationProcess(
  child,
  { shutdownTimeoutMs = 5_000 } = {},
) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    let forced = false;
    const timer = setTimeout(() => {
      forced = true;
      child.kill('SIGKILL');
    }, shutdownTimeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    if (!child.kill('SIGTERM') && !forced) {
      clearTimeout(timer);
      resolve();
    }
  });
}

/** Starts one host process and resolves only after its structured ready event. */
export function startLocalApplication({
  command,
  args = [],
  environment,
  cwd = process.cwd(),
  forwardOutput = true,
  startupTimeoutMs = 15_000,
  spawnProcess = spawn,
}) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, {
      cwd,
      env: {
        ...process.env,
        ...createLocalApplicationEnvironment(environment),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = createInterface({ input: child.stdout });
    let settled = false;

    /** Rejects startup after ensuring the child cannot outlive the failed attempt. */
    const fail = async (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stdout.close();
      await stopLocalApplicationProcess(child);
      reject(error);
    };

    const timer = setTimeout(() => {
      void fail(new Error('等待本机应用就绪超时'));
    }, startupTimeoutMs);

    stdout.on('line', (line) => {
      if (forwardOutput) process.stdout.write(`${line}\n`);
      if (settled) return;
      try {
        const baseUrl = parseApplicationReadyLine(line);
        if (!baseUrl) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          baseUrl,
          child,
          /** Stops the child with the same bounded graceful-shutdown contract. */
          stop: () => stopLocalApplicationProcess(child),
        });
      } catch (error) {
        void fail(error);
      }
    });

    child.stderr.on('data', (chunk) => {
      if (forwardOutput) process.stderr.write(chunk);
    });
    child.once('error', (error) => {
      void fail(error);
    });
    child.once('exit', (code, signal) => {
      if (settled) return;
      void fail(
        new Error(
          `本机应用在就绪前退出（退出码 ${code ?? '无'}，信号 ${signal ?? '无'}）`,
        ),
      );
    });
  });
}
