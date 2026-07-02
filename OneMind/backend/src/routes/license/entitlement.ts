import type { AppContext } from "../../context.ts";
import type { EntitlementResult } from "../../services/entitlement.ts";

interface EntitlementRequestBody {
  accountId?: unknown;
  deviceId?: unknown;
  licenseId?: unknown;
  replaceOldest?: unknown;
}

function json(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function statusForError(code: string): number {
  if (code === "ACCOUNT_NOT_FOUND" || code === "ENTITLEMENT_NOT_FOUND") return 404;
  if (code === "ENTITLEMENT_INVALID_STATUS") return 409;
  if (code === "DEVICE_SLOT_REPLACEMENT_REQUIRED") return 409;
  if (code === "ENTITLEMENT_KEY_UNAVAILABLE") return 503;
  return 400;
}

function parseBody(body: EntitlementRequestBody): { accountId: string; deviceId: string; licenseId: string; replaceOldest?: boolean } | null {
  if (typeof body.accountId !== "string" || typeof body.deviceId !== "string" || typeof body.licenseId !== "string") {
    return null;
  }

  if (body.accountId.length === 0 || body.deviceId.length === 0 || body.licenseId.length === 0) {
    return null;
  }

  return {
    accountId: body.accountId,
    deviceId: body.deviceId,
    licenseId: body.licenseId,
    replaceOldest: body.replaceOldest === true,
  };
}

function fromResult(result: EntitlementResult): Response {
  if (!result.ok) {
    return json(
      {
        success: false,
        error: {
          code: result.code,
          message: result.message,
          prompt: result.replaceOldestPrompt,
        },
      },
      statusForError(result.code),
    );
  }

  return json({
    success: true,
    data: {
      token: result.token,
      expiresAt: result.expiresAt,
      claims: {
        accountId: result.claims.accountId,
        deviceId: result.claims.deviceId,
        licenseId: result.claims.licenseId,
        accessStatus: result.claims.accessStatus,
        licenseStatus: result.claims.licenseStatus,
        exp: result.claims.exp,
      },
    },
  });
}

export async function handleIssueEntitlement(request: Request, ctx: AppContext): Promise<Response> {
  try {
    const body = (await request.json()) as EntitlementRequestBody;
    const parsed = parseBody(body);
    if (!parsed) {
      return json(
        {
          success: false,
          error: {
            code: "ENTITLEMENT_INVALID_REQUEST",
            message: "Entitlement request payload is invalid",
          },
        },
        400,
      );
    }

    return fromResult(await ctx.entitlementService.issue(parsed));
  } catch (error) {
    console.error("handleIssueEntitlement:", error);
    return json(
      {
        success: false,
        error: {
          code: "ENTITLEMENT_INVALID_REQUEST",
          message: "Entitlement request payload is invalid",
        },
      },
      400,
    );
  }
}

export async function handleRefreshEntitlement(request: Request, ctx: AppContext): Promise<Response> {
  try {
    const body = (await request.json()) as EntitlementRequestBody;
    const parsed = parseBody(body);
    if (!parsed) {
      return json(
        {
          success: false,
          error: {
            code: "ENTITLEMENT_INVALID_REQUEST",
            message: "Entitlement request payload is invalid",
          },
        },
        400,
      );
    }

    return fromResult(await ctx.entitlementService.refresh(parsed));
  } catch (error) {
    console.error("handleRefreshEntitlement:", error);
    return json(
      {
        success: false,
        error: {
          code: "ENTITLEMENT_INVALID_REQUEST",
          message: "Entitlement request payload is invalid",
        },
      },
      400,
    );
  }
}

export async function handleRevokeEntitlement(request: Request, ctx: AppContext): Promise<Response> {
  try {
    const body = (await request.json()) as EntitlementRequestBody;
    const parsed = parseBody(body);
    if (!parsed) {
      return json(
        {
          success: false,
          error: {
            code: "ENTITLEMENT_INVALID_REQUEST",
            message: "Entitlement request payload is invalid",
          },
        },
        400,
      );
    }

    return fromResult(await ctx.entitlementService.revoke(parsed));
  } catch (error) {
    console.error("handleRevokeEntitlement:", error);
    return json(
      {
        success: false,
        error: {
          code: "ENTITLEMENT_INVALID_REQUEST",
          message: "Entitlement request payload is invalid",
        },
      },
      400,
    );
  }
}
