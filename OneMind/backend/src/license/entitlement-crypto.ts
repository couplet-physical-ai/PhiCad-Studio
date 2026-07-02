export interface Entitlement {
  featureId: string;
  granted: boolean;
  reason?: string;
}

export type EntitlementLicenseStatus =
  | "ACTIVE"
  | "EXPIRED"
  | "TRIAL"
  | "REVOKED"
  | "NONE";

export type LicenseTier = "alpha-tester" | "beta" | "pro" | "enterprise";

const VALID_LICENSE_STATUSES = new Set<string>([
  "ACTIVE",
  "EXPIRED",
  "TRIAL",
  "REVOKED",
  "NONE",
]);

export function asLicenseStatus(value: string): EntitlementLicenseStatus {
  if (!VALID_LICENSE_STATUSES.has(value)) {
    throw new Error(`Invalid license status: ${value}`);
  }
  return value as EntitlementLicenseStatus;
}

export interface EntitlementClaims {
  iss: string;
  aud: string;
  sub: string;
  jti: string;
  iat: number;
  nbf: number;
  exp: number;
  schemaVersion: number;
  accountId: string;
  deviceId: string;
  licenseId: string;
  accessStatus: "active" | "blocked";
  licenseStatus: EntitlementLicenseStatus;
  licenseTier: LicenseTier;
  entitlements: Entitlement[];
}

export interface SignEntitlementOptions {
  privateKey: CryptoKey;
  keyId: string;
}

export interface VerifyEntitlementOptions {
  expectedIssuer: string;
  expectedAudience: string;
  nowSeconds: number;
  resolvePublicKey: (keyId: string) => Promise<CryptoKey | null>;
  isJtiReplayed: (jti: string) => Promise<boolean>;
}

export type EntitlementVerifyErrorCode =
  | "INVALID_TOKEN_FORMAT"
  | "INVALID_HEADER"
  | "INVALID_ALG"
  | "MISSING_KID"
  | "UNKNOWN_KID"
  | "INVALID_SIGNATURE"
  | "INVALID_CLAIMS"
  | "INVALID_ISSUER"
  | "INVALID_AUDIENCE"
  | "TOKEN_NOT_ACTIVE"
  | "TOKEN_EXPIRED"
  | "JTI_REPLAYED";

export interface EntitlementVerifyOk {
  ok: true;
  claims: EntitlementClaims;
}

export interface EntitlementVerifyError {
  ok: false;
  code: EntitlementVerifyErrorCode;
  message: string;
}

export type EntitlementVerifyResult =
  | EntitlementVerifyOk
  | EntitlementVerifyError;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeBase64Url(input: Uint8Array): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return new Uint8Array(Buffer.from(padded, "base64"));
}

function fail(
  code: EntitlementVerifyErrorCode,
  message: string,
): EntitlementVerifyError {
  return { ok: false, code, message };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEntitlementClaims(value: unknown): value is EntitlementClaims {
  if (!isObject(value)) {
    return false;
  }

  if (
    typeof value.iss !== "string" ||
    typeof value.aud !== "string" ||
    typeof value.sub !== "string" ||
    typeof value.jti !== "string" ||
    typeof value.iat !== "number" ||
    typeof value.nbf !== "number" ||
    typeof value.exp !== "number" ||
    typeof value.schemaVersion !== "number" ||
    typeof value.accountId !== "string" ||
    typeof value.deviceId !== "string" ||
    typeof value.licenseId !== "string"
  ) {
    return false;
  }

  if (
    !Number.isFinite(value.iat) ||
    !Number.isFinite(value.nbf) ||
    !Number.isFinite(value.exp) ||
    !Number.isFinite(value.schemaVersion)
  ) {
    return false;
  }

  if (value.accessStatus !== "active" && value.accessStatus !== "blocked") {
    return false;
  }

  const status = value.licenseStatus;
  if (
    status !== "ACTIVE" &&
    status !== "EXPIRED" &&
    status !== "TRIAL" &&
    status !== "REVOKED" &&
    status !== "NONE"
  ) {
    return false;
  }

  // licenseTier: accept known values, fall back to treating unknown strings as valid
  if (typeof value.licenseTier !== "string" || value.licenseTier.length === 0) {
    return false;
  }

  if (!Array.isArray(value.entitlements)) {
    return false;
  }

  for (const entitlement of value.entitlements) {
    if (!isObject(entitlement)) {
      return false;
    }
    if (
      typeof entitlement.featureId !== "string" ||
      typeof entitlement.granted !== "boolean"
    ) {
      return false;
    }
    if (
      entitlement.reason !== undefined &&
      typeof entitlement.reason !== "string"
    ) {
      return false;
    }
  }

  return true;
}

function encodeJson(value: unknown): string {
  return encodeBase64Url(encoder.encode(JSON.stringify(value)));
}

function decodeJson(value: string): unknown {
  const decoded = decoder.decode(decodeBase64Url(value));
  return JSON.parse(decoded);
}

export async function signEntitlementToken(
  claims: EntitlementClaims,
  options: SignEntitlementOptions,
): Promise<string> {
  if (!isEntitlementClaims(claims)) {
    throw new Error("Invalid entitlement claims");
  }

  const header = {
    alg: "EdDSA",
    typ: "JWT",
    kid: options.keyId,
  };

  const encodedHeader = encodeJson(header);
  const encodedClaims = encodeJson(claims);
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const signature = await crypto.subtle.sign(
    "Ed25519",
    options.privateKey,
    encoder.encode(signingInput),
  );

  return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyEntitlementToken(
  token: string,
  options: VerifyEntitlementOptions,
): Promise<EntitlementVerifyResult> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    return fail(
      "INVALID_TOKEN_FORMAT",
      "Token must have 3 dot-separated parts",
    );
  }

  const headerPart = parts[0];
  const payloadPart = parts[1];
  const signaturePart = parts[2];
  if (
    headerPart === undefined ||
    payloadPart === undefined ||
    signaturePart === undefined
  ) {
    return fail(
      "INVALID_TOKEN_FORMAT",
      "Token must have 3 dot-separated parts",
    );
  }

  let header: unknown;
  let claimsPayload: unknown;
  try {
    header = decodeJson(headerPart);
    claimsPayload = decodeJson(payloadPart);
  } catch {
    return fail(
      "INVALID_TOKEN_FORMAT",
      "Token payload is not valid base64url JSON",
    );
  }

  if (!isObject(header)) {
    return fail("INVALID_HEADER", "Token header must be an object");
  }

  if (header.alg !== "EdDSA") {
    return fail("INVALID_ALG", "Token algorithm must be EdDSA");
  }

  if (typeof header.kid !== "string" || header.kid.length === 0) {
    return fail("MISSING_KID", "Token header missing kid");
  }

  if (!isEntitlementClaims(claimsPayload)) {
    return fail(
      "INVALID_CLAIMS",
      "Token claims are invalid or missing required fields",
    );
  }

  const publicKey = await options.resolvePublicKey(header.kid);
  if (!publicKey) {
    return fail("UNKNOWN_KID", "Unknown key id");
  }

  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = Buffer.from(decodeBase64Url(signaturePart));
  const isValidSignature = await crypto.subtle.verify(
    "Ed25519",
    publicKey,
    signature,
    encoder.encode(signingInput),
  );
  if (!isValidSignature) {
    return fail("INVALID_SIGNATURE", "Token signature validation failed");
  }

  const claims = claimsPayload;
  if (claims.iss !== options.expectedIssuer) {
    return fail("INVALID_ISSUER", "Token issuer mismatch");
  }

  if (claims.aud !== options.expectedAudience) {
    return fail("INVALID_AUDIENCE", "Token audience mismatch");
  }

  if (options.nowSeconds < claims.nbf) {
    return fail("TOKEN_NOT_ACTIVE", "Token is not active yet");
  }

  if (options.nowSeconds >= claims.exp) {
    return fail("TOKEN_EXPIRED", "Token is expired");
  }

  const replayed = await options.isJtiReplayed(claims.jti);
  if (replayed) {
    return fail("JTI_REPLAYED", "Token jti has already been used");
  }

  return { ok: true, claims };
}
