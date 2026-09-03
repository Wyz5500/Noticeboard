/** Validates environment configuration before network or database resources are opened. */

export interface RuntimeConfig {
  databaseUrl: string;
  host: string;
  port: number;
}

/** Loads the mandatory PostgreSQL URL shared by application and database-only commands. */
export function loadDatabaseUrl(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  return databaseUrl;
}

/** Loads mandatory database and explicit bounded listen settings from environment variables. */
export function loadRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const portText = environment.PORT?.trim();
  if (!portText) throw new Error('PORT is required');
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 0 || port > 65_535)
    throw new Error('PORT must be an integer from 0 to 65535');
  return {
    databaseUrl: loadDatabaseUrl(environment),
    host: environment.HOST?.trim() || '0.0.0.0',
    port,
  };
}
