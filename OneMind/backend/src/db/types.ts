import type {
  ColumnType,
  Generated,
  Insertable,
  Selectable,
  Updateable,
} from "kysely";

export interface Database {
  feedback: FeedbackTable;
  analytics_events: AnalyticsEventsTable;
  sessions: SessionsTable;
  accounts: AccountsTable;
  magic_link_tokens: MagicLinkTokensTable;
  license_entitlements: LicenseEntitlementsTable;
  device_slots: DeviceSlotsTable;
}

export interface FeedbackTable {
  id: string;
  email: string | null;
  type: string;
  status: string;
  message: string;
  timestamp: string;
  app_version: string;
  user_agent: string;
  system_context: string | null;
  files: string | null;
  platform: string | null;
  notes: string | null;
  received_at: string;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type FeedbackRow = Selectable<FeedbackTable>;
export type NewFeedback = Insertable<FeedbackTable>;
export type FeedbackUpdate = Updateable<FeedbackTable>;

export interface AnalyticsEventsTable {
  id: string;
  event_name: string;
  event_category: string;
  session_id: string | null;
  app_version: string;
  platform: string;
  properties: string | null;
  timestamp: string;
  received_at: string;
}

export type AnalyticsEventRow = Selectable<AnalyticsEventsTable>;
export type NewAnalyticsEvent = Insertable<AnalyticsEventsTable>;

export interface SessionsTable {
  id: string;
  created_at: string;
  expires_at: string;
}

export type SessionRow = Selectable<SessionsTable>;
export type NewSession = Insertable<SessionsTable>;

export interface AccountsTable {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
  alpha_enrolled_at: ColumnType<
    string | null,
    string | null | undefined,
    string | null
  >;
}

export type AccountRow = Selectable<AccountsTable>;
export type NewAccount = Insertable<AccountsTable>;

export interface MagicLinkTokensTable {
  id: string;
  account_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
}

export type MagicLinkTokenRow = Selectable<MagicLinkTokensTable>;
export type NewMagicLinkToken = Insertable<MagicLinkTokensTable>;

export interface LicenseEntitlementsTable {
  id: string;
  account_id: string;
  device_id: string;
  license_id: string;
  license_status: string;
  license_tier: ColumnType<string, string | undefined, string>;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
}

export type LicenseEntitlementRow = Selectable<LicenseEntitlementsTable>;
export type NewLicenseEntitlement = Insertable<LicenseEntitlementsTable>;

export interface DeviceSlotsTable {
  id: string;
  account_id: string;
  slot_index: number;
  device_id: string;
  activated_at: string;
  updated_at: string;
}

export type DeviceSlotRow = Selectable<DeviceSlotsTable>;
export type NewDeviceSlot = Insertable<DeviceSlotsTable>;
