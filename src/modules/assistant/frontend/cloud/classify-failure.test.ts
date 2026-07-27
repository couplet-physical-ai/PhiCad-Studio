import { describe, expect, it } from "vitest";
import {
  classifyCloudFailure,
  cloudFailureActionUrl,
} from "./classify-failure";

// B9. ai-core only puts the HTTP status in `errorCode`; the cloud's RFC-7807
// body arrives as free text inside `errorMessage`, so both are sniffed.

describe("classifyCloudFailure", () => {
  it("recognises 402 out-of-credits by status", () => {
    const failure = classifyCloudFailure("402", undefined);
    expect(failure?.kind).toBe("out-of-credits");
  });

  it("recognises out-of-credits by the wallet-denied code in the body text", () => {
    // What actually arrives: "POST /chat/completions -> 402: {…\"code\":\"wallet-denied\"…}"
    const failure = classifyCloudFailure(
      undefined,
      'POST /chat/completions -> 402: {"title":"insufficient credits","code":"wallet-denied"}',
    );
    expect(failure?.kind).toBe("out-of-credits");
  });

  it("recognises 403 not-Pro by status", () => {
    expect(classifyCloudFailure("403", undefined)?.kind).toBe("not-pro");
  });

  it("recognises not-Pro from the bare string detail require_pro raises", () => {
    // auth.py:110 raises a plain string, so there is no `code` to match on.
    const failure = classifyCloudFailure(
      undefined,
      "POST /chat/completions -> 403: Pro tier required — request an invite.",
    );
    expect(failure?.kind).toBe("not-pro");
  });

  it("returns null for 401 — the refresh-and-resubmit path owns that", () => {
    expect(classifyCloudFailure("401", "token-expired")).toBeNull();
  });

  it("returns null for unrecognised failures so the generic path still runs", () => {
    expect(classifyCloudFailure("500", "upstream exploded")).toBeNull();
    expect(classifyCloudFailure(undefined, undefined)).toBeNull();
  });

  it("carries an actionable title and detail", () => {
    const failure = classifyCloudFailure("402", undefined)!;
    expect(failure.title).toBeTruthy();
    expect(failure.detail).toBeTruthy();
    expect(failure.actionLabel).toBeTruthy();
  });
});

describe("cloudFailureActionUrl", () => {
  it("points out-of-credits at billing and not-Pro at pricing", () => {
    const credits = classifyCloudFailure("402", undefined)!;
    const pro = classifyCloudFailure("403", undefined)!;
    expect(cloudFailureActionUrl(credits, "https://app.openpcb.app")).toBe(
      "https://app.openpcb.app/billing",
    );
    expect(cloudFailureActionUrl(pro, "https://app.openpcb.app")).toBe(
      "https://app.openpcb.app/pricing",
    );
  });

  it("tolerates a trailing slash", () => {
    const credits = classifyCloudFailure("402", undefined)!;
    expect(cloudFailureActionUrl(credits, "https://app.openpcb.app/")).toBe(
      "https://app.openpcb.app/billing",
    );
  });

  it("returns null when the cloud web url is not configured", () => {
    const credits = classifyCloudFailure("402", undefined)!;
    expect(cloudFailureActionUrl(credits, "")).toBeNull();
  });
});
