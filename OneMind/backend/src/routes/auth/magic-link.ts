import { createHash } from "crypto";
import type { AppContext } from "../../context.ts";
import { emitLicenseAuditEvent } from "../../services/license-audit.ts";

function tokenHashPrefix(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}

function json(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function consumeErrorStatus(code: "MAGIC_LINK_INVALID" | "MAGIC_LINK_EXPIRED" | "MAGIC_LINK_ALREADY_USED"): number {
  if (code === "MAGIC_LINK_EXPIRED") return 410;
  if (code === "MAGIC_LINK_ALREADY_USED") return 409;
  return 400;
}

export async function handleIssueMagicLink(request: Request, ctx: AppContext): Promise<Response> {
  try {
    const body = (await request.json()) as { email?: unknown };
    if (typeof body.email !== "string") {
      return json(
        {
          success: false,
          error: {
            code: "MAGIC_LINK_INVALID",
            message: "Magic link token is invalid",
          },
        },
        400,
      );
    }

    const issued = await ctx.magicLinkAuthService.issueMagicLink(body.email);
    return json({
      success: true,
      data: {
        email: issued.email,
        accountId: issued.accountId,
        expiresAt: issued.expiresAt,
      },
    });
  } catch (error) {
    console.error("handleIssueMagicLink:", error);
    return json(
      {
        success: false,
        error: {
          code: "MAGIC_LINK_INVALID",
          message: "Magic link token is invalid",
        },
      },
      400,
    );
  }
}

export async function handleConsumeMagicLink(request: Request, ctx: AppContext): Promise<Response> {
  try {
    const body = (await request.json()) as { token?: unknown };
    const token = typeof body.token === "string" ? body.token : "";

    const consumed = await ctx.magicLinkAuthService.consumeMagicLink(token);
    if (!consumed.ok) {
      emitLicenseAuditEvent({
        eventType: "license.auth.login",
        accountId: null,
        deviceId: null,
        stateFrom: "unauthenticated",
        stateTo: "unauthenticated",
        reasonCode: consumed.code,
        details: {
          tokenHashPrefix: tokenHashPrefix(token),
        },
      });

      return json(
        {
          success: false,
          error: {
            code: consumed.code,
            message: consumed.message,
          },
        },
        consumeErrorStatus(consumed.code),
      );
    }

    const sessionId = await ctx.sessionService.create();
    emitLicenseAuditEvent({
      eventType: "license.auth.login",
      accountId: consumed.accountId,
      deviceId: null,
      stateFrom: "unauthenticated",
      stateTo: "authenticated",
      reasonCode: "MAGIC_LINK_CONSUMED",
      details: {
        email: consumed.email,
        sessionId,
        tokenHashPrefix: tokenHashPrefix(token),
      },
    });

    return json({
      success: true,
      data: {
        accountId: consumed.accountId,
        email: consumed.email,
        sessionId,
      },
    });
  } catch (error) {
    console.error("handleConsumeMagicLink:", error);
    return json(
      {
        success: false,
        error: {
          code: "MAGIC_LINK_INVALID",
          message: "Magic link token is invalid",
        },
      },
      400,
    );
  }
}
