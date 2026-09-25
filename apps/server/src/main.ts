import path from "node:path";
import { PostgresKvStore, PostgresMessageQueue } from "@fedify/postgres";
import { serve } from "@hono/node-server";
import { buildApp } from "./app.ts";
import { AuthStore } from "./auth/store.ts";
import { loadConfig } from "./config.ts";
import { connect, runMigrations } from "./db/client.ts";
import { buildFederation } from "./federation.ts";
import { MediaService } from "./media/service.ts";
import { LocalDiskStorage, S3Storage } from "./media/storage.ts";
import { MediaStore } from "./media/store.ts";
import { StatusStore } from "./statuses/store.ts";
import { Store } from "./store.ts";

const config = loadConfig(process.env);

const { sql, db } = connect(config.databaseUrl);
await runMigrations(db);
const store = new Store(db);
const auth = new AuthStore(db);
const statuses = new StatusStore(db);
const storage =
  config.storage.kind === "local"
    ? new LocalDiskStorage(path.resolve(config.storage.dir), config.origin)
    : new S3Storage(config.storage);
const media = new MediaService(new MediaStore(db), storage);
// Hourly: delete uploads never posted, and fail processing that never finished.
setInterval(() => media.sweep().catch((error) => console.error("Media sweep failed", error)), 60 * 60 * 1000).unref();

const federation = buildFederation({
  kv: new PostgresKvStore(sql),
  queue: new PostgresMessageQueue(sql),
  origin: config.origin,
  version: config.version,
  allowPrivateAddress: config.allowPrivateAddress,
});
if (config.allowPrivateAddress) {
  console.warn("PINSTRIPE_ALLOW_PRIVATE_ADDRESS is on: this server will fetch private addresses. Development only.");
}

const app = buildApp({ federation, store, statuses, media, auth, domain: new URL(config.origin).host });

serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(`Pinstripe listening on :${port} as ${config.origin}`);
});
