import { expect, test } from "@playwright/test";

/**
 * E2E for the Board Shape draw tool (Phase A). Verifies the full path: enter the
 * board panel, launch the draw tool, click three vertices on the canvas, close
 * with Enter, and confirm the board outline becomes a custom contour.
 */
test("draws a custom board outline via the Board Shape tool", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Design" }).first().click();
  await page.getByRole("tab", { name: "PCB" }).click();

  const canvas = page.locator('[data-testid="designer-pcb-canvas"]');
  await expect(canvas).toBeVisible();

  // Open the board panel's edit view, then launch the draw tool.
  await page.getByRole("button", { name: "Edit" }).first().click();
  const drawButton = page.getByRole("button", { name: /Draw custom shape/ });
  await expect(drawButton).toBeVisible();
  await drawButton.click();

  // Drop three vertices, then close the polygon with Enter.
  await canvas.click({ position: { x: 250, y: 180 } });
  await canvas.click({ position: { x: 470, y: 180 } });
  await canvas.click({ position: { x: 470, y: 340 } });
  await page.keyboard.press("Enter");

  // The outline is now a free-form contour; the collapsed panel labels it so,
  // and the tool has returned to select (Route button back).
  await expect(page.getByText("Custom shape")).toBeVisible();
  await expect(page.getByRole("button", { name: "Route (R)" })).toBeVisible();

  // Re-enter board edit mode on the custom outline: the panel now shows the
  // read-only custom-shape branch (bbox + on-canvas editing hint), guarding the
  // parametric picker that would overwrite the drawn contour. It offers Redraw
  // and an explicit Reset to rectangle instead of Apply.
  await page.getByRole("button", { name: "Edit" }).first().click();
  await expect(
    page.getByRole("button", { name: /Reset to rectangle/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Redraw shape/ }),
  ).toBeVisible();
  await expect(canvas).toBeVisible();
});

test("shows a live typed-dimension readout while sketching", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Design" }).first().click();
  await page.getByRole("tab", { name: "PCB" }).click();
  const canvas = page.locator('[data-testid="designer-pcb-canvas"]');
  await expect(canvas).toBeVisible();

  // Enter the Board Shape tool via the toolbar and drop the first vertex.
  await page.getByRole("button", { name: /Board \(O\)/ }).click();
  await canvas.click({ position: { x: 250, y: 200 } });

  // Moving the cursor mounts the at-cursor readout (live length/angle).
  await canvas.hover({ position: { x: 430, y: 200 } });
  const box = page.locator('[data-testid="sketch-dim-entry"]');
  await expect(box).toBeVisible();

  // Typing a length echoes into the readout's length field (SolidWorks-style).
  await page.keyboard.press("2");
  await page.keyboard.press("0");
  await expect(box).toContainText("20");

  // The board-shape hint strip advertises the typed-entry keys.
  await expect(page.getByText("Length", { exact: false })).toBeVisible();
});

test("Board Shape tool toggles via toolbar button and O key", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Design" }).first().click();
  await page.getByRole("tab", { name: "PCB" }).click();
  const canvas = page.locator('[data-testid="designer-pcb-canvas"]');
  await expect(canvas).toBeVisible();

  const boardButton = page.getByRole("button", { name: /Board \(O\)/ });
  await expect(boardButton).toBeVisible();

  await expect(async () => {
    await boardButton.click();
    await expect(boardButton).toHaveAttribute("aria-pressed", "true", {
      timeout: 1_000,
    });
  }).toPass();

  // Escape exits back to select.
  await page.keyboard.press("Escape");
  await expect(boardButton).toHaveAttribute("aria-pressed", "false");

  // O key re-enters the tool.
  await canvas.focus().catch(() => {});
  await page.keyboard.press("o");
  await expect(boardButton).toHaveAttribute("aria-pressed", "true");
});
