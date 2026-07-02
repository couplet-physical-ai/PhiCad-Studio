import { sql, type Kysely } from "kysely";
import type { Database, NewAnalyticsEvent } from "../db/types.ts";
import type { AnalyticsEventInput } from "../types.ts";

function generateUUIDv7(): string {
  const timestamp = Date.now();
  const uuid = crypto.randomUUID();
  const hex = timestamp.toString(16).padStart(12, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${uuid.slice(15)}`;
}

export class AnalyticsService {
  constructor(private db: Kysely<Database>) {}

  async ingest(event: AnalyticsEventInput): Promise<string> {
    const id = generateUUIDv7();
    const now = new Date().toISOString();

    await this.db
      .insertInto("analytics_events")
      .values({
        id,
        event_name: event.eventName,
        event_category: event.eventCategory,
        session_id: event.sessionId ?? null,
        app_version: event.appVersion,
        platform: event.platform,
        properties: event.properties ? JSON.stringify(event.properties) : null,
        timestamp: event.timestamp,
        received_at: now,
      })
      .execute();

    return id;
  }

  async ingestBatch(events: AnalyticsEventInput[]): Promise<number> {
    if (events.length === 0) return 0;
    const now = new Date().toISOString();

    const rows: NewAnalyticsEvent[] = events.map((e) => ({
      id: generateUUIDv7(),
      event_name: e.eventName,
      event_category: e.eventCategory,
      session_id: e.sessionId ?? null,
      app_version: e.appVersion,
      platform: e.platform,
      properties: e.properties ? JSON.stringify(e.properties) : null,
      timestamp: e.timestamp,
      received_at: now,
    }));

    await this.db.insertInto("analytics_events").values(rows).execute();
    return rows.length;
  }

  async overview(): Promise<{
    totalEventsToday: number;
    uniqueSessionsToday: number;
    errorRateToday: number;
    topAppVersion: string | null;
  }> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const totalResult = await this.db
      .selectFrom("analytics_events")
      .select(this.db.fn.countAll().as("count"))
      .where("timestamp", ">=", todayISO)
      .executeTakeFirst();
    const totalEventsToday = Number(totalResult?.count ?? 0);

    const sessionsResult = await this.db
      .selectFrom("analytics_events")
      .select(this.db.fn.count("session_id").distinct().as("count"))
      .where("timestamp", ">=", todayISO)
      .where("session_id", "is not", null)
      .executeTakeFirst();
    const uniqueSessionsToday = Number(sessionsResult?.count ?? 0);

    const errorResult = await this.db
      .selectFrom("analytics_events")
      .select(this.db.fn.countAll().as("count"))
      .where("timestamp", ">=", todayISO)
      .where("event_category", "=", "error")
      .executeTakeFirst();
    const errorCount = Number(errorResult?.count ?? 0);
    const errorRateToday = totalEventsToday > 0 ? errorCount / totalEventsToday : 0;

    const versionResult = await this.db
      .selectFrom("analytics_events")
      .select(["app_version"])
      .select(this.db.fn.countAll().as("count"))
      .where("timestamp", ">=", todayISO)
      .groupBy("app_version")
      .orderBy("count", "desc")
      .limit(1)
      .executeTakeFirst();

    return {
      totalEventsToday,
      uniqueSessionsToday,
      errorRateToday: Math.round(errorRateToday * 10000) / 100,
      topAppVersion: versionResult?.app_version ?? null,
    };
  }

  async dailyCounts(days: number = 30): Promise<Array<{ date: string; count: number }>> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceISO = since.toISOString().slice(0, 10);

    // Use substr for SQLite compatibility (works on PG too)
    const results = await this.db
      .selectFrom("analytics_events")
      .select([
        sql<string>`substr(timestamp, 1, 10)`.as("date"),
        this.db.fn.countAll().as("count"),
      ])
      .where(sql`substr(timestamp, 1, 10)`, ">=", sinceISO)
      .groupBy(sql`substr(timestamp, 1, 10)`)
      .orderBy("date", "asc")
      .execute();

    return results.map((r) => ({ date: r.date, count: Number(r.count) }));
  }

  async topEvents(limit: number = 20): Promise<Array<{ event_name: string; count: number }>> {
    const results = await this.db
      .selectFrom("analytics_events")
      .select(["event_name"])
      .select(this.db.fn.countAll().as("count"))
      .groupBy("event_name")
      .orderBy("count", "desc")
      .limit(limit)
      .execute();

    return results.map((r) => ({ event_name: r.event_name, count: Number(r.count) }));
  }

  async versionDistribution(): Promise<Array<{ app_version: string; count: number }>> {
    const results = await this.db
      .selectFrom("analytics_events")
      .select(["app_version"])
      .select(this.db.fn.countAll().as("count"))
      .groupBy("app_version")
      .orderBy("count", "desc")
      .execute();

    return results.map((r) => ({ app_version: r.app_version, count: Number(r.count) }));
  }

  async platformDistribution(): Promise<Array<{ platform: string; count: number }>> {
    const results = await this.db
      .selectFrom("analytics_events")
      .select(["platform"])
      .select(this.db.fn.countAll().as("count"))
      .groupBy("platform")
      .orderBy("count", "desc")
      .execute();

    return results.map((r) => ({ platform: r.platform, count: Number(r.count) }));
  }

  async recentErrors(limit: number = 50): Promise<any[]> {
    return this.db
      .selectFrom("analytics_events")
      .selectAll()
      .where("event_category", "=", "error")
      .orderBy("timestamp", "desc")
      .limit(limit)
      .execute();
  }
}
