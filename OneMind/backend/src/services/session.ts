import type { Kysely } from "kysely";
import type { Database } from "../db/types.ts";

export class SessionService {
  constructor(private db: Kysely<Database>) {}

  async create(): Promise<string> {
    const id = `${Date.now()}-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await this.db
      .insertInto("sessions")
      .values({ id, created_at: now, expires_at: expiresAt })
      .execute();

    return id;
  }

  async validate(sessionId: string): Promise<boolean> {
    const session = await this.db
      .selectFrom("sessions")
      .selectAll()
      .where("id", "=", sessionId)
      .executeTakeFirst();

    if (!session) return false;

    if (new Date(session.expires_at) < new Date()) {
      await this.delete(sessionId);
      return false;
    }

    return true;
  }

  async delete(sessionId: string): Promise<void> {
    await this.db.deleteFrom("sessions").where("id", "=", sessionId).execute();
  }

  async cleanup(): Promise<void> {
    const now = new Date().toISOString();
    await this.db.deleteFrom("sessions").where("expires_at", "<", now).execute();
  }
}
