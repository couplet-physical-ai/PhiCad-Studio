import { describe, expect, it } from "bun:test";

import {
  signEntitlementToken,
  verifyEntitlementToken,
  type EntitlementClaims,
} from "../src/license/entitlement-crypto.ts";

const encoder = new TextEncoder();

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? encoder.encode(input) : input;
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function replaceJwtHeader(token: string, header: Record<string, unknown>): string {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("invalid test token format");
  }
  const replacement = base64UrlEncode(JSON.stringify(header));
  return [replacement, parts[1], parts[2]].join(".");
}

function replaceJwtPayload(token: string, payload: Record<string, unknown>): string {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("invalid test token format");
  }
  const replacement = base64UrlEncode(JSON.stringify(payload));
  return [parts[0], replacement, parts[2]].join(".");
}

function replaceJwtPayloadRawJson(token: string, payloadJson: string): string {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("invalid test token format");
  }
  const replacement = base64UrlEncode(payloadJson);
  return [parts[0], replacement, parts[2]].join(".");
}

async function createKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
}

function createClaims(nowSeconds: number): EntitlementClaims {
  return {
    iss: "onemind-license-service",
    aud: "onemind-desktop",
    sub: "account_123",
    jti: "fixture-jti-123",
    iat: nowSeconds,
    nbf: nowSeconds - 1,
    exp: nowSeconds + 300,
    schemaVersion: 1,
    accountId: "account_123",
    deviceId: "device_123",
    licenseId: "license_123",
    accessStatus: "active",
    licenseStatus: "ACTIVE",
    entitlements: [{ featureId: "chat.core", granted: true }],
  };
}

describe("entitlement crypto", () => {
  it("verifies a valid Ed25519-signed entitlement", async () => {
    const nowSeconds = 1_750_000_000;
    const keyPair = await createKeyPair();
    const claims = createClaims(nowSeconds);

    const token = await signEntitlementToken(claims, {
      privateKey: keyPair.privateKey,
      keyId: "kid-valid",
    });

    const result = await verifyEntitlementToken(token, {
      expectedIssuer: "onemind-license-service",
      expectedAudience: "onemind-desktop",
      nowSeconds,
      resolvePublicKey: async (kid) => (kid === "kid-valid" ? keyPair.publicKey : null),
      isJtiReplayed: async () => false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected successful verification");
    }
    expect(result.claims.jti).toBe("fixture-jti-123");
    expect(result.claims.licenseStatus).toBe("ACTIVE");
  });

  it("rejects tokens with wrong alg", async () => {
    const nowSeconds = 1_750_000_000;
    const keyPair = await createKeyPair();

    const token = await signEntitlementToken(createClaims(nowSeconds), {
      privateKey: keyPair.privateKey,
      keyId: "kid-valid",
    });

    const forged = replaceJwtHeader(token, { alg: "HS256", typ: "JWT", kid: "kid-valid" });

    const result = await verifyEntitlementToken(forged, {
      expectedIssuer: "onemind-license-service",
      expectedAudience: "onemind-desktop",
      nowSeconds,
      resolvePublicKey: async () => keyPair.publicKey,
      isJtiReplayed: async () => false,
    });

    expect(result).toEqual({
      ok: false,
      code: "INVALID_ALG",
      message: "Token algorithm must be EdDSA",
    });
  });

  it("rejects tokens with wrong audience", async () => {
    const nowSeconds = 1_750_000_000;
    const keyPair = await createKeyPair();

    const token = await signEntitlementToken(createClaims(nowSeconds), {
      privateKey: keyPair.privateKey,
      keyId: "kid-valid",
    });

    const result = await verifyEntitlementToken(token, {
      expectedIssuer: "onemind-license-service",
      expectedAudience: "different-audience",
      nowSeconds,
      resolvePublicKey: async () => keyPair.publicKey,
      isJtiReplayed: async () => false,
    });

    expect(result).toEqual({
      ok: false,
      code: "INVALID_AUDIENCE",
      message: "Token audience mismatch",
    });
  });

  it("rejects expired tokens", async () => {
    const nowSeconds = 1_750_000_000;
    const keyPair = await createKeyPair();
    const claims = createClaims(nowSeconds);

    const token = await signEntitlementToken(
      {
        ...claims,
        exp: nowSeconds - 5,
        nbf: nowSeconds - 20,
      },
      {
        privateKey: keyPair.privateKey,
        keyId: "kid-valid",
      },
    );

    const result = await verifyEntitlementToken(token, {
      expectedIssuer: "onemind-license-service",
      expectedAudience: "onemind-desktop",
      nowSeconds,
      resolvePublicKey: async () => keyPair.publicKey,
      isJtiReplayed: async () => false,
    });

    expect(result).toEqual({
      ok: false,
      code: "TOKEN_EXPIRED",
      message: "Token is expired",
    });
  });

  it("rejects replayed jti fixture", async () => {
    const nowSeconds = 1_750_000_000;
    const keyPair = await createKeyPair();
    const replayedJti = "replayed-jti-fixture";

    const token = await signEntitlementToken(
      {
        ...createClaims(nowSeconds),
        jti: replayedJti,
      },
      {
        privateKey: keyPair.privateKey,
        keyId: "kid-valid",
      },
    );

    const result = await verifyEntitlementToken(token, {
      expectedIssuer: "onemind-license-service",
      expectedAudience: "onemind-desktop",
      nowSeconds,
      resolvePublicKey: async () => keyPair.publicKey,
      isJtiReplayed: async (jti) => jti === replayedJti,
    });

    expect(result).toEqual({
      ok: false,
      code: "JTI_REPLAYED",
      message: "Token jti has already been used",
    });
  });

  it("rejects forged token payload even when header claims EdDSA", async () => {
    const nowSeconds = 1_750_000_000;
    const keyPair = await createKeyPair();

    const token = await signEntitlementToken(createClaims(nowSeconds), {
      privateKey: keyPair.privateKey,
      keyId: "kid-valid",
    });

    const forged = replaceJwtPayload(token, {
      ...createClaims(nowSeconds),
      accountId: "attacker-account",
    });

    const result = await verifyEntitlementToken(forged, {
      expectedIssuer: "onemind-license-service",
      expectedAudience: "onemind-desktop",
      nowSeconds,
      resolvePublicKey: async () => keyPair.publicKey,
      isJtiReplayed: async () => false,
    });

    expect(result).toEqual({
      ok: false,
      code: "INVALID_SIGNATURE",
      message: "Token signature validation failed",
    });
  });

  it("rejects second verification when same jti is reused", async () => {
    const nowSeconds = 1_750_000_000;
    const keyPair = await createKeyPair();
    const seen = new Set<string>();

    const token = await signEntitlementToken(createClaims(nowSeconds), {
      privateKey: keyPair.privateKey,
      keyId: "kid-valid",
    });

    const options = {
      expectedIssuer: "onemind-license-service",
      expectedAudience: "onemind-desktop",
      nowSeconds,
      resolvePublicKey: async () => keyPair.publicKey,
      isJtiReplayed: async (jti: string) => {
        if (seen.has(jti)) {
          return true;
        }
        seen.add(jti);
        return false;
      },
    };

    const first = await verifyEntitlementToken(token, options);
    expect(first.ok).toBe(true);

    const second = await verifyEntitlementToken(token, options);
    expect(second).toEqual({
      ok: false,
      code: "JTI_REPLAYED",
      message: "Token jti has already been used",
    });
  });

  it("rejects malformed claims missing required exp", async () => {
    const nowSeconds = 1_750_000_000;
    const keyPair = await createKeyPair();

    const token = await signEntitlementToken(createClaims(nowSeconds), {
      privateKey: keyPair.privateKey,
      keyId: "kid-valid",
    });

    const malformed = replaceJwtPayload(token, {
      ...createClaims(nowSeconds),
      exp: undefined,
    });

    const result = await verifyEntitlementToken(malformed, {
      expectedIssuer: "onemind-license-service",
      expectedAudience: "onemind-desktop",
      nowSeconds,
      resolvePublicKey: async () => keyPair.publicKey,
      isJtiReplayed: async () => false,
    });

    expect(result).toEqual({
      ok: false,
      code: "INVALID_CLAIMS",
      message: "Token claims are invalid or missing required fields",
    });
  });

  it("rejects malformed claims when exp is non-finite", async () => {
    const nowSeconds = 1_750_000_000;
    const keyPair = await createKeyPair();

    const token = await signEntitlementToken(createClaims(nowSeconds), {
      privateKey: keyPair.privateKey,
      keyId: "kid-valid",
    });

    const malformed = replaceJwtPayloadRawJson(
      token,
      `{"iss":"onemind-license-service","aud":"onemind-desktop","sub":"account_123","jti":"fixture-jti-123","iat":${nowSeconds},"nbf":${nowSeconds - 1},"exp":1e999,"schemaVersion":1,"accountId":"account_123","deviceId":"device_123","licenseId":"license_123","accessStatus":"active","licenseStatus":"ACTIVE","entitlements":[{"featureId":"chat.core","granted":true}]}`,
    );

    const result = await verifyEntitlementToken(malformed, {
      expectedIssuer: "onemind-license-service",
      expectedAudience: "onemind-desktop",
      nowSeconds,
      resolvePublicKey: async () => keyPair.publicKey,
      isJtiReplayed: async () => false,
    });

    expect(result).toEqual({
      ok: false,
      code: "INVALID_CLAIMS",
      message: "Token claims are invalid or missing required fields",
    });
  });

  it("rejects invalid issuer claim type", async () => {
    const nowSeconds = 1_750_000_000;
    const keyPair = await createKeyPair();

    const token = await signEntitlementToken(createClaims(nowSeconds), {
      privateKey: keyPair.privateKey,
      keyId: "kid-valid",
    });

    const malformed = replaceJwtPayload(token, {
      ...createClaims(nowSeconds),
      iss: 42,
    });

    const result = await verifyEntitlementToken(malformed, {
      expectedIssuer: "onemind-license-service",
      expectedAudience: "onemind-desktop",
      nowSeconds,
      resolvePublicKey: async () => keyPair.publicKey,
      isJtiReplayed: async () => false,
    });

    expect(result).toEqual({
      ok: false,
      code: "INVALID_CLAIMS",
      message: "Token claims are invalid or missing required fields",
    });
  });

  it("rejects invalid audience claim type", async () => {
    const nowSeconds = 1_750_000_000;
    const keyPair = await createKeyPair();

    const token = await signEntitlementToken(createClaims(nowSeconds), {
      privateKey: keyPair.privateKey,
      keyId: "kid-valid",
    });

    const malformed = replaceJwtPayload(token, {
      ...createClaims(nowSeconds),
      aud: false,
    });

    const result = await verifyEntitlementToken(malformed, {
      expectedIssuer: "onemind-license-service",
      expectedAudience: "onemind-desktop",
      nowSeconds,
      resolvePublicKey: async () => keyPair.publicKey,
      isJtiReplayed: async () => false,
    });

    expect(result).toEqual({
      ok: false,
      code: "INVALID_CLAIMS",
      message: "Token claims are invalid or missing required fields",
    });
  });
});
