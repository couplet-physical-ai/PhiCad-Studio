import type { Kysely } from "kysely";
import type { Database, FeedbackRow, NewFeedback } from "../db/types.ts";
import type { FeedbackFilters, FeedbackStatus } from "../types.ts";

function generateUUIDv7(): string {
  const timestamp = Date.now();
  const uuid = crypto.randomUUID();
  const hex = timestamp.toString(16).padStart(12, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${uuid.slice(15)}`;
}

export class FeedbackService {
  constructor(private db: Kysely<Database>) {}

  async create(data: Omit<NewFeedback, "id" | "created_at" | "updated_at" | "status">): Promise<string> {
    const id = generateUUIDv7();
    const now = new Date().toISOString();

    await this.db
      .insertInto("feedback")
      .values({
        ...data,
        id,
        status: "new",
        created_at: now,
        updated_at: now,
      })
      .execute();

    return id;
  }

  async findById(id: string): Promise<FeedbackRow | undefined> {
    return this.db
      .selectFrom("feedback")
      .selectAll()
      .where("id", "=", id)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
  }

  async list(filters: FeedbackFilters): Promise<{ feedbacks: FeedbackRow[]; total: number }> {
    let query = this.db.selectFrom("feedback").where("deleted_at", "is", null);

    if (filters.type) {
      query = query.where("type", "=", filters.type);
    }
    if (filters.status) {
      query = query.where("status", "=", filters.status);
    }
    if (filters.platform) {
      query = query.where("platform", "=", filters.platform);
    }
    if (filters.appVersion) {
      query = query.where("app_version", "=", filters.appVersion);
    }
    if (filters.email) {
      query = query.where("email", "like", `%${filters.email}%`);
    }
    if (filters.search) {
      query = query.where("message", "like", `%${filters.search}%`);
    }
    if (filters.dateFrom) {
      query = query.where("received_at", ">=", filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.where("received_at", "<=", filters.dateTo);
    }

    // Count
    const countResult = await query
      .select(this.db.fn.countAll().as("count"))
      .executeTakeFirst();
    const total = Number(countResult?.count ?? 0);

    // Sort
    const sortCol = (["received_at", "type", "status", "app_version", "created_at"] as const).includes(
      filters.sortBy as any
    )
      ? (filters.sortBy as any)
      : "received_at";

    const feedbacks = await this.db
      .selectFrom("feedback")
      .selectAll()
      .where("deleted_at", "is", null)
      .$if(!!filters.type, (qb) => qb.where("type", "=", filters.type!))
      .$if(!!filters.status, (qb) => qb.where("status", "=", filters.status!))
      .$if(!!filters.platform, (qb) => qb.where("platform", "=", filters.platform!))
      .$if(!!filters.appVersion, (qb) => qb.where("app_version", "=", filters.appVersion!))
      .$if(!!filters.email, (qb) => qb.where("email", "like", `%${filters.email}%`))
      .$if(!!filters.search, (qb) => qb.where("message", "like", `%${filters.search}%`))
      .$if(!!filters.dateFrom, (qb) => qb.where("received_at", ">=", filters.dateFrom!))
      .$if(!!filters.dateTo, (qb) => qb.where("received_at", "<=", filters.dateTo!))
      .orderBy(sortCol, filters.sortOrder)
      .limit(filters.perPage)
      .offset((filters.page - 1) * filters.perPage)
      .execute();

    return { feedbacks, total };
  }

  async updateStatus(id: string, status: FeedbackStatus, notes?: string): Promise<boolean> {
    const now = new Date().toISOString();
    const values: Record<string, any> = { status, updated_at: now };
    if (status === "reviewed" || status === "resolved") {
      values.reviewed_at = now;
    }
    if (notes !== undefined) {
      values.notes = notes;
    }

    const result = await this.db
      .updateTable("feedback")
      .set(values)
      .where("id", "=", id)
      .where("deleted_at", "is", null)
      .execute();

    return result[0]?.numUpdatedRows !== undefined && result[0].numUpdatedRows > 0n;
  }

  async softDelete(id: string): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await this.db
      .updateTable("feedback")
      .set({ deleted_at: now, updated_at: now })
      .where("id", "=", id)
      .where("deleted_at", "is", null)
      .execute();

    return result[0]?.numUpdatedRows !== undefined && result[0].numUpdatedRows > 0n;
  }

  async bulkUpdateStatus(ids: string[], status: FeedbackStatus): Promise<number> {
    const now = new Date().toISOString();
    const values: Record<string, any> = { status, updated_at: now };
    if (status === "reviewed" || status === "resolved") {
      values.reviewed_at = now;
    }

    const result = await this.db
      .updateTable("feedback")
      .set(values)
      .where("id", "in", ids)
      .where("deleted_at", "is", null)
      .execute();

    return Number(result[0]?.numUpdatedRows ?? 0);
  }

  async bulkDelete(ids: string[]): Promise<number> {
    const now = new Date().toISOString();
    const result = await this.db
      .updateTable("feedback")
      .set({ deleted_at: now, updated_at: now })
      .where("id", "in", ids)
      .where("deleted_at", "is", null)
      .execute();

    return Number(result[0]?.numUpdatedRows ?? 0);
  }

  async exportAll(filters: Omit<FeedbackFilters, "page" | "perPage">): Promise<FeedbackRow[]> {
    let query = this.db.selectFrom("feedback").selectAll().where("deleted_at", "is", null);

    if (filters.type) query = query.where("type", "=", filters.type);
    if (filters.status) query = query.where("status", "=", filters.status);
    if (filters.platform) query = query.where("platform", "=", filters.platform);
    if (filters.appVersion) query = query.where("app_version", "=", filters.appVersion);
    if (filters.email) query = query.where("email", "like", `%${filters.email}%`);
    if (filters.search) query = query.where("message", "like", `%${filters.search}%`);
    if (filters.dateFrom) query = query.where("received_at", ">=", filters.dateFrom);
    if (filters.dateTo) query = query.where("received_at", "<=", filters.dateTo);

    const sortCol = (["received_at", "type", "status", "app_version"] as const).includes(
      filters.sortBy as any
    )
      ? (filters.sortBy as any)
      : "received_at";

    return query.orderBy(sortCol, filters.sortOrder).execute();
  }

  /** Get distinct values for filter dropdowns */
  async getFilterOptions(): Promise<{
    platforms: string[];
    appVersions: string[];
  }> {
    const platformsResult = await this.db
      .selectFrom("feedback")
      .select("platform")
      .distinct()
      .where("deleted_at", "is", null)
      .where("platform", "is not", null)
      .execute();

    const versionsResult = await this.db
      .selectFrom("feedback")
      .select("app_version")
      .distinct()
      .where("deleted_at", "is", null)
      .execute();

    return {
      platforms: platformsResult.map((r) => r.platform!).filter(Boolean),
      appVersions: versionsResult.map((r) => r.app_version),
    };
  }
}
