import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Regression: dragging a schematic part must not flash the part (or its
 * wires) back to the pre-drag position while the move commands + projection
 * refresh are in flight (optimistic `pendingMove` overlay in
 * SchematicCanvas). The part is located and tracked by scanning for its
 * saturated-blue pin dots on the WebGL canvas, so the test is independent of
 * camera math and works in both themes (text/body strokes are excluded by
 * the color predicate).
 */

const API = "http://127.0.0.1:3000/api/modules";

function pinDef(id: string, number: string, x: number) {
  return {
    id,
    name: id,
    number,
    electricalType: "passive",
    positionMm: { x, y: 0 },
    lengthMm: 1,
    rotationDeg: 0,
    unit: 1,
    hidden: false,
  };
}

async function importDrawnComponent(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${API}/library/imports/drawn`, {
    data: {
      drawnSymbol: {
        source: {
          name: "MoveProbe",
          unitCount: 1,
          referenceText: "U?",
          valueText: "MoveProbe",
          pins: [pinDef("pin-1", "1", -2), pinDef("pin-2", "2", 2)],
          graphics: [
            {
              unit: 1,
              graphic: {
                kind: "rect",
                x: -1,
                y: -0.8,
                width: 2,
                height: 1.6,
                fill: "none",
                strokeWidthMm: 0.12,
              },
            },
          ],
          warnings: [],
        },
        referencePrefix: "U",
      },
      footprintMode: "none",
      component: { name: "Move Probe", description: "drag regression probe" },
    },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { data?: { componentId?: string } };
  if (!body.data?.componentId) throw new Error("drawn import failed");
  return body.data.componentId;
}

async function dispatch(
  request: APIRequestContext,
  designId: string,
  baseRevision: number,
  command: Record<string, unknown>,
): Promise<void> {
  const response = await request.post(`${API}/designer/designs/${designId}/commands`, {
    data: {
      commandId: crypto.randomUUID(),
      sessionId: "e2e-move",
      aggregateId: designId,
      baseRevision,
      issuedAt: Date.now(),
      command,
    },
  });
  expect(response.ok()).toBeTruthy();
}

interface BlueStats {
  count: number;
  cx: number;
  cy: number;
}

interface DotCluster {
  cx: number;
  cy: number;
  count: number;
}

/** Find saturated-blue pin-dot clusters (grouped by x-gaps), left→right. */
async function blueClusters(page: Page, png: Buffer): Promise<DotCluster[]> {
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const points: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < bitmap.height; y += 1) {
      for (let x = 0; x < bitmap.width; x += 1) {
        const i = (y * bitmap.width + x) * 4;
        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;
        if (b > 140 && r < 110 && b - g > 50) points.push({ x, y });
      }
    }
    points.sort((p, q) => p.x - q.x);
    const clusters: Array<{ xs: number[]; ys: number[] }> = [];
    for (const p of points) {
      const last = clusters[clusters.length - 1];
      const lastX = last ? last.xs[last.xs.length - 1]! : null;
      if (last && lastX !== null && p.x - lastX <= 40) {
        last.xs.push(p.x);
        last.ys.push(p.y);
      } else {
        clusters.push({ xs: [p.x], ys: [p.y] });
      }
    }
    return clusters.map((c) => ({
      cx: c.xs.reduce((a, v) => a + v, 0) / c.xs.length,
      cy: c.ys.reduce((a, v) => a + v, 0) / c.ys.length,
      count: c.xs.length,
    }));
  }, png.toString("base64"));
}

/** Decode a PNG in the browser and count saturated-blue pixels (schematic pin
 *  dots) within a canvas-relative region. Text, body strokes, wires, and the
 *  selection halo do not satisfy the predicate in either theme. */
async function blueStats(
  page: Page,
  png: Buffer,
  region: { x: number; y: number; w: number; h: number },
): Promise<BlueStats> {
  return page.evaluate(
    async ({ b64, region }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      const clampedX = Math.max(0, Math.floor(region.x));
      const clampedY = Math.max(0, Math.floor(region.y));
      const w = Math.min(Math.floor(region.w), bitmap.width - clampedX);
      const h = Math.min(Math.floor(region.h), bitmap.height - clampedY);
      if (w <= 0 || h <= 0) return { count: 0, cx: 0, cy: 0 };
      const data = ctx.getImageData(clampedX, clampedY, w, h).data;
      let count = 0;
      let sx = 0;
      let sy = 0;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          const r = data[i]!;
          const g = data[i + 1]!;
          const b = data[i + 2]!;
          if (b > 140 && r < 110 && b - g > 50) {
            count += 1;
            sx += x;
            sy += y;
          }
        }
      }
      return {
        count,
        cx: clampedX + (count ? sx / count : w / 2),
        cy: clampedY + (count ? sy / count : h / 2),
      };
    },
    { b64: png.toString("base64"), region },
  );
}

test("dragging a part keeps it (and wires) at the drop position with no snap-back flash", async ({
  page,
  request,
}) => {
  // ── Seed: two wired parts via the API. ──
  const componentId = await importDrawnComponent(request);
  const createResponse = await request.post(`${API}/designer/designs`, {
    data: { name: "Drag regression" },
  });
  expect(createResponse.status()).toBe(201);
  const created = (await createResponse.json()) as {
    data?: { design?: { id?: string } };
  };
  const designId = created.data?.design?.id;
  if (!designId) throw new Error("design create failed");

  await dispatch(request, designId, 0, {
    type: "place_part",
    componentId,
    positionNm: { x: 0, y: 0 },
  });
  await dispatch(request, designId, 1, {
    type: "place_part",
    componentId,
    positionNm: { x: 20_000_000, y: 0 },
  });
  const projectionResponse = await request.get(
    `${API}/designer/designs/${designId}/projection/schematic`,
  );
  const projection = (await projectionResponse.json()) as {
    data?: {
      projection?: {
        parts?: Array<{ id: string; pins: Array<{ id: string }> }>;
      };
    };
  };
  const parts = projection.data?.projection?.parts ?? [];
  const pinA = parts[0]?.pins[1]?.id;
  const pinB = parts[1]?.pins[0]?.id;
  if (!pinA || !pinB) throw new Error("expected two placed parts with pins");
  await dispatch(request, designId, 2, {
    type: "create_wire",
    sourcePinId: pinA,
    targetPinId: pinB,
  });

  // ── Open the design in the browser. ──
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Designs" })).toBeVisible();
  await page.getByText("Drag regression").first().click();
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(700); // camera + first projection render

  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no bounding box");

  // Locate part A: its pins are the two leftmost pin-dot clusters; the
  // midpoint between them is the symbol body center — a safe grab point
  // (clicking a pin dot itself would start a wire draw instead of a drag).
  const before = await canvas.screenshot();
  const clusters = await blueClusters(page, before);
  expect(clusters.length).toBeGreaterThanOrEqual(2);
  const [pinDotA1, pinDotA2] = clusters;
  if (!pinDotA1 || !pinDotA2) throw new Error("expected two pin dots");
  const pinSpanPx = pinDotA2.cx - pinDotA1.cx;
  expect(pinSpanPx).toBeGreaterThan(40); // sane zoom: 4 mm pin span on screen
  const grabX = box.x + (pinDotA1.cx + pinDotA2.cx) / 2;
  const grabY = box.y + (pinDotA1.cy + pinDotA2.cy) / 2;
  const originCx = (pinDotA1.cx + pinDotA2.cx) / 2;
  const originCy = (pinDotA1.cy + pinDotA2.cy) / 2;

  // Slow the move commands + projection refetch (as on large designs /
  // slower machines) so any snap-back flash spans several captured frames
  // instead of a single sub-screenshot-latency blink.
  await page.route("**/api/modules/designer/designs/*/commands", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });
  await page.route(
    "**/api/modules/designer/designs/*/projection/schematic",
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.continue();
    },
  );

  // ── Drag part A straight down by 140 px. ──
  const DROP_DY = 140;
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  for (let step = 1; step <= 7; step += 1) {
    await page.mouse.move(grabX, grabY + (DROP_DY / 7) * step);
  }
  await page.mouse.up();

  // ── The part's pin dots must sit at the drop position in EVERY frame after
  //    release — a snap-back flash renders them at the original position
  //    while the async move commands land. ──
  // Regions span both pins of part A (pin span + margin), vertically tight
  // enough (±35 px) that old/new never overlap for a 140 px drop even after
  // grid snapping (≤ half a grid step ≈ 25 px at this zoom).
  const regionW = pinSpanPx + 80;
  const regionH = 70;
  const newRegion = {
    x: originCx - regionW / 2,
    y: originCy + DROP_DY - regionH / 2,
    w: regionW,
    h: regionH,
  };
  const oldRegion = {
    x: originCx - regionW / 2,
    y: originCy - regionH / 2,
    w: regionW,
    h: regionH,
  };
  for (let frame = 0; frame < 8; frame += 1) {
    const shot = await canvas.screenshot();
    const atNew = await blueStats(page, shot, newRegion);
    const atOld = await blueStats(page, shot, oldRegion);
    expect(atNew.count, `frame ${frame}: part missing at drop position`).toBeGreaterThan(5);
    expect(atOld.count, `frame ${frame}: snap-back flash at origin`).toBeLessThan(5);
    await page.waitForTimeout(60);
  }
});
