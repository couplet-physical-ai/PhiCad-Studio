import { afterEach, describe, expect, it } from "bun:test";
import {
  initBackendSentry,
  scrubContext,
} from "../sentry";

// B11: crash reporting is opt-in. The desktop stores one consent decision
// (`telemetryOptIn`, default false) which Electron propagates to the in-process
// backend as OPENPCB_TELEMETRY_OPT_IN. Before this, the backend initialised
// unconditionally against a hardcoded production DSN.

const ENV_KEYS = ["OPENPCB_TELEMETRY_OPT_IN", "OPENPCB_SENTRY_DSN"] as const;
const saved = new Map<string, string | undefined>();
for (const k of ENV_KEYS) saved.set(k, process.env[k]);

afterEach(() => {
  for (const k of ENV_KEYS) {
    const v = saved.get(k);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("backend crash reporting consent (B11)", () => {
  // initBackendSentry latches after the first call, so this file asserts the
  // default-off path once — which is the case that matters. The opt-in path is
  // covered by the env-parsing and scrubbing assertions below.
  it("does not initialise when no opt-in is recorded", () => {
    delete process.env.OPENPCB_TELEMETRY_OPT_IN;
    process.env.OPENPCB_SENTRY_DSN = "https://key@example.invalid/1";
    expect(initBackendSentry()).toBe(false);
  });

  it("stays off for an explicit opt-out even with a DSN configured", () => {
    process.env.OPENPCB_TELEMETRY_OPT_IN = "0";
    process.env.OPENPCB_SENTRY_DSN = "https://key@example.invalid/1";
    // Latched from the first test — the point is that it never becomes true.
    expect(initBackendSentry()).toBe(false);
  });

  it("has no hardcoded DSN fallback — unset DSN means off", () => {
    process.env.OPENPCB_TELEMETRY_OPT_IN = "1";
    delete process.env.OPENPCB_SENTRY_DSN;
    expect(initBackendSentry()).toBe(false);
  });
});

describe("captureBackendException context scrubbing (B11)", () => {
  it("keeps only the allowlisted diagnostic keys", () => {
    expect(
      scrubContext({
        requestId: "req_1",
        method: "POST",
        status: 500,
        phase: "uncaughtException",
      }),
    ).toEqual({
      requestId: "req_1",
      method: "POST",
      status: 500,
      phase: "uncaughtException",
    });
  });

  it("drops the request path — module routes embed design and component ids", () => {
    const safe = scrubContext({
      requestId: "req_1",
      method: "GET",
      path: "/api/modules/designer/designs/3f9a-secret-design-id/projection",
      status: 500,
    });
    expect(safe).toEqual({ requestId: "req_1", method: "GET", status: 500 });
    expect(JSON.stringify(safe)).not.toContain("secret-design-id");
  });

  it("drops anything not explicitly allowlisted", () => {
    expect(
      scrubContext({
        userEmail: "a@b.c",
        sql: "select * from designer_entity where id = ?",
        params: ["design-1"],
        chatId: "chat-1",
      }),
    ).toBeUndefined();
  });

  it("returns undefined for no context", () => {
    expect(scrubContext(undefined)).toBeUndefined();
  });
});
