// `pcb_apply_autolayout_candidate` — the atomicity contract.
//
// The old cloud apply path dispatched one envelope per operation, so a 40-op candidate
// produced 40 revisions, 40 undo entries, and — on a failure at op 30 — a half-laid-out
// board. Every test here exists to pin the replacement: ONE revision, ONE undo entry, and
// on ANY failure, ZERO change to the board.
import { describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";

import type {
  DesignerCommandEnvelope,
  DesignerPcbProjection,
  DesignerSDK,
  PcbPlacedPart,
} from "../../../sdks";
import { MODULE_SDK_TOKENS } from "../../../sdks";
import { resetSharedSqliteForTesting } from "../db/sqlite-client";
import { DiagnosticsStore } from "../diagnostics/diagnostics-store";
import { createHttpServer } from "../http/create-http-server";
import { ModuleRuntime } from "../modules/module-loader";
import { ModuleRouterRegistry } from "../router/module-registry";
import { getKicadFixtureDir } from "./helpers/kicad-fixtures";

const SESSION = "designer-pcb-session";

function isolateTestDb(label: string): void {
  resetSharedSqliteForTesting();
  process.env.OPENPCB_DB_PATH = path.join(
    os.tmpdir(),
    `${label}-${Date.now()}-${crypto.randomUUID()}.sqlite`,
  );
}

async function createRuntime() {
  const repoRoot = path.resolve(import.meta.dir, "../../..");
  const moduleRegistry = new ModuleRouterRegistry();
  const moduleRuntime = new ModuleRuntime({
    moduleRegistry,
    workspaceRoot: repoRoot,
  });
  await moduleRuntime.bootstrap();
  const server = createHttpServer({
    diagnosticsStore: new DiagnosticsStore(),
    moduleRegistry,
    moduleRuntime,
  });
  return { moduleRuntime, server };
}

function envelope(
  designId: string,
  commandId: string,
  baseRevision: number | null,
  command: DesignerCommandEnvelope["command"],
): DesignerCommandEnvelope {
  return {
    commandId,
    sessionId: SESSION,
    aggregateId: designId,
    baseRevision,
    issuedAt: Date.now(),
    command,
  };
}

async function importFixtureComponent(
  server: ReturnType<typeof createHttpServer>,
): Promise<string> {
  const fixtureDir = getKicadFixtureDir();
  const symbolContent = await Bun.file(
    path.resolve(fixtureDir, "simple_capacitor.kicad_sym"),
  ).text();
  const footprintContent = await Bun.file(
    path.resolve(fixtureDir, "C_0603_1608Metric.kicad_mod"),
  ).text();
  const payload = {
    symbolLibrary: { fileName: "C.kicad_sym", content: symbolContent },
    footprints: [
      { fileName: "C_0603_1608Metric.kicad_mod", content: footprintContent },
    ],
  };

  const inspect = await server.fetch(
    new Request("http://localhost/api/modules/library/imports/kicad/inspect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
  const inspectBody = (await inspect.json()) as {
    data?: { symbols?: Array<{ id: string }>; footprints?: Array<{ id: string }> };
  };
  const symbolId = inspectBody.data?.symbols?.[0]?.id;
  const footprintId = inspectBody.data?.footprints?.[0]?.id;
  if (!symbolId || !footprintId) throw new Error("fixture inspect failed");

  const commit = await server.fetch(
    new Request("http://localhost/api/modules/library/imports/kicad", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        selection: { symbolId, footprintId },
        component: {
          name: `AutoLayout Apply Cap ${crypto.randomUUID()}`,
          description: "atomic apply test component",
        },
      }),
    }),
  );
  const commitBody = (await commit.json()) as { data?: { componentId?: string } };
  const componentId = commitBody.data?.componentId;
  if (!componentId) throw new Error("fixture commit failed");
  return componentId;
}

/** Everything the board is, reduced to a comparable value. */
function boardState(projection: DesignerPcbProjection | null) {
  return {
    placements: (projection?.placements ?? [])
      .map((p: PcbPlacedPart) => ({
        id: p.id,
        positionMm: p.positionMm,
        rotationDeg: p.rotationDeg,
        mirrored: p.mirrored,
        layer: p.layer,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    traces: (projection?.traces ?? [])
      .map((t) => ({ layer: t.layer, widthMm: t.widthMm, pointsNm: t.pointsNm }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    vias: (projection?.vias ?? [])
      .map((v) => ({ centerMm: v.centerMm, diameterMm: v.diameterMm }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
}

async function setup(label: string): Promise<{
  sdk: DesignerSDK;
  designId: string;
  projection: DesignerPcbProjection;
  revision: number;
  netClassId: string;
}> {
  isolateTestDb(label);
  const { moduleRuntime, server } = await createRuntime();
  const componentId = await importFixtureComponent(server);
  const sdk = moduleRuntime
    .getSdkRegistry()
    .resolve<DesignerSDK>(MODULE_SDK_TOKENS.DESIGNER);
  const design = await sdk.createDesign({ name: label });
  let revision = 0;

  for (let index = 0; index < 3; index += 1) {
    const result = await sdk.dispatchCommand(
      design.id,
      envelope(design.id, `place-${label}-${index}`, revision, {
        type: "place_part",
        componentId,
        positionNm: { x: index * 6_000_000, y: 0 },
      }),
    );
    if (!result.ok) throw new Error("place_part failed");
    revision = result.revision;
  }

  const projection = await sdk.getPcbProjection(design.id);
  if (!projection || projection.placements.length < 3) {
    throw new Error("expected three placements");
  }
  return {
    sdk,
    designId: design.id,
    projection,
    revision,
    netClassId: projection.board.netClasses[0]!.id,
  };
}

function trace(netClassId: string, offsetNm: number) {
  return {
    type: "pcb_add_trace" as const,
    layer: "F.Cu" as const,
    pointsNm: [
      { x: offsetNm, y: 0 },
      { x: offsetNm + 2_000_000, y: 0 },
    ],
    widthMm: 0.25,
    netId: null,
    netClassId,
    segmentMode: "manhattan-45" as const,
  };
}

function via(netClassId: string, xMm: number) {
  return {
    type: "pcb_add_via" as const,
    centerMm: { x: xMm, y: 5 },
    netId: null,
    netClassId,
  };
}

describe("pcb_apply_autolayout_candidate — success", () => {
  test("one revision, one undo entry, redo reproduces the candidate", async () => {
    const { sdk, designId, projection, revision, netClassId } = await setup(
      "autolayout-apply-ok",
    );
    const before = boardState(projection);
    const [a, b, c] = projection.placements;

    const result = await sdk.dispatchCommand(
      designId,
      envelope(designId, "apply-ok", revision, {
        type: "pcb_apply_autolayout_candidate",
        jobId: "job_test",
        candidateId: "cand_1",
        snapshotDigest: "digest",
        placementOperations: [
          { type: "pcb_move_placement", placementId: a!.id, positionMm: { x: 12, y: 8 } },
          { type: "pcb_rotate_placement", placementId: b!.id, rotationDeg: 90 },
          { type: "pcb_flip_placement", placementId: c!.id },
        ],
        routeOperations: [
          trace(netClassId, 0),
          trace(netClassId, 5_000_000),
          via(netClassId, 20),
        ],
        provenance: { objectiveVersion: "layout-1" },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 6 operations, ONE revision — not N+6.
    expect(result.revision).toBe(revision + 1);

    const applied = await sdk.getPcbProjection(designId);
    expect(applied!.placements.find((p) => p.id === a!.id)!.positionMm).toEqual({
      x: 12,
      y: 8,
    });
    expect(applied!.placements.find((p) => p.id === b!.id)!.rotationDeg).toBe(90);
    expect(applied!.placements.find((p) => p.id === c!.id)!.layer).toBe("B.Cu");
    expect(applied!.placements.find((p) => p.id === c!.id)!.mirrored).toBe(true);
    expect(applied!.traces).toHaveLength(2);
    expect(applied!.vias).toHaveLength(1);
    const after = boardState(applied);

    // ONE undo entry restores the whole candidate — placements AND copper.
    const undo = await sdk.undo(designId, SESSION);
    expect(undo.ok).toBe(true);
    expect(boardState(await sdk.getPcbProjection(designId))).toEqual(before);

    // ...and redo reproduces it exactly.
    const redo = await sdk.redo(designId, SESSION);
    expect(redo.ok).toBe(true);
    expect(boardState(await sdk.getPcbProjection(designId))).toEqual(after);
  });

  test("move + rotate + flip on ONE component compose in operation order", async () => {
    const { sdk, designId, projection, revision } = await setup(
      "autolayout-apply-compose",
    );
    const target = projection.placements[0]!;

    const result = await sdk.dispatchCommand(
      designId,
      envelope(designId, "apply-compose", revision, {
        type: "pcb_apply_autolayout_candidate",
        jobId: "job_test",
        candidateId: "cand_1",
        snapshotDigest: "digest",
        placementOperations: [
          { type: "pcb_move_placement", placementId: target.id, positionMm: { x: 5, y: 5 } },
          { type: "pcb_rotate_placement", placementId: target.id, rotationDeg: 180 },
          { type: "pcb_flip_placement", placementId: target.id },
          // a second move AFTER the flip must win over the first
          { type: "pcb_move_placement", placementId: target.id, positionMm: { x: 9, y: 1 } },
        ],
        routeOperations: [],
        provenance: {},
      }),
    );
    expect(result.ok).toBe(true);

    const applied = await sdk.getPcbProjection(designId);
    const final = applied!.placements.find((p) => p.id === target.id)!;
    expect(final.positionMm).toEqual({ x: 9, y: 1 });
    expect(final.rotationDeg).toBe(180);
    expect(final.layer).toBe("B.Cu");
    expect(final.mirrored).toBe(true);
  });
});

describe("pcb_apply_autolayout_candidate — failure leaves ZERO change", () => {
  // Each case injects a failure at a different position. The assertion is always the
  // same: board identical, revision identical, nothing to undo.
  const cases: Array<{
    name: string;
    build: (ctx: {
      placements: PcbPlacedPart[];
      netClassId: string;
    }) => Record<string, unknown>;
  }> = [
    {
      name: "first placement op references an unknown placement",
      build: ({ placements, netClassId }) => ({
        placementOperations: [
          { type: "pcb_move_placement", placementId: "ghost", positionMm: { x: 1, y: 1 } },
          {
            type: "pcb_rotate_placement",
            placementId: placements[0]!.id,
            rotationDeg: 90,
          },
        ],
        routeOperations: [trace(netClassId, 0)],
      }),
    },
    {
      name: "middle placement op references an unknown placement",
      build: ({ placements, netClassId }) => ({
        placementOperations: [
          {
            type: "pcb_move_placement",
            placementId: placements[0]!.id,
            positionMm: { x: 3, y: 3 },
          },
          { type: "pcb_flip_placement", placementId: "ghost" },
          {
            type: "pcb_rotate_placement",
            placementId: placements[1]!.id,
            rotationDeg: 270,
          },
        ],
        routeOperations: [trace(netClassId, 0)],
      }),
    },
    {
      name: "last placement op references an unknown placement",
      build: ({ placements, netClassId }) => ({
        placementOperations: [
          {
            type: "pcb_move_placement",
            placementId: placements[0]!.id,
            positionMm: { x: 3, y: 3 },
          },
          { type: "pcb_move_placement", placementId: "ghost", positionMm: { x: 4, y: 4 } },
        ],
        routeOperations: [trace(netClassId, 0), via(netClassId, 15)],
      }),
    },
    {
      name: "first route op has an unknown net class",
      build: ({ placements, netClassId }) => ({
        placementOperations: [
          {
            type: "pcb_move_placement",
            placementId: placements[0]!.id,
            positionMm: { x: 7, y: 7 },
          },
        ],
        routeOperations: [
          { ...trace(netClassId, 0), netClassId: "no-such-class" },
          trace(netClassId, 5_000_000),
        ],
      }),
    },
    {
      name: "middle route op has an unknown net class",
      build: ({ placements, netClassId }) => ({
        placementOperations: [
          {
            type: "pcb_move_placement",
            placementId: placements[0]!.id,
            positionMm: { x: 7, y: 7 },
          },
        ],
        routeOperations: [
          trace(netClassId, 0),
          { ...trace(netClassId, 3_000_000), netClassId: "no-such-class" },
          trace(netClassId, 6_000_000),
        ],
      }),
    },
    {
      name: "LAST route op is invalid — the classic partial-apply trap",
      build: ({ placements, netClassId }) => ({
        placementOperations: [
          {
            type: "pcb_move_placement",
            placementId: placements[0]!.id,
            positionMm: { x: 7, y: 7 },
          },
          {
            type: "pcb_flip_placement",
            placementId: placements[1]!.id,
          },
        ],
        routeOperations: [
          trace(netClassId, 0),
          trace(netClassId, 3_000_000),
          { ...via(netClassId, 20), netClassId: "no-such-class" },
        ],
      }),
    },
    {
      name: "via drill exceeds its diameter",
      build: ({ placements, netClassId }) => ({
        placementOperations: [
          {
            type: "pcb_move_placement",
            placementId: placements[0]!.id,
            positionMm: { x: 7, y: 7 },
          },
        ],
        routeOperations: [
          trace(netClassId, 0),
          {
            ...via(netClassId, 20),
            diameterMmOverride: 0.4,
            drillMmOverride: 0.9,
          },
        ],
      }),
    },
  ];

  for (const [index, testCase] of cases.entries()) {
    test(testCase.name, async () => {
      const { sdk, designId, projection, revision, netClassId } = await setup(
        `autolayout-apply-fail-${index}`,
      );
      const before = boardState(projection);
      const historyBefore = await sdk.getHistory(designId, SESSION);

      const result = await sdk.dispatchCommand(
        designId,
        envelope(designId, `apply-fail-${index}`, revision, {
          type: "pcb_apply_autolayout_candidate",
          jobId: "job_test",
          candidateId: "cand_1",
          snapshotDigest: "digest",
          provenance: {},
          ...testCase.build({ placements: projection.placements, netClassId }),
        } as never),
      );
      expect(result.ok).toBe(false);

      const after = await sdk.getPcbProjection(designId);
      expect(boardState(after)).toEqual(before);
      expect(after!.revision).toBe(revision);

      // The failed apply must not sit on the user's undo stack — undo depth is unchanged,
      // so the next undo still targets whatever the user did before Auto Layout.
      const historyAfter = await sdk.getHistory(designId, SESSION);
      expect(historyAfter.undoDepth).toBe(historyBefore.undoDepth);
    });
  }

  test("revision conflict changes nothing", async () => {
    const { sdk, designId, projection, revision, netClassId } = await setup(
      "autolayout-apply-conflict",
    );
    const before = boardState(projection);

    const result = await sdk.dispatchCommand(
      designId,
      envelope(designId, "apply-conflict", revision - 1, {
        type: "pcb_apply_autolayout_candidate",
        jobId: "job_test",
        candidateId: "cand_1",
        snapshotDigest: "digest",
        placementOperations: [
          {
            type: "pcb_move_placement",
            placementId: projection.placements[0]!.id,
            positionMm: { x: 1, y: 1 },
          },
        ],
        routeOperations: [trace(netClassId, 0)],
        provenance: {},
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("REVISION_CONFLICT");

    const after = await sdk.getPcbProjection(designId);
    expect(boardState(after)).toEqual(before);
    expect(after!.revision).toBe(revision);
  });

  test("an empty candidate is rejected rather than burning a revision", async () => {
    const { sdk, designId, revision } = await setup("autolayout-apply-empty");
    const result = await sdk.dispatchCommand(
      designId,
      envelope(designId, "apply-empty", revision, {
        type: "pcb_apply_autolayout_candidate",
        jobId: "job_test",
        candidateId: "cand_1",
        snapshotDigest: "digest",
        placementOperations: [],
        routeOperations: [],
        provenance: {},
      }),
    );
    expect(result.ok).toBe(false);
    expect((await sdk.getPcbProjection(designId))!.revision).toBe(revision);
  });
});
