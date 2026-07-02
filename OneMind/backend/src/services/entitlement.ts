import type { Kysely } from "kysely";
import type { Database } from "../db/types.ts";
import type {
  DeviceSlotPolicyService,
  ReplaceOldestPrompt,
} from "./device-slot-policy.ts";
import {
  signEntitlementToken,
  asLicenseStatus,
  type EntitlementClaims,
  type EntitlementLicenseStatus,
  type LicenseTier,
} from "../license/entitlement-crypto.ts";
import { emitLicenseAuditEvent } from "./license-audit.ts";
import { generateUuidV7Like } from "../utils/id.ts";

const ENTITLEMENT_TTL_SECONDS = 60 * 60;
const ENTITLEMENT_SCHEMA_VERSION = 2;

type AccessStatus = "active" | "blocked";

export type EntitlementErrorCode =
  | "ACCOUNT_NOT_FOUND"
  | "ENTITLEMENT_NOT_FOUND"
  | "ENTITLEMENT_INVALID_STATUS"
  | "ENTITLEMENT_KEY_UNAVAILABLE"
  | "DEVICE_SLOT_REPLACEMENT_REQUIRED";

export interface EntitlementError {
  ok: false;
  code: EntitlementErrorCode;
  message: string;
  replaceOldestPrompt?: ReplaceOldestPrompt;
}

export interface EntitlementSuccess {
  ok: true;
  token: string;
  expiresAt: string;
  claims: EntitlementClaims;
}

export type EntitlementResult = EntitlementSuccess | EntitlementError;

export interface EntitlementServiceOptions {
  issuer: string;
  audience: string;
  keyId: string;
  now?: () => Date;
  privateKey?: CryptoKey;
  publicKey?: CryptoKey;
}

interface EntitlementInput {
  accountId: string;
  deviceId: string;
  licenseId: string;
  replaceOldest?: boolean;
  tier?: LicenseTier;
}

function mapLicenseStatus(status: EntitlementLicenseStatus): AccessStatus {
  return status === "ACTIVE" || status === "TRIAL" ? "active" : "blocked";
}

function entitlementsForTier(
  tier: string,
  status: EntitlementLicenseStatus,
): EntitlementClaims["entitlements"] {
  if (status !== "ACTIVE" && status !== "TRIAL") {
    return [
      { featureId: "chat.core", granted: false, reason: "license_blocked" },
    ];
  }
  const base: EntitlementClaims["entitlements"] = [
    { featureId: "chat.core", granted: true },
  ];
  if (tier === "alpha-tester") {
    return [
      ...base,
      { featureId: "chat.advanced-models", granted: true },
      { featureId: "modules.knowledge", granted: true },
      { featureId: "modules.custom", granted: true },
      { featureId: "export.unlimited", granted: true },
    ];
  }
  if (tier === "pro") {
    return [...base];
  }
  return base;
}

export class EntitlementService {
  private readonly now: () => Date;

  private constructor(
    private readonly db: Kysely<Database>,
    private readonly deviceSlotPolicyService: DeviceSlotPolicyService,
    private readonly issuer: string,
    private readonly audience: string,
    private readonly keyId: string,
    private readonly privateKey: CryptoKey,
    private readonly publicKey: CryptoKey,
    now: (() => Date) | undefined,
  ) {
    this.now = now ?? (() => new Date());
  }

  static async create(
    db: Kysely<Database>,
    deviceSlotPolicyService: DeviceSlotPolicyService,
    options: EntitlementServiceOptions,
  ): Promise<EntitlementService> {
    let privateKey: CryptoKey;
    let publicKey: CryptoKey;
    if (options.privateKey && options.publicKey) {
      privateKey = options.privateKey;
      publicKey = options.publicKey;
    } else {
      const generated = await crypto.subtle.generateKey(
        { name: "Ed25519" },
        true,
        ["sign", "verify"],
      );
      if (!("privateKey" in generated) || !("publicKey" in generated)) {
        throw new Error("Failed to generate entitlement key pair");
      }
      const keyPair = generated as CryptoKeyPair;
      privateKey = keyPair.privateKey;
      publicKey = keyPair.publicKey;
    }

    return new EntitlementService(
      db,
      deviceSlotPolicyService,
      options.issuer,
      options.audience,
      options.keyId,
      privateKey,
      publicKey,
      options.now,
    );
  }

  getKeyId(): string {
    return this.keyId;
  }

  async getPublicKey(keyId: string): Promise<CryptoKey | null> {
    if (keyId !== this.keyId) {
      return null;
    }
    return this.publicKey;
  }

  async issue(input: EntitlementInput): Promise<EntitlementResult> {
    const accountExists = await this.db
      .selectFrom("accounts")
      .select("id")
      .where("id", "=", input.accountId)
      .executeTakeFirst();
    if (!accountExists) {
      return {
        ok: false,
        code: "ACCOUNT_NOT_FOUND",
        message: "Account not found",
      };
    }

    const slotResult = await this.deviceSlotPolicyService.enforce({
      accountId: input.accountId,
      deviceId: input.deviceId,
      replaceOldest: input.replaceOldest,
    });
    if (!slotResult.ok) {
      emitLicenseAuditEvent({
        eventType: "license.device.replacement_required",
        accountId: input.accountId,
        deviceId: input.deviceId,
        stateFrom: "active",
        stateTo: "active",
        reasonCode: slotResult.prompt.code,
        details: {
          replaceOldest: input.replaceOldest === true,
          prompt: slotResult.prompt,
          licenseId: input.licenseId,
        },
      });

      return {
        ok: false,
        code: slotResult.prompt.code,
        message: slotResult.prompt.message,
        replaceOldestPrompt: slotResult.prompt,
      };
    }

    const nowIso = this.now().toISOString();
    const existing = await this.db
      .selectFrom("license_entitlements")
      .selectAll()
      .where("account_id", "=", input.accountId)
      .where("device_id", "=", input.deviceId)
      .executeTakeFirst();

    let licenseStatus: EntitlementLicenseStatus = "ACTIVE";
    if (existing && existing.license_status === "REVOKED") {
      licenseStatus = "REVOKED";
    }

    if (!existing) {
      await this.db
        .insertInto("license_entitlements")
        .values({
          id: generateUuidV7Like(),
          account_id: input.accountId,
          device_id: input.deviceId,
          license_id: input.licenseId,
          license_status: licenseStatus,
          created_at: nowIso,
          updated_at: nowIso,
          revoked_at: licenseStatus === "REVOKED" ? nowIso : null,
        })
        .execute();
    } else {
      await this.db
        .updateTable("license_entitlements")
        .set({
          license_id: input.licenseId,
          license_status: licenseStatus,
          updated_at: nowIso,
          revoked_at:
            licenseStatus === "REVOKED" ? existing.revoked_at ?? nowIso : null,
        })
        .where("id", "=", existing.id)
        .execute();
    }

    emitLicenseAuditEvent({
      eventType: "license.entitlement.issue",
      accountId: input.accountId,
      deviceId: input.deviceId,
      stateFrom: existing
        ? mapLicenseStatus(asLicenseStatus(existing.license_status))
        : null,
      stateTo: mapLicenseStatus(licenseStatus),
      reasonCode: existing ? "ENTITLEMENT_UPDATED" : "ENTITLEMENT_CREATED",
      details: {
        licenseId: input.licenseId,
        licenseStatus,
      },
    });

    return this.signForStatus(input, licenseStatus);
  }

  async refresh(input: EntitlementInput): Promise<EntitlementResult> {
    const existing = await this.db
      .selectFrom("license_entitlements")
      .selectAll()
      .where("account_id", "=", input.accountId)
      .where("device_id", "=", input.deviceId)
      .executeTakeFirst();

    if (!existing) {
      emitLicenseAuditEvent({
        eventType: "license.entitlement.validation",
        accountId: input.accountId,
        deviceId: input.deviceId,
        stateFrom: null,
        stateTo: null,
        reasonCode: "ENTITLEMENT_NOT_FOUND",
        details: {
          licenseId: input.licenseId,
        },
      });

      return {
        ok: false,
        code: "ENTITLEMENT_NOT_FOUND",
        message: "Entitlement not found",
      };
    }

    if (
      existing.license_status !== "ACTIVE" &&
      existing.license_status !== "TRIAL" &&
      existing.license_status !== "REVOKED"
    ) {
      emitLicenseAuditEvent({
        eventType: "license.entitlement.validation",
        accountId: input.accountId,
        deviceId: input.deviceId,
        stateFrom: mapLicenseStatus(asLicenseStatus(existing.license_status)),
        stateTo: "restricted",
        reasonCode: "ENTITLEMENT_INVALID_STATUS",
        details: {
          licenseId: input.licenseId,
          licenseStatus: existing.license_status,
        },
      });

      return {
        ok: false,
        code: "ENTITLEMENT_INVALID_STATUS",
        message: "Entitlement status is invalid",
      };
    }

    await this.db
      .updateTable("license_entitlements")
      .set({
        license_id: input.licenseId,
        updated_at: this.now().toISOString(),
      })
      .where("id", "=", existing.id)
      .execute();

    emitLicenseAuditEvent({
      eventType: "license.entitlement.validation",
      accountId: input.accountId,
      deviceId: input.deviceId,
      stateFrom: mapLicenseStatus(asLicenseStatus(existing.license_status)),
      stateTo: mapLicenseStatus(asLicenseStatus(existing.license_status)),
      reasonCode: "ENTITLEMENT_REFRESHED",
      details: {
        licenseId: input.licenseId,
        licenseStatus: existing.license_status,
      },
    });

    return this.signForStatus(input, asLicenseStatus(existing.license_status));
  }

  async revoke(input: EntitlementInput): Promise<EntitlementResult> {
    const accountExists = await this.db
      .selectFrom("accounts")
      .select("id")
      .where("id", "=", input.accountId)
      .executeTakeFirst();
    if (!accountExists) {
      return {
        ok: false,
        code: "ACCOUNT_NOT_FOUND",
        message: "Account not found",
      };
    }

    const nowIso = this.now().toISOString();
    const existing = await this.db
      .selectFrom("license_entitlements")
      .selectAll()
      .where("account_id", "=", input.accountId)
      .where("device_id", "=", input.deviceId)
      .executeTakeFirst();

    if (!existing) {
      await this.db
        .insertInto("license_entitlements")
        .values({
          id: generateUuidV7Like(),
          account_id: input.accountId,
          device_id: input.deviceId,
          license_id: input.licenseId,
          license_status: "REVOKED",
          created_at: nowIso,
          updated_at: nowIso,
          revoked_at: nowIso,
        })
        .execute();
    } else {
      await this.db
        .updateTable("license_entitlements")
        .set({
          license_id: input.licenseId,
          license_status: "REVOKED",
          updated_at: nowIso,
          revoked_at: nowIso,
        })
        .where("id", "=", existing.id)
        .execute();
    }

    emitLicenseAuditEvent({
      eventType: "license.entitlement.revocation",
      accountId: input.accountId,
      deviceId: input.deviceId,
      stateFrom: existing
        ? mapLicenseStatus(asLicenseStatus(existing.license_status))
        : null,
      stateTo: "blocked",
      reasonCode: "ACCESS_BLOCKED",
      details: {
        licenseId: input.licenseId,
      },
    });

    return this.signForStatus(input, "REVOKED");
  }

  private async signForStatus(
    input: EntitlementInput,
    licenseStatus: EntitlementLicenseStatus,
  ): Promise<EntitlementResult> {
    if (!this.privateKey) {
      return {
        ok: false,
        code: "ENTITLEMENT_KEY_UNAVAILABLE",
        message: "Entitlement signer is unavailable",
      };
    }

    const tier: LicenseTier = input.tier ?? "alpha-tester";
    const nowSeconds = Math.floor(this.now().getTime() / 1000);
    const claims: EntitlementClaims = {
      iss: this.issuer,
      aud: this.audience,
      sub: input.accountId,
      jti: crypto.randomUUID(),
      iat: nowSeconds,
      nbf: nowSeconds,
      exp: nowSeconds + ENTITLEMENT_TTL_SECONDS,
      schemaVersion: ENTITLEMENT_SCHEMA_VERSION,
      accountId: input.accountId,
      deviceId: input.deviceId,
      licenseId: input.licenseId,
      accessStatus: mapLicenseStatus(licenseStatus),
      licenseStatus,
      licenseTier: tier,
      entitlements: entitlementsForTier(tier, licenseStatus),
    };

    const token = await signEntitlementToken(claims, {
      privateKey: this.privateKey,
      keyId: this.keyId,
    });

    return {
      ok: true,
      token,
      expiresAt: new Date(claims.exp * 1000).toISOString(),
      claims,
    };
  }
}
