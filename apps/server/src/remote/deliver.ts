import type { Context } from "@fedify/fedify";
import type { Activity } from "@fedify/vocab";
import type { ContextData } from "../federation.ts";
import { type AccountRow, asRecipient, type Recipient } from "../store.ts";

/**
 * Sends an activity from a local account to other servers: to its remote
 * followers (`followers`), and/or to specific accounts (`to`: mentioned
 * people, the author of a post being liked or replied to). Local accounts
 * in `to` are skipped; they read the same database. Delivery is queued and
 * retried by Fedify and never fails the caller.
 */
export async function deliver(
  ctx: Context<ContextData>,
  senderId: string,
  activity: Activity,
  audience: { followers?: boolean; to?: (AccountRow | null | undefined)[] },
) {
  const recipients = new Map<string, Recipient>();
  if (audience.followers) {
    for (const r of await ctx.data.store.remoteFollowers(senderId)) recipients.set(r.uri, r);
  }
  for (const account of audience.to ?? []) {
    const r = account && account.domain !== null ? asRecipient(account) : null;
    if (r) recipients.set(r.uri, r);
  }
  // Nobody to tell: skip it, which also skips signing (and generating keys).
  if (!recipients.size) return;
  try {
    await ctx.sendActivity(
      { identifier: senderId },
      [...recipients.values()].map((r) => ({
        id: new URL(r.uri),
        inboxId: new URL(r.inboxUri),
        endpoints: r.sharedInboxUri ? { sharedInbox: new URL(r.sharedInboxUri) } : null,
      })),
      activity,
      { preferSharedInbox: true },
    );
  } catch (error) {
    console.error("Failed to queue delivery", activity.id?.href, error);
  }
}
