import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema.ts";

export type Sql = postgres.Sql;
export type Db = ReturnType<typeof connect>["db"];

/** One connection pool, shared by Drizzle and Fedify's Postgres KV store and queue. */
export function connect(url: string) {
  const sql = postgres(url, { onnotice: () => {} });
  return { sql, db: drizzle(sql, { schema }) };
}

// fileURLToPath, not .pathname, which on Windows gives "/C:/…".
const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function runMigrations(db: Db) {
  await migrate(db, { migrationsFolder });
}
