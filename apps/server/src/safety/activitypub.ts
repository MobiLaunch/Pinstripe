/**
 * Blocks and reports as ActivityPub: the Block we send when someone here
 * blocks a remote account, and the follow cleanup it implies.
 */
import type { Context } from "@fedify/fedify";
import { Block, Flag } from "@fedify/vocab";
import { type ContextData, INSTANCE_ACTOR } from "../federation.ts";
import { deliver } from "../remote/deliver.ts";
import { actorUri, buildFollow, buildFollowResponse, buildUndo } from "../statuses/activitypub.ts";
import { type AccountRow, isLocal } from "../store.ts";
import type { BlockRow, EndedFollows } from "./store.ts";

export function blockActivityUri(ctx: Context<unknown>, accountId: string, blockId: string): URL {
  return new URL(`${ctx.getActorUri(accountId).href}#blocks/${blockId}`);
}

export function buildBlock(ctx: Context<unknown>, block: BlockRow, target: AccountRow): Block {
  return new Block({
    id: block.uri ? new URL(block.uri) : blockActivityUri(ctx, block.accountId, block.id),
    actor: ctx.getActorUri(block.accountId),
    object: actorUri(ctx, target),
  });
}

/**
 * Tells a remote account's server about follows a local account just
 * ended: an Undo for our follow of them, a Reject for theirs of us.
 */
export async function tellEndedFollows(ctx: Context<ContextData>, localId: string, other: AccountRow, ended: EndedFollows) {
  if (isLocal(other)) return;
  if (ended.aToB) await deliver(ctx, localId, buildUndo(ctx, localId, buildFollow(ctx, ended.aToB, other)), { to: [other] });
  if (ended.bToA) await deliver(ctx, localId, buildFollowResponse(ctx, "reject", ended.bToA, other), { to: [other] });
}

/**
 * A report passed on to the reported account's server, sent by the
 * instance actor so the reporter stays anonymous (as Mastodon does).
 */
export async function forwardReport(
  ctx: Context<ContextData>,
  report: { id: string; comment: string },
  target: AccountRow,
  statusUris: string[],
) {
  if (isLocal(target)) return;
  const flag = new Flag({
    id: new URL(`/reports/${report.id}`, ctx.canonicalOrigin),
    actor: ctx.getActorUri(INSTANCE_ACTOR),
    content: report.comment,
    objects: [actorUri(ctx, target), ...statusUris.map((u) => new URL(u))],
  });
  await deliver(ctx, INSTANCE_ACTOR, flag, { to: [target] });
}
