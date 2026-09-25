/**
 * Push notifications to phones through Expo's push service
 * (https://docs.expo.dev/push-notifications/sending-notifications/).
 *
 * The app registers its Expo push token against the sign-in it came from.
 * Each new notification is sent to the recipient's devices a moment after
 * it's recorded (so the transaction that made it has committed), unless
 * blocks, mutes or limits hide it. Tokens Expo says are dead are removed.
 */
import { and, count, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { accounts, markers, notifications, oauthTokens, pushDevices, statuses } from "../db/schema.ts";
import { type NotificationStore, onNotificationCreated } from "../notifications/store.ts";
import { hiddenNotification } from "../safety/sql.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const PUSH_TOKEN = /^(Exponent|Expo)PushToken\[[\w-]+\]$/;

export const isExpoPushToken = (token: string) => PUSH_TOKEN.test(token);

const TEXT: Record<string, string> = {
  follow: "followed you",
  follow_request: "asked to follow you",
  favourite: "liked your post",
  reblog: "boosted your post",
  mention: "mentioned you",
};

const plain = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  sound: "default";
  badge: number;
  data: { notificationId: string; type: string; statusId: string | null; accountId: string };
}

export class PushService {
  #pending = new Set<Promise<void>>();
  #stop: (() => void) | null = null;

  constructor(
    private readonly db: Db,
    private readonly notifications: NotificationStore,
    private readonly options: { fetch?: typeof fetch; accessToken?: string | null; delayMs?: number } = {},
  ) {}

  /** Starts sending pushes for new notifications. */
  start() {
    this.#stop ??= onNotificationCreated((id) => {
      const run = new Promise<void>((r) => setTimeout(r, this.options.delayMs ?? 500))
        .then(() => this.send(id))
        .catch((error) => console.error("Push failed", error))
        .finally(() => this.#pending.delete(run));
      this.#pending.add(run);
    });
    return this;
  }

  stop() {
    this.#stop?.();
    this.#stop = null;
  }

  /** Tests: waits for pushes in flight. */
  async idle() {
    while (this.#pending.size) await Promise.all(this.#pending);
  }

  async register(input: { expoToken: string; accountId: string; oauthTokenId: string; platform: string }) {
    await this.db
      .insert(pushDevices)
      .values(input)
      .onConflictDoUpdate({
        target: pushDevices.expoToken,
        set: { accountId: input.accountId, oauthTokenId: input.oauthTokenId, platform: input.platform },
      });
  }

  async unregister(expoToken: string, accountId: string) {
    await this.db.delete(pushDevices).where(and(eq(pushDevices.expoToken, expoToken), eq(pushDevices.accountId, accountId)));
  }

  /** The recipient's phones, only those whose sign-in is still valid. */
  async #devices(accountId: string): Promise<string[]> {
    const rows = await this.db
      .select({ token: pushDevices.expoToken })
      .from(pushDevices)
      .innerJoin(oauthTokens, eq(oauthTokens.id, pushDevices.oauthTokenId))
      .where(and(eq(pushDevices.accountId, accountId), isNull(oauthTokens.revokedAt)));
    return rows.map((r) => r.token);
  }

  async #unread(accountId: string): Promise<number> {
    const [marker] = await this.db
      .select()
      .from(markers)
      .where(and(eq(markers.accountId, accountId), eq(markers.timeline, "notifications")));
    const [row] = await this.db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.accountId, accountId), marker ? gt(notifications.id, marker.lastReadId) : undefined));
    return Math.min(row?.n ?? 0, 99);
  }

  /** Sends one notification to its recipient's phones. */
  async send(notificationId: string) {
    const n = await this.notifications.getShown(notificationId, hiddenNotification);
    if (!n) return;
    const devices = await this.#devices(n.accountId);
    if (!devices.length) return;
    const [from] = await this.db.select().from(accounts).where(eq(accounts.id, n.fromAccountId));
    if (!from) return;
    const [status] = n.statusId ? await this.db.select().from(statuses).where(eq(statuses.id, n.statusId)) : [];
    const shown = status?.reblogOfId ? (await this.db.select().from(statuses).where(eq(statuses.id, status.reblogOfId)))[0] : status;
    const name = from.displayName || from.username;
    const replied = n.type === "mention" && !!shown?.inReplyToId;
    const body = shown ? plain(shown.content).slice(0, 180) : "";
    const badge = await this.#unread(n.accountId);
    const messages: PushMessage[] = devices.map((to) => ({
      to,
      title: `${name} ${replied ? "replied to you" : (TEXT[n.type] ?? "")}`.trim(),
      body,
      sound: "default",
      badge,
      data: { notificationId: n.id, type: n.type, statusId: shown?.id ?? null, accountId: from.id },
    }));
    await this.#deliver(messages);
  }

  async #deliver(messages: PushMessage[]) {
    const doFetch = this.options.fetch ?? fetch;
    const headers: Record<string, string> = { accept: "application/json", "content-type": "application/json" };
    if (this.options.accessToken) headers.authorization = `Bearer ${this.options.accessToken}`;
    const res = await doFetch(EXPO_PUSH_URL, { method: "POST", headers, body: JSON.stringify(messages) });
    if (!res.ok) throw new Error(`Expo push answered ${res.status}`);
    const { data } = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
    // Tickets come back in the order sent; a dead token is removed.
    for (const [i, ticket] of (data ?? []).entries()) {
      if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
        await this.db.delete(pushDevices).where(eq(pushDevices.expoToken, messages[i]!.to));
      }
    }
  }
}
