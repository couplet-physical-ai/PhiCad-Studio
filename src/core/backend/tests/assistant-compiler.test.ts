import { describe, expect, test } from "bun:test";
import { expandCircuit } from "../../../modules/assistant/backend/compiler/expander";
import { lowerNetlist } from "../../../modules/assistant/backend/compiler/lowering";
import {
  applyCompiledPlan,
  type DesignerApplyPort,
} from "../../../modules/assistant/backend/compiler/apply";
import { ceilE12, formatOhms } from "../../../modules/assistant/backend/compiler/units";
import type { CircuitIr } from "../../../modules/assistant/backend/compiler/ir";
import type {
  DesignerDesignRecord,
  DesignerDispatchResult,
  DesignerPin,
  DesignerPlacedPart,
  DesignerSchematicProjection,
} from "../../../sdks";

const RESOLVE = {
  resolveRole: (role: string) =>
    role === "resistor"
      ? "openpcb.core.passive.resistor"
      : role === "led"
        ? "openpcb.core.opto.led"
        : undefined,
};

function twoLedCircuit(): CircuitIr {
  return {
    version: 1,
    blocks: [
      { id: "led0", recipe: "led_indicator", params: { supplyV: 5, vf: 2.0, currentA: 0.01 } },
      { id: "led1", recipe: "led_indicator", params: { supplyV: 5, vf: 2.0, currentA: 0.01 } },
    ],
    nets: [
      { name: "DRV", ports: ["led0.IN", "led1.IN"] },
      { name: "GND", ports: ["led0.GND", "led1.GND"] },
    ],
    power: { vcc: "VCC", gnd: "GND" },
  };
}

describe("circuit compiler expander", () => {
  test("expands blocks to a resolved netlist with param-calc'd values", () => {
    const netlist = expandCircuit(twoLedCircuit());

    // Four parts, handles namespaced by block id, in block+part order.
    expect(netlist.parts.map((p) => p.handle)).toEqual([
      "led0.R",
      "led0.D",
      "led1.R",
      "led1.D",
    ]);
    // R sized by Ohm's law: (5 − 2) / 0.01 = 300Ω → 330Ω (ceil to E12).
    expect(netlist.parts.find((p) => p.handle === "led0.R")?.value).toBe("330Ω");
    expect(netlist.parts.find((p) => p.handle === "led0.D")?.value).toBeNull();
    expect(netlist.assumptions.some((a) => a.includes("330Ω"))).toBe(true);
  });

  test("stitches internal + port-level nets to concrete pins", () => {
    const netlist = expandCircuit(twoLedCircuit());
    const byName = new Map(netlist.nets.map((n) => [n.name, n]));

    // Internal block wiring: R.2 → LED anode (pin 2).
    expect(byName.get("led0.n0")?.pins).toEqual([
      { handle: "led0.R", pin: "2" },
      { handle: "led0.D", pin: "2" },
    ]);
    // Port-level net DRV joins both resistor high sides (pin 1).
    expect(byName.get("DRV")?.pins).toEqual([
      { handle: "led0.R", pin: "1" },
      { handle: "led1.R", pin: "1" },
    ]);
    // GND is a declared power rail → flagged for gnd-port lowering.
    expect(byName.get("GND")?.isPower).toBe(true);
    expect(byName.get("GND")?.pins).toEqual([
      { handle: "led0.D", pin: "1" },
      { handle: "led1.D", pin: "1" },
    ]);
  });

  test("expansion is deterministic (byte-stable) — the golden-IR property", () => {
    const a = expandCircuit(twoLedCircuit());
    const b = expandCircuit(twoLedCircuit());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("resolves part roles to component ids when a resolver is supplied", () => {
    const netlist = expandCircuit(twoLedCircuit(), {
      resolveRole: (role) =>
        role === "resistor" ? "openpcb.core.passive.resistor" : role === "led" ? "openpcb.core.opto.led" : undefined,
    });
    expect(netlist.parts.find((p) => p.handle === "led0.R")?.componentId).toBe(
      "openpcb.core.passive.resistor",
    );
    expect(netlist.parts.find((p) => p.handle === "led0.D")?.componentId).toBe(
      "openpcb.core.opto.led",
    );
  });

  test("rejects an unknown block recipe", () => {
    const ir: CircuitIr = {
      version: 1,
      blocks: [{ id: "x", recipe: "does_not_exist" }],
      nets: [],
      power: { vcc: "VCC", gnd: "GND" },
    };
    expect(() => expandCircuit(ir)).toThrow(/Unknown block recipe/);
  });

  test("E12 rounding ceils to the safe current-limit value", () => {
    expect(ceilE12(300)).toBe(330);
    expect(ceilE12(1000)).toBe(1000);
    expect(formatOhms(4700)).toBe("4.7kΩ");
  });
});

describe("circuit compiler lowering", () => {
  test("lowers a resolved netlist to placements, wires, and power ports", () => {
    const plan = lowerNetlist(expandCircuit(twoLedCircuit(), RESOLVE));

    // Four placed parts, one column per block (20 mm pitch, from origin):
    // parts stack vertically inside their block so intra-block auto-routes
    // never run straight through a sibling pin (pin-on-wire = junction).
    expect(plan.placements.map((p) => p.handle)).toEqual([
      "led0.R",
      "led0.D",
      "led1.R",
      "led1.D",
    ]);
    expect(plan.placements[0]?.positionNm).toEqual({ x: 0, y: 0 });
    expect(plan.placements[1]?.positionNm).toEqual({ x: 0, y: 20_000_000 });
    expect(plan.placements[2]?.positionNm).toEqual({ x: 20_000_000, y: 0 });
    expect(plan.placements[3]?.positionNm).toEqual({ x: 20_000_000, y: 20_000_000 });
    expect(plan.placements[0]?.componentId).toBe("openpcb.core.passive.resistor");
    expect(plan.unresolvedRoles).toEqual([]);

    // Non-power nets → wires (2 internal + DRV); GND → a ground port.
    expect(plan.wires.map((w) => w.net)).toEqual(["led0.n0", "led1.n0", "DRV"]);
    expect(plan.powerPorts).toHaveLength(1);
    expect(plan.powerPorts[0]).toMatchObject({ net: "GND", kind: "gnd" });
    expect(plan.powerPorts[0]?.pins).toEqual([
      { handle: "led0.D", pin: "1" },
      { handle: "led1.D", pin: "1" },
    ]);
  });

  test("reports unresolved roles instead of placing wrong parts", () => {
    const plan = lowerNetlist(expandCircuit(twoLedCircuit())); // no resolver
    expect(plan.placements).toEqual([]);
    expect(plan.unresolvedRoles).toEqual(["resistor", "led", "resistor", "led"]);
  });
});

// Minimal stateful DesignerSDK fake: models place_part (assigns id + pins from a
// per-component pin table), create_wire, and gnd/pwr ports, with revision guard.
const PIN_TABLE: Record<string, Array<{ number: string; name: string }>> = {
  "openpcb.core.passive.resistor": [
    { number: "1", name: "" },
    { number: "2", name: "" },
  ],
  "openpcb.core.opto.led": [
    { number: "1", name: "K" },
    { number: "2", name: "A" },
  ],
};

interface FakeState {
  revision: number;
  parts: DesignerPlacedPart[];
  primitives: string[];
  wires: Array<{ source: string; target: string }>;
}

function makeFakeDesigner(): { sdk: DesignerApplyPort; state: FakeState } {
  const state: FakeState = { revision: 0, parts: [], primitives: [], wires: [] };
  let seq = 0;
  const sdk: DesignerApplyPort = {
    async getDesign() {
      return {
        head: { revision: state.revision } as unknown as DesignerDesignRecord["head"],
        entities: [],
      };
    },
    async getSchematicProjection() {
      return {
        designId: "d1",
        revision: state.revision,
        parts: state.parts,
        wires: [],
        labels: [],
        primitives: [],
        junctions: [],
        nets: [],
      } satisfies DesignerSchematicProjection;
    },
    async dispatchCommand(_designId, envelope): Promise<DesignerDispatchResult> {
      if (envelope.baseRevision !== state.revision) {
        return {
          ok: false,
          code: "REVISION_CONFLICT",
          conflict: { expected: envelope.baseRevision, actual: state.revision },
        };
      }
      const cmd = envelope.command;
      state.revision++;
      if (cmd.type === "place_part") {
        const partId = `part${seq++}`;
        const pins: DesignerPin[] = (PIN_TABLE[cmd.componentId] ?? []).map((d, i) => ({
          id: `${partId}:p${d.number}`,
          originPinKey: d.number,
          number: d.number,
          name: d.name,
          electricalType: "passive",
          unit: 1,
          localPositionNm: { x: 0, y: i * 1_000_000 },
          worldPositionNm: { x: cmd.positionNm.x, y: cmd.positionNm.y + i * 1_000_000 },
        }));
        state.parts.push({
          id: partId,
          componentId: cmd.componentId,
          reference: `P${seq}`,
          value: "",
          rotationDeg: 0,
          mirrored: false,
          positionNm: cmd.positionNm,
          pins,
        } as unknown as DesignerPlacedPart);
        return { ok: true, revision: state.revision, createdEntityId: partId };
      }
      if (cmd.type === "create_wire") {
        state.wires.push({ source: cmd.sourcePinId, target: cmd.targetPinId });
        return { ok: true, revision: state.revision, createdEntityId: `wire${seq++}` };
      }
      if (cmd.type === "place_gnd_port" || cmd.type === "place_pwr_port" || cmd.type === "place_net_portal") {
        const primId = `prim${seq++}`;
        state.primitives.push(primId);
        return { ok: true, revision: state.revision, createdEntityId: primId };
      }
      return { ok: true, revision: state.revision, createdEntityId: null };
    },
  };
  return { sdk, state };
}

describe("circuit compiler apply", () => {
  test("places, wires, and rails a compiled circuit against a live designer", async () => {
    const { sdk, state } = makeFakeDesigner();
    const plan = lowerNetlist(expandCircuit(twoLedCircuit(), RESOLVE));
    const result = await applyCompiledPlan({ designer: sdk, designId: "d1", baseRevision: 0, plan });

    expect(result.status).toBe("applied");
    expect(result.errors).toEqual([]);
    expect(result.placedCount).toBe(4);
    expect(result.wiredCount).toBe(3); // led0.n0, led1.n0, DRV
    expect(result.portCount).toBe(2); // GND rail — one gnd port per pin
    expect(state.parts).toHaveLength(4);
    expect(state.primitives).toHaveLength(2);
    expect(state.wires).toHaveLength(5); // 3 net wires + 2 rail wires
    expect(result.handleToPartId["led0.R"]).toBeDefined();
    expect(result.revision).toBe(state.revision);
  });

  test("aborts without placing when a role is unresolved", async () => {
    const { sdk, state } = makeFakeDesigner();
    const plan = lowerNetlist(expandCircuit(twoLedCircuit())); // no resolver
    const result = await applyCompiledPlan({ designer: sdk, designId: "d1", baseRevision: 0, plan });
    expect(result.status).toBe("failed");
    expect(state.parts).toHaveLength(0);
    expect(result.errors[0]).toMatch(/Unresolved part role/);
  });

  test("rejects a stale base revision", async () => {
    const { sdk } = makeFakeDesigner();
    const plan = lowerNetlist(expandCircuit(twoLedCircuit(), RESOLVE));
    await expect(
      applyCompiledPlan({ designer: sdk, designId: "d1", baseRevision: 5, plan }),
    ).rejects.toThrow(/Recompile/);
  });
});
