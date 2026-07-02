import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { type UnlistenFn } from "@tauri-apps/api/event";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button.tsx";
import type { ModuleDefinitionV2 } from "@shared/types";
import { ConnectionStatus } from "@/components/health/ConnectionStatus";

const SIDEBAR_WIDTH_PX = 75;
const DEFAULT_INSET_PX = 16;
const MAC_TRAFFIC_LIGHT_INSET_PX = 72;
type DragRegionStyle = CSSProperties & { WebkitAppRegion?: string };
const dragRegionStyle: DragRegionStyle = { WebkitAppRegion: "drag" };

function isTauriEnvironment() {
  if (typeof window === "undefined") {
    return false;
  }
  return "__TAURI__" in window;
}

function detectMacPlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const nav = navigator as Navigator & {
    userAgentData?: {
      platform?: string;
    };
  };

  const platformHint =
    nav.userAgentData?.platform ?? nav.platform ?? nav.userAgent;

  return typeof platformHint === "string" && /mac/i.test(platformHint);
}

type TopBarProps = {
  activeSpaceId: string | null;
  setActiveSpaceId: (spaceId: string | null) => void;
  spaces?: ModuleDefinitionV2[];
};

export default function TopBar({
  activeSpaceId,
  setActiveSpaceId,
  spaces = [],
}: TopBarProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const windowRef = useMemo(
    () => (isTauriEnvironment() ? getCurrentWindow() : undefined),
    [],
  );

  const isLikelyMac = useMemo(() => detectMacPlatform(), []);

  useEffect(() => {
    if (!windowRef) {
      return;
    }

    let mounted = true;
    let unlistenResize: UnlistenFn | undefined;

    const refreshFullscreen = async () => {
      try {
        const fullscreen = await windowRef.isFullscreen();
        if (mounted) {
          setIsFullscreen(fullscreen);
        }
      } catch (error: unknown) {
        console.error("Unable to determine fullscreen state", error);
      }
    };

    (async () => {
      await refreshFullscreen();
      try {
        unlistenResize = await windowRef.onResized(async () => {
          await refreshFullscreen();
        });
      } catch (error: unknown) {
        console.error("Unable to register window resize listener", error);
      }
    })();

    return () => {
      mounted = false;
      if (unlistenResize) {
        unlistenResize();
      }
    };
  }, [windowRef]);

  if (windowRef && isFullscreen) {
    return null;
  }

  const macPadding = isLikelyMac
    ? MAC_TRAFFIC_LIGHT_INSET_PX
    : DEFAULT_INSET_PX;
  const paddingLeftValue = `${SIDEBAR_WIDTH_PX + macPadding}px`;
  const paddingRightValue = `${SIDEBAR_WIDTH_PX + DEFAULT_INSET_PX}px`;

  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-12 w-full items-center bg-surface",
      )}
      data-tauri-drag-region
      style={{
        ...dragRegionStyle,
        paddingLeft: paddingLeftValue,
        paddingRight: paddingRightValue,
      }}
    >
      <div
        className="flex w-full items-center gap-4"
        data-tauri-drag-region
        style={dragRegionStyle}
      >
        <div
          className="flex flex-1 items-center justify-center"
          data-tauri-drag-region
          style={dragRegionStyle}
        >
          {/* Module spaces */}
          {spaces.map((space) => {
            return (
              <Button
                variant={space.id === activeSpaceId ? "default" : "ghost"}
                size="sm"
                className="mx-1"
                key={space.id}
                onClick={() => setActiveSpaceId(space.id)}
              >
                {space.label}
              </Button>
            );
          })}
        </div>

        <div className="flex-none px-2" data-tauri-drag-region>
          <ConnectionStatus />
        </div>
      </div>
    </header>
  );
}
