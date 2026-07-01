import type { ModuleDefinition } from "../../../core/contracts/modules/backend-module";
import { MODULE_SDK_TOKENS } from "../../../sdks";
import { MentionRegistry } from "../../../core/backend/mentions";
import { getDb } from "./queries";
import { rebuildPreviewModelsIfStale } from "./builtins/migrate-preview-models";
import { buildSdk } from "./queries";
import { registerRoutes } from "./routes";
import { bootstrapCoreLibrary } from "./sync/bootstrap";
import { startCoreLibraryDevWatcher } from "./sync/core-library-dev-watch";
import { LibraryComponentMentionProvider } from "./providers/mention-provider";

/**
 * `openpcb.core` is shipped as a `.opclib` package and imported on boot via
 * `bootstrapCoreLibrary` when the bundled release is missing or newer.
 */
export const definition: ModuleDefinition = {
  id: "library",

  async onActivate(ctx) {
    const db = getDb(ctx);
    const mentionProvider = new LibraryComponentMentionProvider(db);
    MentionRegistry.get().register(mentionProvider);

    const bootstrap = await bootstrapCoreLibrary(ctx);
    void startCoreLibraryDevWatcher(ctx, bootstrap.bundledPath).catch((error) => {
      ctx.logger.warn("core-library: dev watcher unavailable", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    const rebuildResult = rebuildPreviewModelsIfStale(ctx);
    ctx.logger.info("library activated", {
      tablePrefix: ctx.db.tablePrefix,
      coreAlreadyInstalled: bootstrap.alreadyInstalled,
      bundledPath: bootstrap.bundledPath,
      coreImported: bootstrap.imported
        ? {
            version: bootstrap.imported.version,
            symbols: bootstrap.imported.inserted.symbols,
            footprints: bootstrap.imported.inserted.footprints,
            components: bootstrap.imported.inserted.components,
            variants: bootstrap.imported.inserted.variants,
            modelsWritten: bootstrap.imported.models.written,
            modelsDeduped: bootstrap.imported.models.deduped,
          }
        : null,
      rebuiltSymbols: rebuildResult.rebuiltSymbols,
      rebuildMs: rebuildResult.ms,
    });
  },

  async registerSdk(ctx) {
    if (!ctx.sdk.has(MODULE_SDK_TOKENS.LIBRARY)) {
      ctx.sdk.registerValue(MODULE_SDK_TOKENS.LIBRARY, buildSdk(ctx));
    }
  },

  async registerRoutes(router, ctx) {
    registerRoutes(router, ctx);
  },
};

export default definition;
