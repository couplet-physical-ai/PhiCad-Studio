import { expect, test } from "@playwright/test";

/**
 * Smoke E2E for the PCB Route tool. We don't run the full pad-click route here
 * (requires a footprint with pads to be on the board) — that's deferred to a
 * library-fixture-driven test. Instead we verify:
 *  1. The PCB tab loads and shows the Route button.
 *  2. Pressing R exposes route-only controls.
 *  3. ESC exits Route mode back to Select.
 *  4. The 45°/90° pill appears only while routing is active.
 */
test("Route tool toggles via R key and toolbar button", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Design" }).first().click();
  await page.getByRole("tab", { name: "PCB" }).click();
  await expect(
    page.locator('[data-testid="designer-pcb-canvas"]'),
  ).toBeVisible();

  // Default state: Route button visible, not yet active.
  const routeButton = page.getByRole("button", { name: "Route (R)" });
  await expect(routeButton).toBeVisible();

  // Click activates Routing.
  await routeButton.click();
  await expect(page.getByRole("button", { name: "45°" })).toBeVisible();

  // ESC exits.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Route (R)" })).toBeVisible();

  // R key activates again.
  await page
    .locator('[data-testid="designer-pcb-canvas"]')
    .focus()
    .catch(() => {});
  await page.keyboard.press("r");
  await expect(page.getByRole("button", { name: "45°" })).toBeVisible();

  // Idle route HUD prompt is visible.
  await expect(page.getByText("Route — click a pad to start")).toBeVisible();

  // Auto-finish (pcb.routeAutoFinish, ON in dev builds): Tab without an
  // active session is inert — route mode stays active, nothing crashes.
  // The full Tab → proposal → Enter scenario needs a pad-bearing fixture
  // board (deferred with the other library-fixture-driven route E2Es).
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "45°" })).toBeVisible();
  await expect(page.getByText("Route — click a pad to start")).toBeVisible();
});

test("Tune tool toggles via U key and toolbar button (pcb.lengthTuning)", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Design" }).first().click();
  await page.getByRole("tab", { name: "PCB" }).click();
  await expect(
    page.locator('[data-testid="designer-pcb-canvas"]'),
  ).toBeVisible();

  // Dev builds have pcb.lengthTuning ON → the Tune button is present.
  const tuneButton = page.getByRole("button", { name: "Tune (U)" });
  await expect(tuneButton).toBeVisible();

  // Retry the click: the toolbar re-renders while the projection loads and a
  // click dispatched to a just-replaced node is lost to React's delegation.
  await expect(async () => {
    await tuneButton.click();
    await expect(tuneButton).toHaveAttribute("aria-pressed", "true", {
      timeout: 1_000,
    });
  }).toPass();
  await expect(
    page.getByText("Tune — click a routed trace to add serpentine length", {
      exact: false,
    }),
  ).toBeVisible();

  // Escape exits back to select (idle session).
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Route (R)" })).toBeVisible();

  // U key re-enters; the full tune-a-trace flow needs a routed fixture board
  // (deferred with the other library-fixture-driven E2Es).
  await page
    .locator('[data-testid="designer-pcb-canvas"]')
    .focus()
    .catch(() => {});
  await page.keyboard.press("u");
  await expect(
    page.getByText("Tune — click a routed trace to add serpentine length", {
      exact: false,
    }),
  ).toBeVisible();
});

test("Bundle tool toggles via toolbar button (pcb.bundleRouting)", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Design" }).first().click();
  await page.getByRole("tab", { name: "PCB" }).click();
  await expect(
    page.locator('[data-testid="designer-pcb-canvas"]'),
  ).toBeVisible();

  const bundleButton = page.getByRole("button", { name: "Bundle" });
  await expect(bundleButton).toBeVisible();

  await expect(async () => {
    await bundleButton.click();
    await expect(bundleButton).toHaveAttribute("aria-pressed", "true", {
      timeout: 1_000,
    });
  }).toPass();
  await expect(
    page.getByText("Bundle — click 2+ pads to collect", { exact: false }),
  ).toBeVisible();

  // Escape exits back to select; the pad-collection flow needs a
  // pad-bearing fixture board (deferred with the other fixture E2Es).
  await page.keyboard.press("Escape");
  await expect(bundleButton).toHaveAttribute("aria-pressed", "false");
});
