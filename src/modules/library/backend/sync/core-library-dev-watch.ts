import { watch, type FSWatcher } from "node:fs";
import path from "node:path";
import type { CoreBackendModuleContext } from "../../../../core/contracts/modules/backend-module";
import { listCoreReleases, shouldImportBundledRelease } from "./bootstrap";
import { importOpclib } from "./opclib-importer";
import { locateBundledOpclib } from "./package-locator";
import { readOpclibFromPath } from "./opclib-reader";

const startedWatchDirs = new Set<string>();
const DEBOUNCE_MS = 250;

type Timer = ReturnType<typeof setTimeout> & { unref?: () => void };

export async function startCoreLibraryDevWatcher(
  ctx: CoreBackendModuleContext,
  initialBundledPath: string | null,
): Promise<FSWatcher | null> {
  if (process.env.NODE_ENV === "production") return null;
  const bundledPath = initialBundledPath ?? (await locateBundledOpclib());
  if (!bundledPath) return null;

  const watchDir = path.dirname(bundledPath);
  if (startedWatchDirs.has(watchDir)) return null;
  startedWatchDirs.add(watchDir);

  let timer: Timer | null = null;
  let importing = false;
  let queued = false;

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void runImport();
    }, DEBOUNCE_MS) as Timer;
    timer.unref?.();
  };

  const runImport = async (): Promise<void> => {
    if (importing) {
      queued = true;
      return;
    }
    importing = true;
    try {
      await importLatestDevPackage(ctx);
    } catch (error) {
      ctx.logger.warn("core-library: live import skipped", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      importing = false;
      if (queued) {
        queued = false;
        schedule();
      }
    }
  };

  const watcher = watch(watchDir, { persistent: false }, schedule);
  watcher.unref?.();
  ctx.logger.info(`core-library: watching bundled package directory ${watchDir}`);
  return watcher;
}

async function importLatestDevPackage(
  ctx: CoreBackendModuleContext,
): Promise<void> {
  const bundledPath = await locateBundledOpclib();
  if (!bundledPath) return;
  const pkg = await readOpclibFromPath(bundledPath);
  if (pkg.manifest.library.id !== "openpcb.core") return;
  if (!shouldImportBundledRelease(listCoreReleases(ctx), pkg)) return;

  const imported = await importOpclib(ctx, pkg, { installOrigin: "bundled" });
  ctx.logger.info(
    `core-library: live-imported ${imported.sourceId}@${imported.version} from ${bundledPath}`,
  );
}
