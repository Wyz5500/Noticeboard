/** Validates environment configuration before network or database resources are opened. */

export interface RuntimeConfig {
  databaseUrl: string;
  host: string;
  port: number;
}

/** Loads mandatory database and bounded listen settings from environment variables. */
export function loadRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const port = Number(environment.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error('PORT must be an integer from 1 to 65535');
  return {
    databaseUrl,
    host: environment.HOST?.trim() || '0.0.0.0',
    port,
  };
}
