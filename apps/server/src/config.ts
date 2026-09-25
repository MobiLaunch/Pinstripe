import type { S3Options } from "./media/storage.ts";

export type StorageConfig = { kind: "local"; dir: string } | ({ kind: "s3" } & S3Options);

export interface Config {
  port: number;
  /** Public origin other servers see, e.g. `https://pinstripe.social`. */
  origin: string;
  version: string;
  databaseUrl: string;
  /** Development only: lets two local servers federate over localhost. Never in production (SSRF). */
  allowPrivateAddress: boolean;
  storage: StorageConfig;
}

/**
 * MEDIA_STORAGE=local (default): files under MEDIA_DIR, served by this server.
 * MEDIA_STORAGE=s3: any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2…).
 */
function loadStorage(env: Record<string, string | undefined>): StorageConfig {
  if ((env.MEDIA_STORAGE ?? "local") === "local") return { kind: "local", dir: env.MEDIA_DIR ?? "./media-data" };
  if (env.MEDIA_STORAGE !== "s3") throw new Error(`MEDIA_STORAGE must be "local" or "s3", not ${env.MEDIA_STORAGE}`);
  const required = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_URL"] as const;
  const missing = required.filter((k) => !env[k]);
  if (missing.length) throw new Error(`MEDIA_STORAGE=s3 needs ${missing.join(", ")}`);
  return {
    kind: "s3",
    bucket: env.S3_BUCKET!,
    region: env.S3_REGION ?? "auto",
    endpoint: env.S3_ENDPOINT || undefined,
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    publicUrl: env.S3_PUBLIC_URL!,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
  };
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
    storage: loadStorage(env),
  };
}
