import type { Kysely } from "kysely";
import type { Database } from "./db/types.ts";
import type { Config } from "./config.ts";
import type { FeedbackService } from "./services/feedback.ts";
import type { AnalyticsService } from "./services/analytics.ts";
import type { SessionService } from "./services/session.ts";
import type { FileStorageService } from "./services/file-storage.ts";
import type { MagicLinkAuthService } from "./services/magic-link-auth.ts";
import type { EntitlementService } from "./services/entitlement.ts";
import type { DeviceSlotPolicyService } from "./services/device-slot-policy.ts";

export interface AppContext {
  config: Config;
  db: Kysely<Database>;
  feedbackService: FeedbackService;
  analyticsService: AnalyticsService;
  sessionService: SessionService;
  fileStorage: FileStorageService;
  magicLinkAuthService: MagicLinkAuthService;
  entitlementService: EntitlementService;
  deviceSlotPolicyService: DeviceSlotPolicyService;
}
