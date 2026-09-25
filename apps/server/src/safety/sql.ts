/**
 * What blocks, mutes, server blocks and suspensions hide, as SQL fragments
 * that the status and notification queries share.
 */
import { type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { accounts, blocks, domainBlocks, mutes, notifications, statuses } from "../db/schema.ts";

/** The author of `account` blocks the viewer: then the viewer can't see their posts at all. */
export function blocksViewer(authorColumn: AnyPgColumn, viewerId: string): SQL {
  return sql`exists (select 1 from ${blocks} where ${blocks.accountId} = ${authorColumn} and ${blocks.targetAccountId} = ${viewerId})`;
}

/** A suspended author's posts are hidden from everyone. */
export function authorSuspended(authorColumn: AnyPgColumn): SQL {
  return sql`exists (select 1 from ${accounts} where ${accounts.id} = ${authorColumn} and ${accounts.suspendedAt} is not null)`;
}

/**
 * Accounts the viewer doesn't want to see, as a condition on an account id
 * expression: blocked by or blocking the viewer, muted (unless the mute ran
 * out), or on a server the viewer blocks. `forNotifications` skips mutes
 * that keep notifications on.
 */
function unwanted(accountId: SQL, viewerId: string, options: { forNotifications?: boolean } = {}): SQL {
  const muteApplies = options.forNotifications ? sql`and ${mutes.hideNotifications}` : sql``;
  return sql`(
    exists (select 1 from ${blocks} where (${blocks.accountId} = ${viewerId} and ${blocks.targetAccountId} = ${accountId})
      or (${blocks.accountId} = ${accountId} and ${blocks.targetAccountId} = ${viewerId}))
    or exists (select 1 from ${mutes} where ${mutes.accountId} = ${viewerId} and ${mutes.targetAccountId} = ${accountId}
      and (${mutes.expiresAt} is null or ${mutes.expiresAt} > now()) ${muteApplies})
    or exists (select 1 from ${accounts} a join ${domainBlocks} d on d.domain = a.domain
      where a.id = ${accountId} and d.account_id = ${viewerId})
  )`;
}

/**
 * Statuses to leave out of the viewer's timelines and threads: by someone
 * unwanted, or boosts of someone unwanted.
 */
export function hiddenStatus(viewerId: string | null): SQL | undefined {
  if (!viewerId) return undefined;
  const original = sql`(select o.account_id from ${statuses} o where o.id = ${statuses.reblogOfId})`;
  return sql`(${unwanted(sql`${statuses.accountId}`, viewerId)}
    or (${statuses.reblogOfId} is not null and ${unwanted(original, viewerId)}))`;
}

/** Notifications to leave out: from someone unwanted, or someone suspended. */
export function hiddenNotification(viewerId: string): SQL {
  return sql`(${unwanted(sql`${notifications.fromAccountId}`, viewerId, { forNotifications: true })}
    or ${authorSuspended(notifications.fromAccountId)})`;
}
