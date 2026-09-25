import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { accounts, blocks, domainBlocks, follows, mutes, type ReportCategory, reports, users } from "../db/schema.ts";
import { uuidv7 } from "../ids.ts";
import { type AccountRow, isUuid, type Store } from "../store.ts";

export type BlockRow = typeof blocks.$inferSelect;
export type MuteRow = typeof mutes.$inferSelect;
export type ReportRow = typeof reports.$inferSelect;
export type Role = "user" | "moderator" | "admin";

export interface SafetyRelationship {
  blocking: boolean;
  blockedBy: boolean;
  muting: boolean;
  mutingNotifications: boolean;
  domainBlocking: boolean;
}

/** Follows between two accounts that a block or server block ends. */
export interface EndedFollows {
  /** a followed (or had asked to follow) b. */
  aToB: typeof follows.$inferSelect | null;
  bToA: typeof follows.$inferSelect | null;
}

/** "Example.COM." and "https://example.com/x" → "example.com". Null if it isn't a host. */
export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase().replace(/\.$/, "");
  if (!trimmed) return null;
  try {
    const host = new URL(/^[a-z]+:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`).host;
    return /^[a-z0-9-]+(\.[a-z0-9-]+)*(:\d+)?$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

export class SafetyStore {
  constructor(
    private readonly db: Db,
    private readonly store: Store,
  ) {}

  // Blocks

  /** Blocks `targetId`, ending follows both ways. Returns the follows it ended, so their servers can be told. */
  async block(accountId: string, targetId: string, uri: string | ((id: string) => string) | null): Promise<{ block: BlockRow; ended: EndedFollows }> {
    const ended = await this.#endFollows(accountId, targetId);
    const id = uuidv7();
    const [row] = await this.db
      .insert(blocks)
      .values({ id, accountId, targetAccountId: targetId, uri: typeof uri === "function" ? uri(id) : uri })
      .onConflictDoUpdate({ target: [blocks.accountId, blocks.targetAccountId], set: { accountId } })
      .returning();
    return { block: row!, ended };
  }

  async unblock(accountId: string, targetId: string): Promise<BlockRow | null> {
    const [row] = await this.db
      .delete(blocks)
      .where(and(eq(blocks.accountId, accountId), eq(blocks.targetAccountId, targetId)))
      .returning();
    return row ?? null;
  }

  async getBlockByUri(uri: string): Promise<BlockRow | null> {
    const [row] = await this.db.select().from(blocks).where(eq(blocks.uri, uri));
    return row ?? null;
  }

  /** Either blocks the other: they can't follow, see or reach each other. */
  async blockedEitherWay(a: string, b: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: blocks.id })
      .from(blocks)
      .where(
        or(and(eq(blocks.accountId, a), eq(blocks.targetAccountId, b)), and(eq(blocks.accountId, b), eq(blocks.targetAccountId, a))),
      )
      .limit(1);
    return rows.length > 0;
  }

  async #endFollows(a: string, b: string): Promise<EndedFollows> {
    return { aToB: await this.store.unfollow(a, b), bToA: await this.store.unfollow(b, a) };
  }

  // Mutes

  async mute(accountId: string, targetId: string, options: { hideNotifications: boolean; durationSeconds: number | null }) {
    const expiresAt = options.durationSeconds ? new Date(Date.now() + options.durationSeconds * 1000) : null;
    const [row] = await this.db
      .insert(mutes)
      .values({ id: uuidv7(), accountId, targetAccountId: targetId, hideNotifications: options.hideNotifications, expiresAt })
      .onConflictDoUpdate({
        target: [mutes.accountId, mutes.targetAccountId],
        set: { hideNotifications: options.hideNotifications, expiresAt },
      })
      .returning();
    return row!;
  }

  async unmute(accountId: string, targetId: string) {
    await this.db.delete(mutes).where(and(eq(mutes.accountId, accountId), eq(mutes.targetAccountId, targetId)));
  }

  /** Blocked or muted accounts, newest first, paged by the block's or mute's id. Expired mutes are left out. */
  async list(kind: "blocks" | "mutes", accountId: string, page: { maxId?: string; limit: number }) {
    const table = kind === "blocks" ? blocks : mutes;
    return this.db
      .select({ id: table.id, account: accounts })
      .from(table)
      .innerJoin(accounts, eq(accounts.id, table.targetAccountId))
      .where(
        and(
          eq(table.accountId, accountId),
          page.maxId && isUuid(page.maxId) ? lt(table.id, page.maxId) : undefined,
          kind === "mutes" ? sql`(${mutes.expiresAt} is null or ${mutes.expiresAt} > now())` : undefined,
        ),
      )
      .orderBy(desc(table.id))
      .limit(page.limit);
  }

  // Server blocks

  /** Blocks a server for one account, ending follows with every account there. */
  async blockDomain(accountId: string, domain: string): Promise<{ account: AccountRow; ended: EndedFollows }[]> {
    await this.db.insert(domainBlocks).values({ id: uuidv7(), accountId, domain }).onConflictDoNothing();
    const linked = await this.db
      .selectDistinct({ account: accounts })
      .from(follows)
      .innerJoin(accounts, or(eq(accounts.id, follows.followerId), eq(accounts.id, follows.followingId)))
      .where(
        and(
          or(eq(follows.followerId, accountId), eq(follows.followingId, accountId)),
          sql`lower(${accounts.domain}) = ${domain}`,
        ),
      );
    const ended = [];
    for (const { account } of linked) ended.push({ account, ended: await this.#endFollows(accountId, account.id) });
    return ended;
  }

  async unblockDomain(accountId: string, domain: string) {
    await this.db.delete(domainBlocks).where(and(eq(domainBlocks.accountId, accountId), eq(domainBlocks.domain, domain)));
  }

  async domainBlocks(accountId: string, page: { maxId?: string; limit: number }) {
    return this.db
      .select()
      .from(domainBlocks)
      .where(and(eq(domainBlocks.accountId, accountId), page.maxId && isUuid(page.maxId) ? lt(domainBlocks.id, page.maxId) : undefined))
      .orderBy(desc(domainBlocks.id))
      .limit(page.limit);
  }

  async blocksDomain(accountId: string, domain: string | null): Promise<boolean> {
    if (!domain) return false;
    const rows = await this.db
      .select({ id: domainBlocks.id })
      .from(domainBlocks)
      .where(and(eq(domainBlocks.accountId, accountId), eq(domainBlocks.domain, domain.toLowerCase())));
    return rows.length > 0;
  }

  /** The block, mute and server-block parts of Mastodon's Relationship. */
  async relationships(viewerId: string, targets: AccountRow[]): Promise<Map<string, SafetyRelationship>> {
    const ids = targets.map((t) => t.id);
    const result = new Map(
      targets.map((t) => [t.id, { blocking: false, blockedBy: false, muting: false, mutingNotifications: false, domainBlocking: false }]),
    );
    if (!ids.length) return result;
    const [blockRows, muteRows, domainRows] = await Promise.all([
      this.db
        .select()
        .from(blocks)
        .where(
          or(
            and(eq(blocks.accountId, viewerId), inArray(blocks.targetAccountId, ids)),
            and(eq(blocks.targetAccountId, viewerId), inArray(blocks.accountId, ids)),
          ),
        ),
      this.db
        .select()
        .from(mutes)
        .where(
          and(
            eq(mutes.accountId, viewerId),
            inArray(mutes.targetAccountId, ids),
            sql`(${mutes.expiresAt} is null or ${mutes.expiresAt} > now())`,
          ),
        ),
      this.db.select({ domain: domainBlocks.domain }).from(domainBlocks).where(eq(domainBlocks.accountId, viewerId)),
    ]);
    for (const b of blockRows) {
      if (b.accountId === viewerId) result.get(b.targetAccountId)!.blocking = true;
      else result.get(b.accountId)!.blockedBy = true;
    }
    for (const m of muteRows) {
      const r = result.get(m.targetAccountId)!;
      r.muting = true;
      r.mutingNotifications = m.hideNotifications;
    }
    const blockedDomains = new Set(domainRows.map((d) => d.domain));
    for (const t of targets) if (t.domain && blockedDomains.has(t.domain.toLowerCase())) result.get(t.id)!.domainBlocking = true;
    return result;
  }

  // Reports

  async report(input: {
    accountId: string;
    targetAccountId: string;
    statusIds: string[];
    comment: string;
    category: ReportCategory;
    forward: boolean;
    uri?: string | null;
  }): Promise<ReportRow> {
    const [row] = await this.db
      .insert(reports)
      .values({ id: uuidv7(), ...input, uri: input.uri ?? null })
      .onConflictDoNothing({ target: reports.uri })
      .returning();
    if (row) return row;
    // The same Flag delivered twice.
    const [existing] = await this.db.select().from(reports).where(eq(reports.uri, input.uri!));
    return existing!;
  }

  async getReport(id: string): Promise<ReportRow | null> {
    if (!isUuid(id)) return null;
    const [row] = await this.db.select().from(reports).where(eq(reports.id, id));
    return row ?? null;
  }

  /** Newest first. `resolved` picks open (false) or resolved (true) reports. */
  async reports(options: { resolved: boolean; maxId?: string; sinceId?: string; limit: number }) {
    return this.db
      .select()
      .from(reports)
      .where(
        and(
          options.resolved ? isNotNull(reports.actionTakenAt) : isNull(reports.actionTakenAt),
          options.maxId && isUuid(options.maxId) ? lt(reports.id, options.maxId) : undefined,
          options.sinceId && isUuid(options.sinceId) ? gt(reports.id, options.sinceId) : undefined,
        ),
      )
      .orderBy(desc(reports.id))
      .limit(options.limit);
  }

  async resolveReport(id: string, moderatorId: string | null): Promise<ReportRow | null> {
    const [row] = await this.db
      .update(reports)
      .set(moderatorId ? { actionTakenAt: new Date(), actionTakenByAccountId: moderatorId } : { actionTakenAt: null, actionTakenByAccountId: null })
      .where(eq(reports.id, id))
      .returning();
    return row ?? null;
  }

  // Moderation

  async role(accountId: string): Promise<Role> {
    const [row] = await this.db.select({ role: users.role }).from(users).where(eq(users.accountId, accountId));
    return row?.role ?? "user";
  }

  async setRole(accountId: string, role: Role) {
    await this.db.update(users).set({ role }).where(eq(users.accountId, accountId));
  }

  /** Moderators and admins, to tell about new reports. */
  async moderators(): Promise<string[]> {
    const rows = await this.db
      .select({ id: users.accountId })
      .from(users)
      .where(inArray(users.role, ["moderator", "admin"]));
    return rows.map((r) => r.id);
  }

  async suspend(accountId: string, suspended: boolean) {
    await this.db
      .update(accounts)
      .set({ suspendedAt: suspended ? new Date() : null })
      .where(eq(accounts.id, accountId));
  }
}
