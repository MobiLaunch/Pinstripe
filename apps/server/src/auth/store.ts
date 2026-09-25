import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { accounts, oauthApps, oauthCodes, oauthTokens, users } from "../db/schema.ts";
import { isUniqueViolation, type LocalAccount, newAccount, UsernameTakenError } from "../store.ts";
import { dummyPasswordHash, hashPassword, verifyPassword } from "./passwords.ts";
import { digest, randomSecret, safeEqual } from "./secrets.ts";

export interface OAuthApp {
  id: string;
  name: string;
  website: string | null;
  redirectUris: string[];
  scopes: string[];
  clientId: string;
}

export interface AccessToken {
  id: string;
  app: OAuthApp;
  /** Null for app-only (client_credentials) tokens. */
  account: LocalAccount | null;
  scopes: string[];
  createdAt: Date;
}

export class EmailTakenError extends Error {
  constructor() {
    super("Email taken");
  }
}

const CODE_TTL_MS = 10 * 60 * 1000;
// Writing last_used_at on every request is wasteful; minute precision is plenty.
const LAST_USED_RESOLUTION_MS = 60 * 1000;

function toApp(row: typeof oauthApps.$inferSelect): OAuthApp {
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    redirectUris: row.redirectUris,
    scopes: row.scopes.split(" "),
    clientId: row.clientId,
  };
}

/** Users, OAuth apps, authorization codes and access tokens. */
export class AuthStore {
  constructor(private readonly db: Db) {}

  async createApp(input: { name: string; website: string | null; redirectUris: string[]; scopes: string[] }) {
    const clientSecret = randomSecret();
    const [row] = await this.db
      .insert(oauthApps)
      .values({
        name: input.name,
        website: input.website,
        redirectUris: input.redirectUris,
        scopes: input.scopes.join(" "),
        clientId: randomSecret(),
        clientSecretHash: digest(clientSecret),
      })
      .returning();
    return { app: toApp(row!), clientSecret };
  }

  async getAppByClientId(clientId: string): Promise<OAuthApp | null> {
    const [row] = await this.db.select().from(oauthApps).where(eq(oauthApps.clientId, clientId));
    return row ? toApp(row) : null;
  }

  /** Looks up an app and checks its secret in one step. */
  async authenticateApp(clientId: string, clientSecret: string): Promise<OAuthApp | null> {
    const [row] = await this.db.select().from(oauthApps).where(eq(oauthApps.clientId, clientId));
    if (!row || !safeEqual(row.clientSecretHash, digest(clientSecret))) return null;
    return toApp(row);
  }

  /** Creates the account and its login in one transaction. */
  async registerUser(input: { username: string; email: string; password: string; locale: string | null }) {
    const fresh = newAccount(input.username);
    const passwordHash = await hashPassword(input.password);
    try {
      return await this.db.transaction(async (tx) => {
        const [account] = await tx.insert(accounts).values(fresh).returning();
        await tx.insert(users).values({ accountId: account!.id, email: input.email, passwordHash, locale: input.locale });
        return account!;
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Tell the caller which one collided so the form can say so.
      if (await this.emailTaken(input.email)) throw new EmailTakenError();
      throw new UsernameTakenError(input.username);
    }
  }

  async emailTaken(email: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: users.accountId })
      .from(users)
      .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
    return !!row;
  }

  async getEmail(accountId: string): Promise<string | null> {
    const [row] = await this.db.select({ email: users.email }).from(users).where(eq(users.accountId, accountId));
    return row?.email ?? null;
  }

  /** Username or email, case-insensitive. Takes the same time whether or not the user exists. */
  async verifyLogin(login: string, password: string): Promise<LocalAccount | null> {
    const needle = login.trim().replace(/^@/, "").toLowerCase();
    const [row] = await this.db
      .select({ account: accounts, passwordHash: users.passwordHash })
      .from(users)
      .innerJoin(accounts, eq(users.accountId, accounts.id))
      .where(sql`lower(${users.email}) = ${needle} or lower(${accounts.username}) = ${needle}`)
      .limit(1);
    const ok = await verifyPassword(password, row?.passwordHash ?? (await dummyPasswordHash()));
    return ok && row ? row.account : null;
  }

  async createCode(input: {
    appId: string;
    accountId: string;
    redirectUri: string;
    scopes: string[];
    codeChallenge: string | null;
  }): Promise<string> {
    const code = randomSecret();
    await this.deleteExpiredCodes();
    await this.db.insert(oauthCodes).values({
      codeHash: digest(code),
      appId: input.appId,
      accountId: input.accountId,
      redirectUri: input.redirectUri,
      scopes: input.scopes.join(" "),
      codeChallenge: input.codeChallenge,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });
    return code;
  }

  /** Deletes the code as it's read, so a code can be exchanged at most once. */
  async consumeCode(code: string, appId: string) {
    const [row] = await this.db
      .delete(oauthCodes)
      .where(and(eq(oauthCodes.codeHash, digest(code)), eq(oauthCodes.appId, appId), gt(oauthCodes.expiresAt, new Date())))
      .returning();
    return row ? { ...row, scopes: row.scopes.split(" ") } : null;
  }

  async createToken(input: { appId: string; accountId: string | null; scopes: string[] }) {
    const token = randomSecret();
    const [row] = await this.db
      .insert(oauthTokens)
      .values({ tokenHash: digest(token), appId: input.appId, accountId: input.accountId, scopes: input.scopes.join(" ") })
      .returning({ createdAt: oauthTokens.createdAt });
    return { token, createdAt: row!.createdAt };
  }

  async findToken(token: string): Promise<AccessToken | null> {
    const [row] = await this.db
      .select({ token: oauthTokens, app: oauthApps, account: accounts })
      .from(oauthTokens)
      .innerJoin(oauthApps, eq(oauthTokens.appId, oauthApps.id))
      .leftJoin(accounts, eq(oauthTokens.accountId, accounts.id))
      .where(and(eq(oauthTokens.tokenHash, digest(token)), isNull(oauthTokens.revokedAt)));
    if (!row) return null;
    const lastUsed = row.token.lastUsedAt?.getTime() ?? 0;
    if (Date.now() - lastUsed > LAST_USED_RESOLUTION_MS) {
      await this.db.update(oauthTokens).set({ lastUsedAt: new Date() }).where(eq(oauthTokens.id, row.token.id));
    }
    return {
      id: row.token.id,
      app: toApp(row.app),
      account: row.account,
      scopes: row.token.scopes.split(" "),
      createdAt: row.token.createdAt,
    };
  }

  /** Revokes a token, but only for the app it was issued to (RFC 7009). */
  async revokeToken(token: string, appId: string) {
    await this.db
      .update(oauthTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(oauthTokens.tokenHash, digest(token)), eq(oauthTokens.appId, appId), isNull(oauthTokens.revokedAt)));
  }

  async deleteExpiredCodes() {
    await this.db.delete(oauthCodes).where(sql`${oauthCodes.expiresAt} < now()`);
  }
}

