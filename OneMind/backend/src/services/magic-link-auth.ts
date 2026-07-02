import { createHash } from "crypto";
import type { Kysely } from "kysely";
import type { AccountRow, Database } from "../db/types.ts";
import { generateUuidV7Like } from "../utils/id.ts";

const MAGIC_LINK_TTL_MS = 10 * 60 * 1000;

export type ConsumeMagicLinkErrorCode =
  | "MAGIC_LINK_INVALID"
  | "MAGIC_LINK_EXPIRED"
  | "MAGIC_LINK_ALREADY_USED";

export interface ConsumeMagicLinkError {
  ok: false;
  code: ConsumeMagicLinkErrorCode;
  message: string;
}

export interface ConsumeMagicLinkSuccess {
  ok: true;
  accountId: string;
  email: string;
}

export type ConsumeMagicLinkResult =
  | ConsumeMagicLinkSuccess
  | ConsumeMagicLinkError;

interface Clock {
  now: () => Date;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export class MagicLinkAuthService {
  constructor(
    private db: Kysely<Database>,
    private clock: Clock = { now: () => new Date() },
  ) {}

  async issueMagicLink(
    emailInput: string,
  ): Promise<{
    token: string;
    expiresAt: string;
    accountId: string;
    email: string;
  }> {
    const email = normalizeEmail(emailInput);
    if (!isValidEmail(email)) {
      throw new Error("Invalid email");
    }

    const now = this.clock.now();
    const nowIso = now.toISOString();
    const account = await this.getOrCreateAccount(email, nowIso);

    const token = crypto.randomUUID();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(now.getTime() + MAGIC_LINK_TTL_MS).toISOString();

    await this.db
      .insertInto("magic_link_tokens")
      .values({
        id: generateUuidV7Like(),
        account_id: account.id,
        token_hash: tokenHash,
        created_at: nowIso,
        expires_at: expiresAt,
        consumed_at: null,
      })
      .execute();

    return {
      token,
      expiresAt,
      accountId: account.id,
      email: account.email,
    };
  }

  async consumeMagicLink(token: string): Promise<ConsumeMagicLinkResult> {
    if (typeof token !== "string" || token.length === 0) {
      return {
        ok: false,
        code: "MAGIC_LINK_INVALID",
        message: "Magic link token is invalid",
      };
    }

    const tokenHash = hashToken(token);
    const row = await this.db
      .selectFrom("magic_link_tokens")
      .innerJoin("accounts", "accounts.id", "magic_link_tokens.account_id")
      .select([
        "magic_link_tokens.id as token_id",
        "magic_link_tokens.expires_at as expires_at",
        "magic_link_tokens.consumed_at as consumed_at",
        "accounts.id as account_id",
        "accounts.email as email",
      ])
      .where("magic_link_tokens.token_hash", "=", tokenHash)
      .executeTakeFirst();

    if (!row) {
      return {
        ok: false,
        code: "MAGIC_LINK_INVALID",
        message: "Magic link token is invalid",
      };
    }

    if (row.consumed_at !== null) {
      return {
        ok: false,
        code: "MAGIC_LINK_ALREADY_USED",
        message: "Magic link token has already been consumed",
      };
    }

    if (new Date(row.expires_at).getTime() <= this.clock.now().getTime()) {
      return {
        ok: false,
        code: "MAGIC_LINK_EXPIRED",
        message: "Magic link token is expired",
      };
    }

    const nowIso = this.clock.now().toISOString();
    const updateResult = await this.db
      .updateTable("magic_link_tokens")
      .set({ consumed_at: nowIso })
      .where("id", "=", row.token_id)
      .where("consumed_at", "is", null)
      .execute();

    const updated = updateResult[0]?.numUpdatedRows;
    if (updated === undefined || updated === 0n) {
      return {
        ok: false,
        code: "MAGIC_LINK_ALREADY_USED",
        message: "Magic link token has already been consumed",
      };
    }

    return {
      ok: true,
      accountId: row.account_id,
      email: row.email,
    };
  }

  private async getOrCreateAccount(
    email: string,
    nowIso: string,
  ): Promise<AccountRow> {
    const existing = await this.db
      .selectFrom("accounts")
      .selectAll()
      .where("email", "=", email)
      .executeTakeFirst();
    if (existing) {
      return existing;
    }

    const id = generateUuidV7Like();
    await this.db
      .insertInto("accounts")
      .values({
        id,
        email,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .execute();

    return {
      id,
      email,
      created_at: nowIso,
      updated_at: nowIso,
      alpha_enrolled_at: null,
    };
  }
}
