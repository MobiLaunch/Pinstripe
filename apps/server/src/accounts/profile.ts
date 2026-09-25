/**
 * Editing your own account:
 *
 *   PATCH /api/v1/accounts/update_credentials   Mastodon's: name, bio, fields, locked, bot,
 *                                                discoverable, default post visibility
 *   GET   /api/v1/pinstripe/preferences        Pinstripe's own settings, which Mastodon
 *   PATCH /api/v1/pinstripe/preferences        has no API for (downloads, playback, theme…)
 *
 * Profile changes are sent to followers' servers as Update(Person).
 */
import type { Context as FedifyContext, RequestContext } from "@fedify/fedify";
import { Update } from "@fedify/vocab";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { type AccountSettings, BIO_MAX_LENGTH, checkImage, IMAGE_LIMITS, PROFILE_FIELDS_MAX, type Theme } from "@pinstripe/core";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { type AuthEnv, requireUser } from "../auth/middleware.ts";
import type { ContextData } from "../federation.ts";
import { fromMastodonVisibility, type MastodonAccount } from "../mastodon.ts";
import { describeProblem, MediaRejected } from "../media/process.ts";
import type { MediaService } from "../media/service.ts";
import { deliver } from "../remote/deliver.ts";
import type { AccountRow, Store } from "../store.ts";

export const DISPLAY_NAME_MAX = 30;
const FIELD_NAME_MAX = 255;
const FIELD_VALUE_MAX = 255;

export interface ProfileRoutesOptions {
  store: Store;
  media: MediaService;
  renderCredentialAccount: (c: Context, account: AccountRow) => Promise<MastodonAccount & { source: unknown }>;
  federationContext: (c: Context) => FedifyContext<ContextData>;
}

type Body = Record<string, unknown>;

/**
 * Reads a body that may be JSON (nested) or a form with bracketed keys
 * (`fields_attributes[0][name]`, `source[privacy]`), into one nested shape.
 */
async function readNested(c: Context): Promise<Body> {
  const type = c.req.header("content-type") ?? "";
  if (type.includes("application/json")) return ((await c.req.json().catch(() => ({}))) ?? {}) as Body;
  if (!type.includes("form")) return {};
  const form = await c.req.parseBody({ all: true });
  const out: Body = {};
  for (const [key, raw] of Object.entries(form)) {
    const value = Array.isArray(raw) ? raw.at(-1) : raw;
    const path = key.replace(/\]/g, "").split("[").filter(Boolean);
    let node = out;
    path.forEach((part, i) => {
      // Files (avatar, header) stay files; everything else is text.
      if (i === path.length - 1) node[part] = value instanceof File ? value : String(value);
      else node = (node[part] ??= {}) as Body;
    });
  }
  return out;
}

const bool = (v: unknown): boolean | undefined =>
  v === undefined || v === null ? undefined : v === true || v === "true" || v === "1" || v === "on";

/** `fields_attributes` as an array or as `{ "0": {...}, "1": {...} }`. */
function readFields(raw: unknown): { name: string; value: string }[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  const list = Array.isArray(raw) ? raw : typeof raw === "object" ? Object.values(raw as Body) : [];
  return list
    .map((f) => f as Body)
    .map((f) => ({ name: String(f?.name ?? "").trim(), value: String(f?.value ?? "").trim() }))
    .filter((f) => f.name || f.value);
}

/** Writes an uploaded image to a temp file for processing (MediaService removes it). */
async function toTempFile(file: File): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "pinstripe-upload-"));
  const target = path.join(dir, "upload");
  await writeFile(target, Buffer.from(await file.arrayBuffer()));
  return target;
}

export function profileRoutes({ store, media, renderCredentialAccount, federationContext }: ProfileRoutesOptions) {
  const app = new Hono<AuthEnv>();

  /** Tells followers' servers the profile changed. */
  async function announceProfile(c: Context, account: AccountRow) {
    const ctx = federationContext(c) as RequestContext<ContextData>;
    const actor = await ctx.getActor(account.id);
    if (!actor) return;
    await deliver(
      ctx,
      account.id,
      new Update({ id: new URL(`${actor.id!.href}#updates/${Date.now()}`), actor: actor.id, object: actor }),
      { followers: true },
    );
  }

  const updateCredentials = async (c: Context<AuthEnv>) => {
    const auth = requireUser(c, "write:accounts");
    if (!auth.ok) return auth.response;
    const { account } = auth.value;
    const body = await readNested(c);
    const errors: string[] = [];

    const patch: Parameters<Store["updateAccount"]>[1] = {};
    const settings: AccountSettings = { ...account.settings };

    if (body.display_name !== undefined) {
      const name = String(body.display_name).trim();
      if ([...name].length > DISPLAY_NAME_MAX) errors.push(`Display name is too long (maximum is ${DISPLAY_NAME_MAX} characters)`);
      patch.displayName = name || account.username;
    }
    if (body.note !== undefined) {
      const note = String(body.note).trim();
      if ([...note].length > BIO_MAX_LENGTH) errors.push(`Note is too long (maximum is ${BIO_MAX_LENGTH} characters)`);
      patch.bio = note;
    }
    const fields = readFields(body.fields_attributes);
    if (fields) {
      if (fields.length > PROFILE_FIELDS_MAX) errors.push(`Fields can't be more than ${PROFILE_FIELDS_MAX}`);
      if (fields.some((f) => f.name.length > FIELD_NAME_MAX || f.value.length > FIELD_VALUE_MAX)) errors.push("Fields are too long");
      // Verification (rel="me") is re-checked when links are verified; editing clears it.
      patch.fields = fields.map((f) => ({ ...f, verifiedAt: null }));
    }
    const bot = bool(body.bot);
    if (bot !== undefined) patch.bot = bot;
    const locked = bool(body.locked);
    if (locked !== undefined) settings.approveFollowers = locked;
    const discoverable = bool(body.discoverable);
    if (discoverable !== undefined) settings.listInDirectory = discoverable;
    const source = (body.source ?? {}) as Body;
    if (source.privacy !== undefined) {
      const visibility = fromMastodonVisibility(String(source.privacy));
      if (!visibility) errors.push("Privacy is invalid");
      else settings.defaultVisibility = visibility;
    }
    const images: { kind: "avatar" | "header"; file: File }[] = [];
    for (const kind of ["avatar", "header"] as const) {
      const file = body[kind];
      if (!(file instanceof File)) continue;
      const problems = checkImage({ mimeType: file.type, bytes: file.size });
      if (problems.length) errors.push(`${kind === "avatar" ? "Avatar" : "Header"}: ${describeProblem(problems[0]!)}`);
      else images.push({ kind, file });
    }
    if (errors.length) return c.json({ error: `Validation failed: ${errors.join(", ")}` }, 422);

    const replaced: string[] = [];
    for (const { kind, file } of images) {
      try {
        const key = await media.profileImage(account.id, kind, await toTempFile(file));
        if (kind === "avatar") patch.avatarKey = key;
        else patch.headerKey = key;
        const old = kind === "avatar" ? account.avatarKey : account.headerKey;
        if (old) replaced.push(old);
      } catch (error) {
        if (error instanceof MediaRejected) return c.json({ error: `Validation failed: ${error.message}` }, 422);
        throw error;
      }
    }

    const updated = await store.updateAccount(account.id, { ...patch, settings });
    await media.storage.delete(replaced).catch(() => {});
    await announceProfile(c, updated);
    return c.json(await renderCredentialAccount(c, updated));
  };
  // Avatars and banners are at most 15 MB each; refuse anything bigger before reading it.
  app.patch("/api/v1/accounts/update_credentials", bodyLimit({ maxSize: 2 * IMAGE_LIMITS.maxBytes + 64 * 1024 }), updateCredentials);

  const PREFS = ["allowVideoDownloads", "hideFollowerCounts", "autoplayVideos", "startMuted", "saveDataOnCellular"] as const;
  const THEMES: Theme[] = ["blue", "graphite"];

  const preferencesJson = (s: AccountSettings) => ({
    allow_video_downloads: s.allowVideoDownloads,
    hide_follower_counts: s.hideFollowerCounts,
    autoplay_videos: s.autoplayVideos,
    start_muted: s.startMuted,
    save_data_on_cellular: s.saveDataOnCellular,
    theme: s.theme,
  });
  const snake = (k: string) => k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

  app.get("/api/v1/pinstripe/preferences", (c) => {
    const auth = requireUser(c, "read:accounts");
    if (!auth.ok) return auth.response;
    return c.json(preferencesJson(auth.value.account.settings));
  });

  app.patch("/api/v1/pinstripe/preferences", async (c) => {
    const auth = requireUser(c, "write:accounts");
    if (!auth.ok) return auth.response;
    const body = await readNested(c);
    const settings: AccountSettings = { ...auth.value.account.settings };
    for (const key of PREFS) {
      const v = bool(body[snake(key)]);
      if (v !== undefined) settings[key] = v;
    }
    if (body.theme !== undefined) {
      if (!THEMES.includes(body.theme as Theme)) return c.json({ error: "Validation failed: Theme is invalid" }, 422);
      settings.theme = body.theme as Theme;
    }
    const updated = await store.updateAccount(auth.value.account.id, { settings });
    return c.json(preferencesJson(updated.settings));
  });

  return app;
}
