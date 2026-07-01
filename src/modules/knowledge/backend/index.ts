import type { ModuleDefinition } from "../../core/contracts/modules/backend-module";
import { registerRoutes } from "./routes";

export const definition: ModuleDefinition = {
  id: "knowledge",

  async onActivate(ctx) {
    ctx.logger.info("knowledge activated", {
      tablePrefix: ctx.db.tablePrefix,
    });
  },

  async registerRoutes(router, ctx) {
    registerRoutes(router, ctx);
  },
};

export default definition;
