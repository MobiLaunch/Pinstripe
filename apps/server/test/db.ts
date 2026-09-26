import { afterAll } from "vitest";
import { connect } from "../src/db/client.ts";

/** A connection to the test database, closed after the file's tests. */
export function testDb() {
  const conn = connect(process.env.TEST_DATABASE_URL!);
  afterAll(() => conn.sql.end());
  return {
    ...conn,
    /** Empties every table the app owns. */
    reset: () => conn.sql`TRUNCATE accounts, oauth_apps, instance_domain_blocks CASCADE`,
  };
}
