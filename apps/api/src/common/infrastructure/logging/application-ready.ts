/** Creates the machine-readable event used by host lifecycle orchestration. */

/** Serializes the actual Fastify listen URL without relying on human log wording. */
export function createApplicationReadyRecord(url: string): string {
  return JSON.stringify({
    level: 'info',
    event: 'application.ready',
    url,
  });
}
