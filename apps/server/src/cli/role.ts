/**
 * Makes a local account a moderator or admin (or back to a user):
 *
 *   pnpm --filter @pinstripe/server role <username> <user|moderator|admin>
 *
 * Moderators and admins see reports and can suspend accounts. They need to
 * sign in again afterwards, since their tokens don't have the admin scopes.
 */
import { connect } from "../db/client.ts";
import { SafetyStore } from "../safety/store.ts";
import { Store } from "../store.ts";

const [username, role] = process.argv.slice(2);
if (!username || (role !== "user" && role !== "moderator" && role !== "admin")) {
  console.error("Usage: role <username> <user|moderator|admin>");
  process.exit(1);
}

const { sql, db } = connect(process.env.DATABASE_URL ?? "postgres://pinstripe:pinstripe@localhost:5432/pinstripe");
try {
  const store = new Store(db);
  const account = await store.getAccountByUsername(username.replace(/^@/, ""));
  if (!account) {
    console.error(`No local account @${username}`);
    process.exitCode = 1;
  } else {
    await new SafetyStore(db, store).setRole(account.id, role);
    console.log(`@${account.username} is now ${role === "user" ? "a user" : `a ${role}`}.`);
  }
} finally {
  await sql.end();
}
