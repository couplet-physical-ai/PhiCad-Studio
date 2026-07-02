import type { AppContext } from "../../context.ts";
import { emitLicenseAuditEvent } from "../../services/license-audit.ts";
import { generateUuidV7Like } from "../../utils/id.ts";

function json(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleAlphaRegister(
  request: Request,
  ctx: AppContext,
): Promise<Response> {
  if (process.env.ALPHA_TESTING_ENABLED === "false") {
    return json(
      {
        success: false,
        error: {
          code: "ALPHA_TESTING_ENDED",
          message: "Alpha testing has ended. Please upgrade to continue.",
        },
      },
      403,
    );
  }

  try {
    const body = (await request.json()) as {
      email?: unknown;
      deviceId?: unknown;
    };
    if (typeof body.email !== "string" || !body.email.includes("@")) {
      return json(
        {
          success: false,
          error: { code: "INVALID_EMAIL", message: "Valid email required" },
        },
        400,
      );
    }
    const deviceId =
      typeof body.deviceId === "string" ? body.deviceId : "unknown";

    let account = await ctx.db
      .selectFrom("accounts")
      .selectAll()
      .where("email", "=", body.email)
      .executeTakeFirst();

    const now = new Date().toISOString();
    if (!account) {
      const accountId = generateUuidV7Like();
      await ctx.db
        .insertInto("accounts")
        .values({
          id: accountId,
          email: body.email,
          created_at: now,
          updated_at: now,
          alpha_enrolled_at: now,
        })
        .execute();
      account = {
        id: accountId,
        email: body.email,
        created_at: now,
        updated_at: now,
        alpha_enrolled_at: now,
      };
    } else if (!account.alpha_enrolled_at) {
      await ctx.db
        .updateTable("accounts")
        .set({ alpha_enrolled_at: now, updated_at: now })
        .where("id", "=", account.id)
        .execute();
    }

    const result = await ctx.entitlementService.issue({
      accountId: account.id,
      deviceId,
      licenseId: "alpha-free",
      tier: "alpha-tester",
    });

    if (!result.ok) {
      return json(
        {
          success: false,
          error: { code: result.code, message: result.message },
        },
        400,
      );
    }

    emitLicenseAuditEvent({
      eventType: "license.alpha.register",
      accountId: account.id,
      deviceId,
      stateFrom: null,
      stateTo: "active",
      reasonCode: "ALPHA_REGISTERED",
      details: { email: body.email },
    });

    return json({
      success: true,
      data: {
        accountId: account.id,
        token: result.token,
        expiresAt: result.expiresAt,
        tier: "alpha-tester",
      },
    });
  } catch (error) {
    console.error("handleAlphaRegister:", error);
    return json(
      {
        success: false,
        error: { code: "REGISTRATION_FAILED", message: "Registration failed" },
      },
      500,
    );
  }
}
