export interface Config {
  port: number;
  /** Public origin other servers see, e.g. `https://pinstripe.social`. */
  origin: string;
  version: string;
  /** Postgres connection string; without it everything is kept in memory. */
  databaseUrl: string | null;
  /** Creates this local account at startup (dev only). */
  seedAccount: string | null;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const port = Number(env.PORT ?? 8000);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid PORT: ${env.PORT}`);
  const origin = new URL(env.PINSTRIPE_ORIGIN ?? `http://localhost:${port}`).origin;
  return {
    port,
    origin,
    version: env.npm_package_version ?? "0.0.0",
    databaseUrl: env.DATABASE_URL || null,
    seedAccount: env.PINSTRIPE_SEED_ACCOUNT || null,
  };
}
