import { describe, expect, it } from "bun:test";

import {
  emitLicenseAuditEvent,
  redactAuditValue,
  type LicenseAuditEvent,
} from "../src/services/license-audit.ts";

describe("license audit logging", () => {
  it("redacts nested token and session secret values", () => {
    const redacted = redactAuditValue({
      accountId: "acct-1",
      token: "header.payload.signature",
      sessionSecret: "super-secret",
      nested: {
        authorization: "Bearer abc",
        entitlementJws: "aaa.bbb.ccc",
      },
      arrayValue: [{ refreshToken: "refresh-1" }],
    });

    expect(redacted).toEqual({
      accountId: "acct-1",
      token: "[REDACTED]",
      sessionSecret: "[REDACTED]",
      nested: {
        authorization: "[REDACTED]",
        entitlementJws: "[REDACTED]",
      },
      arrayValue: [{ refreshToken: "[REDACTED]" }],
    });
  });

  it("emits structured audit event with required shape", () => {
    const originalInfo = console.info;
    const captured: unknown[][] = [];
    console.info = (...args: unknown[]) => {
      captured.push(args);
    };

    try {
      const event: LicenseAuditEvent = {
        eventType: "license.entitlement.revocation",
        accountId: "acct-1",
        deviceId: "dev-1",
        stateFrom: "active",
        stateTo: "blocked",
        reasonCode: "ACCESS_BLOCKED",
        details: {
          sessionToken: "session-raw",
          entitlementJws: "raw.jwt.value",
        },
      };

      emitLicenseAuditEvent(event);
    } finally {
      console.info = originalInfo;
    }

    expect(captured.length).toBe(1);
    expect(captured[0]![0]).toBe("[license-audit]");
    const payload = JSON.parse(captured[0]![1] as string) as Record<string, unknown>;
    expect(payload).toMatchObject({
      eventType: "license.entitlement.revocation",
      accountId: "acct-1",
      deviceId: "dev-1",
      stateFrom: "active",
      stateTo: "blocked",
      reasonCode: "ACCESS_BLOCKED",
    });
    expect(typeof payload.timestamp).toBe("string");

    const details = payload.details as Record<string, unknown>;
    expect(details.sessionToken).toBe("[REDACTED]");
    expect(details.entitlementJws).toBe("[REDACTED]");
  });
});
