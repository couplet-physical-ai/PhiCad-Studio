export const AUDIT_REDACTION = "[REDACTED]";

export interface LicenseAuditEvent {
  eventType: string;
  accountId: string | null;
  deviceId: string | null;
  stateFrom: string | null;
  stateTo: string | null;
  reasonCode?: string;
  details?: Record<string, unknown>;
}

interface LicenseAuditEventPayload extends LicenseAuditEvent {
  timestamp: string;
}

const REDACTED_KEYS = [
  "token",
  "secret",
  "session",
  "authorization",
  "cookie",
  "entitlementjws",
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function shouldRedactKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return REDACTED_KEYS.some((sensitive) => normalized.includes(sensitive));
}

function looksLikeJwt(value: string): boolean {
  const segments = value.split(".");
  return segments.length === 3 && segments.every((segment) => segment.length > 0);
}

export function redactAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactAuditValue(item));
  }

  if (isPlainObject(value)) {
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      next[key] = shouldRedactKey(key) ? AUDIT_REDACTION : redactAuditValue(nested);
    }
    return next;
  }

  if (typeof value === "string" && looksLikeJwt(value)) {
    return AUDIT_REDACTION;
  }

  return value;
}

export function emitLicenseAuditEvent(event: LicenseAuditEvent): void {
  const payload: LicenseAuditEventPayload = {
    ...event,
    reasonCode: event.reasonCode,
    details: (redactAuditValue(event.details ?? {}) as Record<string, unknown>) ?? {},
    timestamp: new Date().toISOString(),
  };

  console.info("[license-audit]", JSON.stringify(payload));
}
