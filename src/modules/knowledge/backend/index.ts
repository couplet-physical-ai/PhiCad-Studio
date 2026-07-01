import type { ModuleDefinition } from "../../../core/contracts/modules/backend-module";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { MentionRegistry } from "../../../core/backend/mentions";
import { registerRoutes } from "./routes";
import { PageRepository } from "./db/repositories/page-repository";
import { KnowledgePageMentionProvider } from "./providers/mention-provider";

export const definition: ModuleDefinition = {
  id: "knowledge",

  async onActivate(ctx) {
    ctx.logger.info("knowledge activated", {
      tablePrefix: ctx.db.tablePrefix,
    });

    const db = ctx.db.db as BetterSQLite3Database<Record<string, unknown>>;
    const pageRepo = new PageRepository(db);
    const mentionProvider = new KnowledgePageMentionProvider(pageRepo);
    MentionRegistry.get().register(mentionProvider);
  },

  async registerRoutes(router, ctx) {
    registerRoutes(router, ctx);
  },
};

export default definition;
