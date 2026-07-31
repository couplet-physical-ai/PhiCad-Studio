import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  Board3DSceneOverlay,
  MECHANICAL_PANEL_OPEN_KEY,
  readMechanicalPanelOpen,
  writeMechanicalPanelOpen,
  type Board3DInfo,
  type DisplayToggles,
} from "./Board3DOverlay";

const DISPLAY: DisplayToggles = {
  components: true,
  silkscreen: true,
  labels: true,
  heatmap: false,
  grid: true,
};

const BOARD: Board3DInfo = {
  widthMm: 100,
  heightMm: 80,
  layerCount: 2,
  thicknessMm: 1.6,
  parts: 12,
  traces: 34,
  vias: 5,
};

/** Minimal in-memory `window.localStorage` stand-in for the node test env. */
function stubStorage(seed: Record<string, string> = {}): Map<string, string> {
  const store = new Map<string, string>(Object.entries(seed));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
  });
  return store;
}

function renderOverlay(): string {
  return renderToStaticMarkup(
    <Board3DSceneOverlay
      cameraPreset="iso"
      scene="studio-dark"
      display={DISPLAY}
      board={BOARD}
      onSnapshot={() => {}}
    />,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mechanical panel persistence", () => {
  test("defaults to open when nothing is stored", () => {
    stubStorage();
    expect(readMechanicalPanelOpen()).toBe(true);
  });

  test("defaults to open when there is no window (SSR / node)", () => {
    expect(readMechanicalPanelOpen()).toBe(true);
  });

  test("round-trips through the designer-scoped localStorage key", () => {
    const store = stubStorage();

    writeMechanicalPanelOpen(false);
    expect(store.get(MECHANICAL_PANEL_OPEN_KEY)).toBe("false");
    expect(readMechanicalPanelOpen()).toBe(false);

    writeMechanicalPanelOpen(true);
    expect(store.get(MECHANICAL_PANEL_OPEN_KEY)).toBe("true");
    expect(readMechanicalPanelOpen()).toBe(true);
  });

  test("ignores an unparseable stored value", () => {
    stubStorage({ [MECHANICAL_PANEL_OPEN_KEY]: "yes" });
    expect(readMechanicalPanelOpen()).toBe(true);
  });

  test("uses the designer panel key namespace", () => {
    expect(MECHANICAL_PANEL_OPEN_KEY).toBe("openpcb:designer:mechanical-open");
  });
});

describe("Board3DSceneOverlay mechanical card", () => {
  test("renders the card plus a collapse affordance by default", () => {
    stubStorage();
    const markup = renderOverlay();

    expect(markup).toContain("Mechanical");
    expect(markup).toContain("Min enclosure");
    expect(markup).toContain('aria-label="Collapse mechanical panel"');
    expect(markup).not.toContain('aria-label="Show mechanical panel"');
  });

  test("collapses to a reopen affordance when persisted closed", () => {
    stubStorage({ [MECHANICAL_PANEL_OPEN_KEY]: "false" });
    const markup = renderOverlay();

    expect(markup).toContain('aria-label="Show mechanical panel"');
    expect(markup).not.toContain('aria-label="Collapse mechanical panel"');
    expect(markup).not.toContain("Min enclosure");
    expect(markup).not.toContain("Export STEP");
  });

  test("keeps the rest of the canvas chrome when collapsed", () => {
    stubStorage({ [MECHANICAL_PANEL_OPEN_KEY]: "false" });
    const markup = renderOverlay();

    expect(markup).toContain("Snapshot");
    expect(markup).toContain("Measure");
  });
});
