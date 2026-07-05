// S8: designer_pcb_place_batch / designer_pcb_route_batch proposal apply — the
// mirrored cloud auto-layout batches dispatch their DesignerCommand payloads
// through the same command path as manual autoroute/autoplace apply, then re-run
// DRC (desktop stays DRC authority).

import { describe, expect, test } from "bun:test";
import type { DesignerSDK } from "../../../sdks";
import type { AssistantWriteProposalDto } from "../../../sdks/assistant";
import { applyAssistantWriteProposal } from "../../../modules/assistant/backend/proposals/proposal-apply-service";

function routeEnvelope(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "env_1",
    kind: "designer_pcb_route_batch",
    toolName: "copilot_run_routing",
    title: "Autoroute",
    summary: "2 nets routed",
    riskLevel: "high",
    designId: "design-1",
    baseRevision: 7,
    operations: [
      {
        id: "op_1",
        kind: "pcb_add_trace",
        title: "Route net_a",
        summary: "",
        riskLevel: "high",
        payload: {
          type: "pcb_add_trace",
          layer: "F.Cu",
          pointsNm: [{ x: 0, y: 0 }, { x: 1000, y: 0 }],
          widthMm: 0.25,
          netId: "net_a",
          netClassId: "default",
          segmentMode: "manhattan-45",
        },
        sources: [],
        warnings: [],
      },
      {
        id: "op_2",
        kind: "pcb_add_via",
        title: "Via net_a",
        summary: "",
        riskLevel: "high",
        payload: {
          type: "pcb_add_via",
          centerMm: { x: 1, y: 0 },
          netId: "net_a",
          netClassId: "default",
        },
        sources: [],
        warnings: [],
      },
    ],
    payload: { completion: 1 },
    sources: [],
    warnings: [],
    ...overrides,
  };
}

function record(
  envelope: Record<string, unknown>,
  overrides: Partial<AssistantWriteProposalDto> = {},
): AssistantWriteProposalDto {
  return {
    id: "wp_1",
    chatId: "chat_1",
    kind: String(envelope.kind),
    status: "pending",
    designId: "design-1",
    baseRevision: 7,
    proposal: {},
    envelope,
    toolName: "cloud_copilot",
    title: "Autoroute",
    summary: null,
    riskLevel: "high",
    operations: envelope.operations,
    origin: "cloud",
    cloudRunId: "crun_1",
    cloudProposalId: "cp_1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as never;
}

function mockDesigner(opts: { failOn?: string } = {}) {
  const dispatched: Array<{ type: string; baseRevision: number | null }> = [];
  const drcRuns: string[] = [];
  let revision = 7;
  const designer = {
    async getDesign() {
      return { head: { revision } } as never;
    },
    async dispatchCommand(_designId: string, envelope: { command: { type: string }; baseRevision: number | null }) {
      dispatched.push({ type: envelope.command.type, baseRevision: envelope.baseRevision });
      if (opts.failOn === envelope.command.type) {
        return { ok: false as const, code: "FAB_VALIDATION", revision };
      }
      revision += 1;
      return { ok: true as const, revision };
    },
    async runDrc(designId: string) {
      drcRuns.push(designId);
      return { violations: [] } as never;
    },
  };
  return { designer: designer as unknown as DesignerSDK, dispatched, drcRuns };
}

describe("assistant pcb batch proposal apply (S8)", () => {
  test("route batch dispatches every op through the command path and re-runs DRC", async () => {
    const { designer, dispatched, drcRuns } = mockDesigner();
    const result = await applyAssistantWriteProposal({
      designer,
      record: record(routeEnvelope()),
      allowPartial: false,
    });
    expect((result as { status: string }).status).toBe("applied");
    expect(dispatched.map((d) => d.type)).toEqual(["pcb_add_trace", "pcb_add_via"]);
    expect(dispatched[1]!.baseRevision).toBe(8); // revision chained between ops
    expect(drcRuns).toEqual(["design-1"]); // desktop DRC authority refreshed
  });

  test("envelope warnings (skipped nets) apply as partial without explicit confirm", async () => {
    // high-risk (non-destructive) auto-allows partial — copilot route envelopes
    // routinely carry "N nets skipped" warnings
    const { designer, drcRuns } = mockDesigner();
    const result = await applyAssistantWriteProposal({
      designer,
      record: record(routeEnvelope({ warnings: ["1 net skipped"] })),
      allowPartial: false,
    });
    expect((result as { status: string }).status).toBe("partial");
    expect(drcRuns).toEqual(["design-1"]);
  });

  test("a failing op skips-and-continues (high risk, not destructive); DRC still runs", async () => {
    const { designer, dispatched, drcRuns } = mockDesigner({ failOn: "pcb_add_trace" });
    const result = await applyAssistantWriteProposal({
      designer,
      record: record(routeEnvelope()),
      allowPartial: false,
    });
    const r = result as { status: string; operations: Array<{ status: string }> };
    expect(r.status).toBe("partial");
    expect(r.operations.map((o) => o.status)).toEqual(["failed", "applied"]);
    expect(dispatched).toHaveLength(2);
    expect(drcRuns).toEqual(["design-1"]);
  });

  test("place batch kind routes through the same path", async () => {
    const { designer, dispatched, drcRuns } = mockDesigner();
    const envelope = routeEnvelope({
      kind: "designer_pcb_place_batch",
      toolName: "copilot_run_placement",
      operations: [
        {
          id: "op_m",
          kind: "pcb_move_placement",
          title: "Move U1",
          summary: "",
          riskLevel: "high",
          payload: { type: "pcb_move_placement", placementId: "pl_1",
                     positionMm: { x: 3, y: 4 } },
          sources: [],
          warnings: [],
        },
      ],
      warnings: [],
    });
    const result = await applyAssistantWriteProposal({
      designer,
      record: record(envelope),
      allowPartial: false,
    });
    expect((result as { status: string }).status).toBe("applied");
    expect(dispatched.map((d) => d.type)).toEqual(["pcb_move_placement"]);
    expect(drcRuns).toEqual(["design-1"]);
  });

  test("stale baseRevision still rejects (regenerate the proposal)", async () => {
    const { designer } = mockDesigner();
    await expect(
      applyAssistantWriteProposal({
        designer,
        record: record(routeEnvelope(), { baseRevision: 3 } as never),
        allowPartial: false,
      }),
    ).rejects.toThrow(/Design changed since proposal was created/);
  });
});
