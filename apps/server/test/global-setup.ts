import postgres from "postgres";
import { connect, runMigrations } from "../src/db/client.ts";

/** The second database, for the "other server" in federation tests: TEST_DATABASE_URL with `_b` appended to its name. */
export function secondDatabaseUrl(url: string): string {
  const u = new URL(url);
  u.pathname = `${u.pathname}_b`;
  return u.href;
}

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is required (tests truncate it; never point it at real data). " +
        "Locally: docker compose up -d, then TEST_DATABASE_URL=postgres://pinstripe:pinstripe@localhost:5432/pinstripe_test",
    );
  }
  const second = secondDatabaseUrl(url);
  const admin = postgres(url, { onnotice: () => {} });
  const name = new URL(second).pathname.slice(1);
  const [exists] = await admin`select 1 from pg_database where datname = ${name}`;
  if (!exists) await admin.unsafe(`create database "${name.replace(/"/g, '""')}"`);
  await admin.end();

  for (const u of [url, second]) {
    const { sql, db } = connect(u);
    await runMigrations(db);
    await sql.end();
  }
}
