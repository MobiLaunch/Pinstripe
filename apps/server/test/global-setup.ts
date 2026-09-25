import { connect, runMigrations } from "../src/db/client.ts";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is required (tests truncate it; never point it at real data). " +
        "Locally: docker compose up -d, then TEST_DATABASE_URL=postgres://pinstripe:pinstripe@localhost:5432/pinstripe_test",
    );
  }
  const { sql, db } = connect(url);
  await runMigrations(db);
  await sql.end();
}
