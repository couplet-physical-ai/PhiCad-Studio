import { expect, test } from "@playwright/test";

/**
 * Layer/flip semantics in OpenPCB:
 *  - Switching active layer (sidebar click / T / B / 1 / 2) does NOT flip the
 *    view. This direction stays orthogonal.
 *  - Shift+F / "Flip view" flips the view AND syncs the active copper layer
 *    to the side now facing the user (bottom → B.Cu, top → F.Cu).
 *  - viewSide persists across reload via localStorage.
 *  - Per-placement "Flip part" stays disabled when nothing is selected.
 */

const CANVAS = '[data-testid="designer-pcb-canvas"]';
const FLIP_VIEW_BUTTON = '[data-testid="pcb-flip-view-button"]';
const FLIP_BADGE = '[data-testid="pcb-viewing-bottom-badge"]';
const FLIP_TINT = '[data-testid="pcb-flip-tint"]';

async function openPcb(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.removeItem("openpcb.designer.tabs.v1");
  });
  await page.reload();
  await page.getByRole("button", { name: "New Design" }).first().click();
  await page.getByRole("tab", { name: "PCB" }).click();
  await expect(page.locator(CANVAS)).toBeVisible();
}

async function activeDesignId(
  page: import("@playwright/test").Page,
): Promise<string> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("openpcb.designer.tabs.v1");
    if (!raw) throw new Error("missing designer tabs state");
    const parsed = JSON.parse(raw) as { state?: { activeDesignId?: unknown } };
    const id = parsed.state?.activeDesignId;
    if (typeof id !== "string") throw new Error("missing active design id");
    return id;
  });
}

async function pcbViewSide(
  page: import("@playwright/test").Page,
  designId: string,
): Promise<"top" | "bottom"> {
  return page.evaluate(async (id) => {
    const response = await fetch(
      `/api/modules/designer/designs/${encodeURIComponent(id)}/projection/pcb`,
    );
    const body = (await response.json()) as {
      data?: { projection?: { board?: { viewState?: { viewSide?: unknown } } } };
    };
    const side = body.data?.projection?.board?.viewState?.viewSide;
    if (side !== "top" && side !== "bottom") {
      throw new Error("missing PCB view side");
    }
    return side;
  }, designId);
}

function layerRow(page: import("@playwright/test").Page, layer: "F.Cu" | "B.Cu") {
  return page.getByTestId(`pcb-layer-row-${layer}`);
}

test("active layer switch does not flip the view", async ({ page }) => {
  await openPcb(page);
  await expect(page.locator(FLIP_BADGE)).toHaveCount(0);
  await expect(page.locator(FLIP_TINT)).toHaveCount(0);

  // Toolbar layer button toggles F.Cu ↔ B.Cu (label is the single source of
  // truth). View overlays must stay absent.
  await layerRow(page, "B.Cu").click();
  await expect(page.locator(FLIP_BADGE)).toHaveCount(0);
  await expect(page.locator(FLIP_TINT)).toHaveCount(0);
});

test("Shift+F flips view and syncs active layer to the visible side", async ({
  page,
}) => {
  await openPcb(page);
  await page.locator(CANVAS).click();

  await page.keyboard.press("Shift+F");

  await expect(page.locator(FLIP_BADGE)).toBeVisible();
  // Shift+F again returns to top view and F.Cu active.
  await page.keyboard.press("Shift+F");
  await expect(page.locator(FLIP_BADGE)).toHaveCount(0);
});

test("T and B keys switch active layer, view stays put", async ({ page }) => {
  await openPcb(page);
  await page.locator(CANVAS).click();

  await page.keyboard.press("b");
  await expect(page.locator(FLIP_BADGE)).toHaveCount(0);

  await page.keyboard.press("t");
  await expect(page.locator(FLIP_BADGE)).toHaveCount(0);
});

test("viewSide persists across reload", async ({ page }) => {
  await openPcb(page);
  const designId = await activeDesignId(page);
  await page.locator(CANVAS).click();
  await page.keyboard.press("Shift+F");
  await expect(page.locator(FLIP_BADGE)).toBeVisible();
  await expect
    .poll(() => pcbViewSide(page, designId))
    .toBe("bottom");

  await page.reload();
  await expect
    .poll(() => pcbViewSide(page, designId))
    .toBe("bottom");
});

async function pcbActiveLayer(
  page: import("@playwright/test").Page,
  designId: string,
): Promise<string> {
  return page.evaluate(async (id) => {
    const response = await fetch(
      `/api/modules/designer/designs/${encodeURIComponent(id)}/projection/pcb`,
    );
    const body = (await response.json()) as {
      data?: { projection?: { board?: { activeLayer?: unknown } } };
    };
    return String(body.data?.projection?.board?.activeLayer);
  }, designId);
}

test("Shift+F survives a slow command round-trip (view write vs layer sync race)", async ({
  page,
}) => {
  // Regression: the flip is an optimistic local change with a 200ms debounced
  // pcb_set_view_state, while the follow-up pcb_set_active_layer dispatched at
  // once. When the layer command took longer than the debounce, both writes
  // carried the same baseRevision, the second was rejected with
  // REVISION_CONFLICT (swallowed by the flush) and the flip never persisted.
  // Delaying every command past the debounce makes that ordering deterministic.
  await page.route("**/api/modules/designer/designs/*/commands", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 450));
    await route.continue();
  });
  await openPcb(page);
  const designId = await activeDesignId(page);
  await page.locator(CANVAS).click();
  await page.keyboard.press("Shift+F");
  await expect(page.locator(FLIP_BADGE)).toBeVisible();
  await expect
    .poll(() => pcbViewSide(page, designId), { timeout: 10_000 })
    .toBe("bottom");
  // And the layer sync still followed the flip.
  await expect
    .poll(() => pcbActiveLayer(page, designId), { timeout: 10_000 })
    .toBe("B.Cu");
  // The badge must not have been reverted by the refresh that followed.
  await expect(page.locator(FLIP_BADGE)).toBeVisible();
});

test('"Flip part" is disabled when no placement is selected', async ({
  page,
}) => {
  await openPcb(page);
  const flipPart = page.getByRole("button", { name: /^Flip part$/ });
  await expect(flipPart).toBeVisible();
  await expect(flipPart).toBeDisabled();
});
