/**
 * Blocks, mutes, server blocks and reports (Mastodon's API), plus the
 * moderator side of reports:
 *
 *   POST   /api/v1/accounts/:id/block     and /unblock    Block / Undo(Block) to remote accounts
 *   POST   /api/v1/accounts/:id/mute      and /unmute     { notifications, duration }
 *   GET    /api/v1/blocks, /api/v1/mutes
 *   GET    /api/v1/domain_blocks          POST and DELETE { domain }
 *   POST   /api/v1/reports                { account_id, status_ids[], comment, category, forward }  forward: Flag to their server
 *   GET    /api/v1/admin/reports          ?resolved=true; moderators and admins only
 *   GET    /api/v1/admin/reports/:id      POST …/resolve, …/reopen
 *   POST   /api/v1/admin/accounts/:id/action     { type: "suspend" | "silence" | "none", report_id }
 *   POST   /api/v1/admin/accounts/:id/unsuspend  and /unsilence
 *   GET    /api/v1/admin/domain_blocks    POST { domain, severity, public_comment, private_comment }, PUT and DELETE /:id
 *   GET    /api/v1/instance/domain_blocks public list of blocked servers
 *   GET    /api/v1/pinstripe/admin/log    every moderator action
 */
import { createHash } from "node:crypto";
import type { Context as FedifyContext } from "@fedify/fedify";
import { type Context, Hono } from "hono";
import { type AuthEnv, requireUser } from "../auth/middleware.ts";
import type { ReportCategory } from "../db/schema.ts";
import type { ContextData } from "../federation.ts";
import { notFound, readLimit, readParams, setLinkHeader, truthy } from "../http.ts";
import type { MastodonAccount, MastodonRelationship, MastodonStatus } from "../mastodon.ts";
import { deliver } from "../remote/deliver.ts";
import { buildUndo, noteUri } from "../statuses/activitypub.ts";
import type { StatusRow, StatusStore } from "../statuses/store.ts";
import { type AccountRow, isLocal, type LocalAccount, type Store } from "../store.ts";
import { blockActivityUri, buildBlock, forwardReport, tellEndedFollows } from "./activitypub.ts";
import { normalizeDomain, type ReportRow, type SafetyStore } from "./store.ts";

const CATEGORIES: readonly ReportCategory[] = ["spam", "legal", "violation", "other"];
const COMMENT_MAX = 1000;

export interface SafetyRoutesOptions {
  store: Store;
  statuses: StatusStore;
  safety: SafetyStore;
  renderAccount: (c: Context, account: AccountRow) => Promise<MastodonAccount>;
  renderStatuses: (c: Context, rows: StatusRow[], viewerId: string | null) => Promise<MastodonStatus[]>;
  relationship: (viewerId: string, id: string) => Promise<MastodonRelationship>;
  federationContext: (c: Context) => FedifyContext<ContextData>;
}

export function safetyRoutes(options: SafetyRoutesOptions) {
  const { store, statuses, safety, renderAccount, relationship, federationContext } = options;
  const app = new Hono<AuthEnv>();

  /** How the log names an account: its handle. */
  const handleOf = (a: AccountRow) => `@${a.username}${a.domain ? `@${a.domain}` : ""}`;

  /** The account in `:id`, if it exists and isn't the viewer. */
  async function targetOf(c: Context, me: LocalAccount) {
    const target = await store.getAccount(c.req.param("id") ?? "");
    return target && target.id !== me.id ? target : null;
  }

  app.post("/api/v1/accounts/:id/block", async (c) => {
    const auth = requireUser(c, "write:blocks", "follow");
    if (!auth.ok) return auth.response;
    const me = auth.value.account;
    const target = await targetOf(c, me);
    if (!target) return notFound(c);
    const ctx = federationContext(c);
    const { block, ended } = await safety.block(me.id, target.id, (id) => blockActivityUri(ctx, me.id, id).href);
    if (!isLocal(target)) {
      await tellEndedFollows(ctx, me.id, target, ended);
      await deliver(ctx, me.id, buildBlock(ctx, block, target), { to: [target] });
    }
    return c.json(await relationship(me.id, target.id));
  });

  app.post("/api/v1/accounts/:id/unblock", async (c) => {
    const auth = requireUser(c, "write:blocks", "follow");
    if (!auth.ok) return auth.response;
    const me = auth.value.account;
    const target = await targetOf(c, me);
    if (!target) return notFound(c);
    const removed = await safety.unblock(me.id, target.id);
    if (removed && !isLocal(target)) {
      const ctx = federationContext(c);
      await deliver(ctx, me.id, buildUndo(ctx, me.id, buildBlock(ctx, removed, target)), { to: [target] });
    }
    return c.json(await relationship(me.id, target.id));
  });

  app.post("/api/v1/accounts/:id/mute", async (c) => {
    const auth = requireUser(c, "write:mutes", "follow");
    if (!auth.ok) return auth.response;
    const me = auth.value.account;
    const target = await targetOf(c, me);
    if (!target) return notFound(c);
    const p = await readParams(c);
    const duration = Number.parseInt(p.duration ?? "0", 10);
    await safety.mute(me.id, target.id, {
      // Mastodon mutes notifications too unless told otherwise.
      hideNotifications: p.notifications === undefined ? true : truthy(p.notifications),
      durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
    });
    return c.json(await relationship(me.id, target.id));
  });

  app.post("/api/v1/accounts/:id/unmute", async (c) => {
    const auth = requireUser(c, "write:mutes", "follow");
    if (!auth.ok) return auth.response;
    const me = auth.value.account;
    const target = await targetOf(c, me);
    if (!target) return notFound(c);
    await safety.unmute(me.id, target.id);
    return c.json(await relationship(me.id, target.id));
  });

  for (const kind of ["blocks", "mutes"] as const) {
    app.get(`/api/v1/${kind}`, async (c) => {
      const auth = requireUser(c, `read:${kind}`, "follow");
      if (!auth.ok) return auth.response;
      const rows = await safety.list(kind, auth.value.account.id, { maxId: c.req.query("max_id"), limit: readLimit(c, 40, 80) });
      setLinkHeader(c, rows.map((r) => r.id));
      return c.json(await Promise.all(rows.map((r) => renderAccount(c, r.account))));
    });
  }

  // Server blocks

  app.get("/api/v1/domain_blocks", async (c) => {
    const auth = requireUser(c, "read:blocks", "follow");
    if (!auth.ok) return auth.response;
    const rows = await safety.domainBlocks(auth.value.account.id, { maxId: c.req.query("max_id"), limit: readLimit(c, 100, 200) });
    setLinkHeader(c, rows.map((r) => r.id));
    return c.json(rows.map((r) => r.domain));
  });

  app.post("/api/v1/domain_blocks", async (c) => {
    const auth = requireUser(c, "write:blocks", "follow");
    if (!auth.ok) return auth.response;
    const me = auth.value.account;
    const domain = normalizeDomain((await readParams(c)).domain ?? "");
    if (!domain) return c.json({ error: "Validation failed: Domain is invalid" }, 422);
    const ctx = federationContext(c);
    for (const { account, ended } of await safety.blockDomain(me.id, domain)) await tellEndedFollows(ctx, me.id, account, ended);
    return c.json({});
  });

  app.delete("/api/v1/domain_blocks", async (c) => {
    const auth = requireUser(c, "write:blocks", "follow");
    if (!auth.ok) return auth.response;
    const domain = normalizeDomain((await readParams(c)).domain ?? "");
    if (!domain) return c.json({ error: "Validation failed: Domain is invalid" }, 422);
    await safety.unblockDomain(auth.value.account.id, domain);
    return c.json({});
  });

  // Reports

  /** Mastodon's Report entity, as the reporter sees it. */
  async function reportJson(c: Context, report: ReportRow) {
    const target = await store.getAccount(report.targetAccountId);
    return {
      id: report.id,
      action_taken: report.actionTakenAt !== null,
      action_taken_at: report.actionTakenAt?.toISOString() ?? null,
      category: report.category,
      comment: report.comment,
      forwarded: report.forward,
      created_at: report.createdAt.toISOString(),
      status_ids: report.statusIds,
      rule_ids: [],
      target_account: target ? await renderAccount(c, target) : null,
    };
  }

  app.post("/api/v1/reports", async (c) => {
    const auth = requireUser(c, "write:reports");
    if (!auth.ok) return auth.response;
    const me = auth.value.account;
    const p = await readParams(c);
    const target = await store.getAccount(p.account_id ?? "");
    if (!target || target.id === me.id) return c.json({ error: "Validation failed: Account can't be blank" }, 422);
    const comment = (p.comment ?? "").trim();
    if ([...comment].length > COMMENT_MAX) return c.json({ error: `Validation failed: Comment is too long (maximum is ${COMMENT_MAX} characters)` }, 422);
    const category = (CATEGORIES as readonly string[]).includes(p.category ?? "") ? (p.category as ReportCategory) : "other";

    // Only posts by the reported account that the reporter can see.
    const statusIds: string[] = [];
    for (const id of new Set((p.status_ids ?? "").split(/[\s,]+/).filter(Boolean))) {
      const status = await statuses.getVisible(id, me.id);
      if (status?.accountId === target.id) statusIds.push(status.id);
    }
    const report = await safety.report({
      accountId: me.id,
      targetAccountId: target.id,
      statusIds,
      comment,
      category,
      forward: truthy(p.forward) && !isLocal(target),
    });
    if (report.forward) {
      const ctx = federationContext(c);
      const uris = await Promise.all(statusIds.map(async (id) => noteUri(ctx, (await statuses.get(id))!).href));
      await forwardReport(ctx, report, target, uris);
    }
    return c.json(await reportJson(c, report));
  });

  // Moderation

  async function requireModerator(c: Context<AuthEnv>, scope: string) {
    const auth = requireUser(c, scope);
    if (!auth.ok) return auth;
    const role = await safety.role(auth.value.account.id);
    if (role === "user") return { ok: false as const, response: c.json({ error: "This action is not allowed" }, 403) };
    return auth;
  }

  /** Mastodon's Admin::Report, trimmed to what moderators here need. */
  async function adminReportJson(c: Context, report: ReportRow) {
    const [reporter, target, moderator] = await Promise.all([
      store.getAccount(report.accountId),
      store.getAccount(report.targetAccountId),
      report.actionTakenByAccountId ? store.getAccount(report.actionTakenByAccountId) : null,
    ]);
    const posts = (await Promise.all(report.statusIds.map((id) => statuses.get(id)))).filter((s) => s !== null);
    const adminAccount = async (a: AccountRow | null) =>
      a
        ? { id: a.id, username: a.username, domain: a.domain, suspended: a.suspendedAt !== null, silenced: a.silencedAt !== null, account: await renderAccount(c, a) }
        : null;
    return {
      id: report.id,
      action_taken: report.actionTakenAt !== null,
      action_taken_at: report.actionTakenAt?.toISOString() ?? null,
      category: report.category,
      comment: report.comment,
      forwarded: report.forward,
      created_at: report.createdAt.toISOString(),
      updated_at: (report.actionTakenAt ?? report.createdAt).toISOString(),
      account: await adminAccount(reporter),
      target_account: await adminAccount(target),
      action_taken_by_account: await adminAccount(moderator),
      statuses: await options.renderStatuses(c, posts, null),
      rules: [],
    };
  }

  app.get("/api/v1/admin/reports", async (c) => {
    const auth = await requireModerator(c, "admin:read:reports");
    if (!auth.ok) return auth.response;
    const rows = await safety.reports({
      resolved: truthy(c.req.query("resolved")),
      maxId: c.req.query("max_id"),
      sinceId: c.req.query("since_id"),
      limit: readLimit(c, 20, 100),
    });
    setLinkHeader(c, rows.map((r) => r.id));
    return c.json(await Promise.all(rows.map((r) => adminReportJson(c, r))));
  });

  app.get("/api/v1/admin/reports/:id", async (c) => {
    const auth = await requireModerator(c, "admin:read:reports");
    if (!auth.ok) return auth.response;
    const report = await safety.getReport(c.req.param("id"));
    return report ? c.json(await adminReportJson(c, report)) : notFound(c);
  });

  for (const action of ["resolve", "reopen"] as const) {
    app.post(`/api/v1/admin/reports/:id/${action}`, async (c) => {
      const auth = await requireModerator(c, "admin:write:reports");
      if (!auth.ok) return auth.response;
      const report = await safety.resolveReport(c.req.param("id"), action === "resolve" ? auth.value.account.id : null);
      if (!report) return notFound(c);
      const target = await store.getAccount(report.targetAccountId);
      await safety.log(auth.value.account.id, `${action}_report`, report.id, target ? handleOf(target) : "");
      return c.json(await adminReportJson(c, report));
    });
  }

  app.post("/api/v1/admin/accounts/:id/action", async (c) => {
    const auth = await requireModerator(c, "admin:write:accounts");
    if (!auth.ok) return auth.response;
    const me = auth.value.account.id;
    const target = await store.getAccount(c.req.param("id"));
    if (!target) return notFound(c);
    const p = await readParams(c);
    if (p.type !== "suspend" && p.type !== "silence" && p.type !== "none") {
      return c.json({ error: "Validation failed: Type is not supported" }, 422);
    }
    if (p.type !== "none") {
      if ((await safety.role(target.id)) !== "user") return c.json({ error: "Moderators can't be suspended or limited" }, 403);
      if (p.type === "suspend") await safety.suspend(target.id, true);
      else await safety.silence(target.id, true);
      await safety.log(me, p.type === "suspend" ? "suspend" : "limit", target.id, handleOf(target));
    }
    // Acting on a report resolves it, as on Mastodon.
    if (p.report_id && (await safety.resolveReport(p.report_id, me))) await safety.log(me, "resolve_report", p.report_id, handleOf(target));
    return c.json({});
  });

  for (const [path, undo] of [
    ["unsuspend", "suspend"],
    ["unsilence", "silence"],
  ] as const) {
    app.post(`/api/v1/admin/accounts/:id/${path}`, async (c) => {
      const auth = await requireModerator(c, "admin:write:accounts");
      if (!auth.ok) return auth.response;
      const target = await store.getAccount(c.req.param("id"));
      if (!target) return notFound(c);
      if (undo === "suspend") await safety.suspend(target.id, false);
      else await safety.silence(target.id, false);
      await safety.log(auth.value.account.id, undo === "suspend" ? "unsuspend" : "unlimit", target.id, handleOf(target));
      return c.json({});
    });
  }

  // Server-wide blocks (Mastodon's admin domain blocks)

  type ServerBlock = Awaited<ReturnType<SafetyStore["serverBlocks"]>>[number];
  const serverBlockJson = (b: ServerBlock) => ({
    id: b.id,
    domain: b.domain,
    created_at: b.createdAt.toISOString(),
    severity: b.severity,
    reject_media: b.severity === "suspend",
    reject_reports: false,
    private_comment: b.privateComment || null,
    public_comment: b.publicComment || null,
    obfuscate: false,
  });

  app.get("/api/v1/admin/domain_blocks", async (c) => {
    const auth = await requireModerator(c, "admin:read");
    if (!auth.ok) return auth.response;
    return c.json((await safety.serverBlocks()).map(serverBlockJson));
  });

  app.get("/api/v1/admin/domain_blocks/:id", async (c) => {
    const auth = await requireModerator(c, "admin:read");
    if (!auth.ok) return auth.response;
    const block = await safety.getServerBlock(c.req.param("id"));
    return block ? c.json(serverBlockJson(block)) : notFound(c);
  });

  async function saveServerBlock(c: Context<AuthEnv>, existing: ServerBlock | null) {
    const auth = await requireModerator(c, "admin:write");
    if (!auth.ok) return auth.response;
    const p = await readParams(c);
    const domain = existing?.domain ?? normalizeDomain(p.domain ?? "");
    if (!domain) return c.json({ error: "Validation failed: Domain is invalid" }, 422);
    if (domain === new URL(federationContext(c).canonicalOrigin).host) return c.json({ error: "Validation failed: That's this server" }, 422);
    const severity = p.severity ?? existing?.severity ?? "silence";
    if (severity !== "silence" && severity !== "suspend") return c.json({ error: "Validation failed: Severity is not supported" }, 422);
    const block = await safety.blockServer({
      domain,
      severity,
      publicComment: (p.public_comment ?? existing?.publicComment ?? "").slice(0, 1000),
      privateComment: (p.private_comment ?? existing?.privateComment ?? "").slice(0, 1000),
    });
    await safety.log(auth.value.account.id, severity === "suspend" ? "suspend_server" : "limit_server", domain, domain);
    return c.json(serverBlockJson(block));
  }

  app.post("/api/v1/admin/domain_blocks", (c) => saveServerBlock(c, null));
  app.put("/api/v1/admin/domain_blocks/:id", async (c) => {
    const existing = await safety.getServerBlock(c.req.param("id"));
    return existing ? saveServerBlock(c, existing) : notFound(c);
  });

  app.delete("/api/v1/admin/domain_blocks/:id", async (c) => {
    const auth = await requireModerator(c, "admin:write");
    if (!auth.ok) return auth.response;
    const removed = await safety.unblockServer(c.req.param("id"));
    if (!removed) return notFound(c);
    await safety.log(auth.value.account.id, "unblock_server", removed.domain, removed.domain);
    return c.json({});
  });

  /** Public, as on Mastodon: which servers this one blocks, and why. */
  app.get("/api/v1/instance/domain_blocks", async (c) =>
    c.json(
      (await safety.serverBlocks()).map((b) => ({
        domain: b.domain,
        digest: createHash("sha256").update(b.domain).digest("hex"),
        severity: b.severity,
        comment: b.publicComment || null,
      })),
    ),
  );

  // The moderation log (Pinstripe's own; Mastodon only shows it on the web).

  app.get("/api/v1/pinstripe/admin/log", async (c) => {
    const auth = await requireModerator(c, "admin:read");
    if (!auth.ok) return auth.response;
    const rows = await safety.logEntries({ maxId: c.req.query("max_id"), limit: readLimit(c, 40, 100) });
    setLinkHeader(c, rows.map((r) => r.entry.id));
    return c.json(
      rows.map(({ entry, moderator }) => ({
        id: entry.id,
        action: entry.action,
        target: entry.target,
        summary: entry.summary,
        created_at: entry.createdAt.toISOString(),
        moderator: moderator ? { id: moderator.id, username: moderator.username } : null,
      })),
    );
  });

  return app;
}
