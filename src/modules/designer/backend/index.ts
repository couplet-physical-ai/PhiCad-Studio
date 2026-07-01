import type { ModuleDefinition } from "../../../core/contracts/modules/backend-module";
import { MODULE_SDK_TOKENS } from "../../../sdks";
import { MentionRegistry } from "../../../core/backend/mentions";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { registerRoutes } from "./routes";
import { buildDesignerSdk } from "./sdk";
import { DesignMentionProvider } from "./providers/mention-provider";

export const definition: ModuleDefinition = {
  id: "designer",

  async onActivate(ctx) {
    ctx.logger.info("designer activated", {
      tablePrefix: ctx.db.tablePrefix,
    });

    const db = ctx.db.db as BetterSQLite3Database<Record<string, unknown>>;
    const mentionProvider = new DesignMentionProvider(db);
    MentionRegistry.get().register(mentionProvider);
  },

  async registerSdk(ctx) {
    if (!ctx.sdk.has(MODULE_SDK_TOKENS.DESIGNER)) {
      ctx.sdk.registerValue(MODULE_SDK_TOKENS.DESIGNER, buildDesignerSdk(ctx));
    }
  },

  async registerRoutes(router, ctx) {
    registerRoutes(router, ctx);
  },
};

export default definition;
