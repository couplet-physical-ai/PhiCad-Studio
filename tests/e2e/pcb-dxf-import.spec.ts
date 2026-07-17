import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RECT_DXF = path.join(__dirname, "fixtures", "board-rect.dxf");

/**
 * E2E for DXF board-outline import (Phase D). Opens the import dialog, uploads a
 * 40×25 mm rectangle DXF, picks the detected outer loop, and confirms the board
 * becomes a custom contour via the normal outline command.
 */
test("imports a board outline from a DXF file", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Design" }).first().click();
  await page.getByRole("tab", { name: "PCB" }).click();
  await expect(
    page.locator('[data-testid="designer-pcb-canvas"]'),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.getByRole("button", { name: /Import DXF/ }).click();

  // Upload the fixture; the inspect result lists one valid outer loop.
  await page.locator('input[type="file"]').setInputFiles(RECT_DXF);
  const importButton = page.getByRole("button", { name: "Import outline" });
  await expect(importButton).toBeEnabled();
  await expect(page.getByText(/40\.0 × 25\.0 mm/)).toBeVisible();

  await importButton.click();

  // The outline is now a custom contour and the tool is back to select.
  await expect(page.getByText("Custom shape")).toBeVisible();
  await expect(page.getByRole("button", { name: "Route (R)" })).toBeVisible();
});
