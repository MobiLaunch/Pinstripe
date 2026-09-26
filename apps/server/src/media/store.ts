import { and, asc, eq, inArray, isNull, lt } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { mediaAttachments } from "../db/schema.ts";
import { isUuid } from "../store.ts";

export type MediaRow = typeof mediaAttachments.$inferSelect;
export type NewMedia = typeof mediaAttachments.$inferInsert;

export class MediaStore {
  constructor(private readonly db: Db) {}

  async create(row: NewMedia): Promise<MediaRow> {
    const [created] = await this.db.insert(mediaAttachments).values(row).returning();
    return created!;
  }

  async get(id: string): Promise<MediaRow | null> {
    if (!isUuid(id)) return null;
    const [row] = await this.db.select().from(mediaAttachments).where(eq(mediaAttachments.id, id));
    return row ?? null;
  }

  async getMany(ids: string[]): Promise<MediaRow[]> {
    const valid = ids.filter(isUuid);
    return valid.length ? this.db.select().from(mediaAttachments).where(inArray(mediaAttachments.id, valid)) : [];
  }

  async update(id: string, patch: Partial<NewMedia>): Promise<MediaRow | null> {
    const [row] = await this.db.update(mediaAttachments).set(patch).where(eq(mediaAttachments.id, id)).returning();
    return row ?? null;
  }

  /** Media for many statuses at once, in each post's order. */
  async forStatuses(statusIds: string[]): Promise<Map<string, MediaRow[]>> {
    const result = new Map<string, MediaRow[]>();
    if (!statusIds.length) return result;
    const rows = await this.db
      .select()
      .from(mediaAttachments)
      .where(inArray(mediaAttachments.statusId, statusIds))
      .orderBy(asc(mediaAttachments.position));
    for (const row of rows) result.set(row.statusId!, [...(result.get(row.statusId!) ?? []), row]);
    return result;
  }

  async delete(ids: string[]) {
    if (ids.length) await this.db.delete(mediaAttachments).where(inArray(mediaAttachments.id, ids));
  }

  /** Uploads never attached to a post, older than `before`. */
  async unattachedBefore(before: Date): Promise<MediaRow[]> {
    return this.db
      .select()
      .from(mediaAttachments)
      .where(and(isNull(mediaAttachments.statusId), lt(mediaAttachments.createdAt, before)));
  }

  async stuckProcessing(before: Date): Promise<MediaRow[]> {
    return this.db
      .select()
      .from(mediaAttachments)
      .where(and(eq(mediaAttachments.state, "processing"), lt(mediaAttachments.createdAt, before)));
  }
}
