/**
 * What Mastodon clients ask a server about itself before signing in:
 *
 *   GET /api/v2/instance   (and the older /api/v1/instance)
 *
 * Limits come from packages/core, the same numbers the server enforces.
 */
import { IMAGE_LIMITS, POST_MAX_LENGTH, VIDEO_LIMITS } from "@pinstripe/core";
import { type Context, Hono } from "hono";
import type { Store } from "../store.ts";

export function instanceRoutes(options: {
  store: Store;
  domain: string;
  version: string;
  registrationsOpen: boolean;
  origin: (c: Context) => string;
  contactEmail?: string | null;
}) {
  const app = new Hono();
  // Mastodon clients read the version to decide what they can use.
  const version = `4.3.0 (compatible; Pinstripe ${options.version})`;
  const description = "Short videos for the fediverse.";

  const configuration = {
    urls: { streaming: null },
    accounts: { max_featured_tags: 0, max_pinned_statuses: 0 },
    statuses: { max_characters: POST_MAX_LENGTH, max_media_attachments: 4, characters_reserved_per_url: 23 },
    media_attachments: {
      supported_mime_types: [...IMAGE_LIMITS.mimeTypes, ...VIDEO_LIMITS.mimeTypes],
      image_size_limit: IMAGE_LIMITS.maxBytes,
      image_matrix_limit: 4096 * 4096,
      video_size_limit: VIDEO_LIMITS.maxBytes,
      video_frame_rate_limit: 60,
      video_matrix_limit: VIDEO_LIMITS.maxLongEdge * VIDEO_LIMITS.maxShortEdge,
    },
    polls: { max_options: 0, max_characters_per_option: 0, min_expiration: 0, max_expiration: 0 },
    translation: { enabled: false },
  };

  app.get("/api/v2/instance", (c) =>
    c.json({
      domain: options.domain,
      title: "Pinstripe",
      version,
      source_url: "https://github.com/mobilaunch/pinstripe",
      description,
      usage: { users: { active_month: 0 } },
      thumbnail: { url: new URL("/favicon.ico", options.origin(c)).href },
      languages: ["en"],
      configuration,
      registrations: { enabled: options.registrationsOpen, approval_required: false, message: null },
      contact: { email: options.contactEmail ?? "", account: null },
      rules: [],
    }),
  );

  app.get("/api/v1/instance", async (c) =>
    c.json({
      uri: options.domain,
      title: "Pinstripe",
      short_description: description,
      description,
      email: options.contactEmail ?? "",
      version,
      urls: {},
      stats: { user_count: await options.store.countLocalAccounts(), status_count: 0, domain_count: 0 },
      thumbnail: null,
      languages: ["en"],
      registrations: options.registrationsOpen,
      approval_required: false,
      invites_enabled: false,
      configuration,
      contact_account: null,
      rules: [],
    }),
  );

  return app;
}
