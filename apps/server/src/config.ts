export interface Config {
  port: number;
  /** Public origin other servers see, e.g. `https://pinstripe.social`. */
  origin: string;
  version: string;
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
    seedAccount: env.PINSTRIPE_SEED_ACCOUNT || null,
  };
}
