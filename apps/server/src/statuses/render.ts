import type { Context as FedifyContext } from "@fedify/fedify";
import type { Context } from "hono";
import type { ContextData } from "../federation.ts";
import type { MastodonAccount, MastodonStatus } from "../mastodon.ts";
import { serializeStatus } from "../mastodon.ts";
import type { AccountRow } from "../store.ts";
import { noteUri } from "./activitypub.ts";
import type { StatusRow, StatusStore, StatusView } from "./store.ts";

export interface StatusRenderer {
  /** Rows → Mastodon statuses, as the viewer sees them. */
  rows(c: Context, rows: StatusRow[], viewerId: string | null): Promise<MastodonStatus[]>;
  views(c: Context, views: StatusView[]): Promise<MastodonStatus[]>;
}

/** Serializes pages of statuses, rendering each account once per request. */
export function statusRenderer(options: {
  statuses: StatusStore;
  renderAccount: (c: Context, account: AccountRow) => Promise<MastodonAccount>;
  federationContext: (c: Context) => FedifyContext<ContextData>;
}): StatusRenderer {
  async function views(c: Context, list: StatusView[]): Promise<MastodonStatus[]> {
    const ctx = options.federationContext(c);
    const accounts = new Map<string, Promise<MastodonAccount>>();
    const accountJson = (a: AccountRow) => {
      if (!accounts.has(a.id)) accounts.set(a.id, options.renderAccount(c, a));
      return accounts.get(a.id)!;
    };
    const one = async (view: StatusView): Promise<MastodonStatus> => {
      const { status, account } = view;
      const reblog = view.reblog ? await one(view.reblog) : null;
      const localUri = noteUri(ctx, status).href;
      const mentions = await Promise.all(
        view.mentions.map(async (m) => {
          const json = await accountJson(m);
          return { id: m.id, username: m.username, acct: json.acct, url: json.url };
        }),
      );
      return serializeStatus(
        view,
        await accountJson(account),
        {
          uri: status.uri ?? (view.reblog ? `${localUri}/activity` : localUri),
          url: status.uri ? status.url : view.reblog ? null : new URL(`/@${account.username}/${status.id}`, ctx.canonicalOrigin).href,
          tagUrl: (tag) => new URL(`/tags/${encodeURIComponent(tag)}`, ctx.canonicalOrigin).href,
        },
        reblog,
        mentions,
      );
    };
    return Promise.all(list.map(one));
  }

  return {
    views,
    rows: async (c, rows, viewerId) => views(c, await options.statuses.hydrate(rows, viewerId)),
  };
}
