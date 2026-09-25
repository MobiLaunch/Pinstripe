export interface Config {
  port: number;
  /** Public origin other servers see, e.g. `https://pinstripe.social`. */
  origin: string;
  version: string;
  databaseUrl: string;
  /** Development only: lets two local servers federate over localhost. Never in production (SSRF). */
  allowPrivateAddress: boolean;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const port = Number(env.PORT ?? 8000);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid PORT: ${env.PORT}`);
  const origin = new URL(env.PINSTRIPE_ORIGIN ?? `http://localhost:${port}`).origin;
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. For local development: docker compose up -d (see README).");
  }
  return {
    port,
    origin,
    version: env.npm_package_version ?? "0.0.0",
    databaseUrl: env.DATABASE_URL,
    allowPrivateAddress: env.PINSTRIPE_ALLOW_PRIVATE_ADDRESS === "true",
  };
}
