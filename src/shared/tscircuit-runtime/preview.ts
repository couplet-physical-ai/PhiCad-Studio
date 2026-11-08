import type { AnyCircuitElement } from "circuit-json";
import { z } from "zod";
import {
  TSCIRCUIT_LIMITS,
  TscircuitRuntimeError,
  type CircuitJsonPreviewReport,
  type GeometryCategory,
  type UnsupportedGeometryIssue,
} from "./protocol";

const elementSchema = z
  .object({ type: z.string().trim().min(1).max(160) })
  .passthrough();
const circuitJsonSchema = z.array(elementSchema);

const MILLIMETRES_TO_NANOMETRES = 1_000_000;
const MAX_REPORTED_ERRORS = 50;
const YIELD_EVERY_ELEMENTS = 256;

const MM_KEYS = new Set([
  "x",
  "y",
  "width",
  "height",
  "radius",
  "diameter",
  "outer_diameter",
  "inner_diameter",
  "hole_diameter",
  "pad_diameter",
  "trace_width",
  "thickness",
  "stroke_width",
]);

const KNOWN_PREVIEW_TYPES = new Set([
  "source_component",
  "source_group",
  "source_board",
  "source_project_metadata",
  "schematic_component",
  "schematic_text",
  "schematic_net_label",
  "pcb_component",
  "pcb_smtpad",
  "pcb_fabrication_note_text",
  "pcb_silkscreen_text",
  "pcb_silkscreen_path",
  "pcb_silkscreen_rect",
  "pcb_silkscreen_circle",
  "cad_component",
]);

export interface PreviewValidationControl {
  isCancelled?: () => boolean;
  now?: () => number;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function mmToNmChecked(valueMm: number): number {
  if (!Number.isFinite(valueMm)) {
    throw new TscircuitRuntimeError(
      "invalid-request",
      "Circuit JSON contains a non-finite millimetre value.",
    );
  }
  if (Math.abs(valueMm) > TSCIRCUIT_LIMITS.maxCoordinateAbsMm) {
    throw new TscircuitRuntimeError(
      "limit-exceeded",
      `Millimetre value ${valueMm} exceeds the ±${TSCIRCUIT_LIMITS.maxCoordinateAbsMm} mm preview limit.`,
    );
  }
  const scaled = valueMm * MILLIMETRES_TO_NANOMETRES;
  if (!Number.isSafeInteger(Math.round(scaled))) {
    throw new TscircuitRuntimeError(
      "limit-exceeded",
      `Millimetre value ${valueMm} cannot be represented safely as integer nanometres.`,
    );
  }
  return Math.round(scaled);
}

function geometryCategory(type: string): GeometryCategory | null {
  const lower = type.toLowerCase();
  if (lower.includes("copper_pour") || lower.includes("ground_plane")) {
    return "copper-pour";
  }
  if (lower.includes("keepout")) return "keepout";
  if (lower.includes("slot")) return "slot";
  if (lower.includes("cutout") || lower.includes("board_outline")) {
    return "cutout";
  }
  if (lower.includes("courtyard")) return "courtyard";
  if (lower === "pcb_board" || lower.includes("layer_stack")) {
    return "layer-stack";
  }
  if (
    lower === "source_trace" ||
    lower === "source_port" ||
    lower === "source_net" ||
    lower === "pcb_port"
  ) {
    return "connectivity";
  }
  if (
    lower === "pcb_trace" ||
    lower === "pcb_via" ||
    lower.includes("plated_hole") ||
    lower.includes("copper")
  ) {
    return "copper";
  }
  if (
    !KNOWN_PREVIEW_TYPES.has(lower) &&
    !lower.endsWith("_error") &&
    !lower.endsWith("_warning")
  ) {
    return "unknown-element";
  }
  return null;
}

function issueMessage(category: GeometryCategory): string {
  switch (category) {
    case "copper":
      return "Copper traces, vias, and plated geometry are reported but are not converted to native entities in V1.";
    case "copper-pour":
      return "Copper pours and ground planes require polygon and net validation that V1 does not materialize.";
    case "keepout":
      return "Keepouts are not materialized because silently dropping them could make an unsafe board.";
    case "slot":
      return "Slots are not materialized or approximated as round drills.";
    case "cutout":
      return "Board cutouts and outline geometry are not materialized or simplified.";
    case "courtyard":
      return "Courtyard geometry is not materialized or discarded.";
    case "layer-stack":
      return "Layer-stack semantics are not mapped to the native OpenPCB board model in V1.";
    case "connectivity":
      return "Circuit JSON connectivity is validated for structure only and is not applied to native net identity.";
    case "unknown-element":
      return "This Circuit JSON element type is not recognized by the V1 preview allowlist.";
  }
}

function throwIfCancelled(control: PreviewValidationControl): void {
  if (control.isCancelled?.()) {
    throw new TscircuitRuntimeError("cancelled", "Preview request cancelled.");
  }
}

async function yieldToWorker(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function scanMillimetreValues(
  value: unknown,
  report: {
    visitedNodes: number;
    converted: number;
    quantized: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    hasBounds: boolean;
  },
  depth = 0,
): void {
  if (depth > TSCIRCUIT_LIMITS.maxDepth) {
    throw new TscircuitRuntimeError(
      "limit-exceeded",
      `Circuit JSON nesting exceeds ${TSCIRCUIT_LIMITS.maxDepth} levels.`,
    );
  }
  report.visitedNodes += 1;
  if (report.visitedNodes > TSCIRCUIT_LIMITS.maxVisitedNodes) {
    throw new TscircuitRuntimeError(
      "limit-exceeded",
      `Circuit JSON exceeds ${TSCIRCUIT_LIMITS.maxVisitedNodes} visited values.`,
    );
  }
  if (Array.isArray(value)) {
    for (const item of value) scanMillimetreValues(item, report, depth + 1);
    return;
  }
  if (value === null || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  const x = typeof record.x === "number" ? mmToNmChecked(record.x) : null;
  const y = typeof record.y === "number" ? mmToNmChecked(record.y) : null;
  if (x !== null && y !== null) {
    report.hasBounds = true;
    report.minX = Math.min(report.minX, x);
    report.minY = Math.min(report.minY, y);
    report.maxX = Math.max(report.maxX, x);
    report.maxY = Math.max(report.maxY, y);
  }

  for (const [key, item] of Object.entries(record)) {
    if (MM_KEYS.has(key) && typeof item === "number") {
      const converted = mmToNmChecked(item);
      report.converted += 1;
      if (Math.abs(converted / MILLIMETRES_TO_NANOMETRES - item) > 1e-12) {
        report.quantized += 1;
      }
    }
    scanMillimetreValues(item, report, depth + 1);
  }
}

export async function validateCircuitJsonPreview(
  circuitJsonText: string,
  control: PreviewValidationControl = {},
): Promise<CircuitJsonPreviewReport> {
  throwIfCancelled(control);
  const payloadBytes = utf8ByteLength(circuitJsonText);
  if (payloadBytes > TSCIRCUIT_LIMITS.maxPayloadBytes) {
    throw new TscircuitRuntimeError(
      "limit-exceeded",
      `Circuit JSON is ${payloadBytes} bytes; the preview limit is ${TSCIRCUIT_LIMITS.maxPayloadBytes} bytes.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(circuitJsonText) as unknown;
  } catch (error) {
    return {
      valid: false,
      source: "circuit-json",
      authorityMode: "native",
      elementCount: 0,
      elementTypes: {},
      convertedMmValueCount: 0,
      boundsNm: null,
      unsupportedGeometry: [],
      errors: [
        `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ],
      warnings: [],
      nativeMaterialization: {
        canApply: false,
        reason:
          "V1 validates and previews Circuit JSON only; native OpenPCB ECS/history remains authoritative.",
      },
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      valid: false,
      source: "circuit-json",
      authorityMode: "native",
      elementCount: 0,
      elementTypes: {},
      convertedMmValueCount: 0,
      boundsNm: null,
      unsupportedGeometry: [],
      errors: ["Circuit JSON must be a top-level array of element objects."],
      warnings: [],
      nativeMaterialization: {
        canApply: false,
        reason:
          "V1 validates and previews Circuit JSON only; native OpenPCB ECS/history remains authoritative.",
      },
    };
  }
  if (parsed.length > TSCIRCUIT_LIMITS.maxElements) {
    throw new TscircuitRuntimeError(
      "limit-exceeded",
      `Circuit JSON has ${parsed.length} elements; the preview limit is ${TSCIRCUIT_LIMITS.maxElements}.`,
    );
  }

  const checked = circuitJsonSchema.safeParse(parsed);
  if (!checked.success) {
    return {
      valid: false,
      source: "circuit-json",
      authorityMode: "native",
      elementCount: parsed.length,
      elementTypes: {},
      convertedMmValueCount: 0,
      boundsNm: null,
      unsupportedGeometry: [],
      errors: checked.error.issues
        .slice(0, MAX_REPORTED_ERRORS)
        .map((issue) => {
          const path = issue.path.length > 0 ? issue.path.join(".") : "root";
          return `${path}: ${issue.message}`;
        }),
      warnings:
        checked.error.issues.length > MAX_REPORTED_ERRORS
          ? [
              `Only the first ${MAX_REPORTED_ERRORS} validation errors are shown.`,
            ]
          : [],
      nativeMaterialization: {
        canApply: false,
        reason:
          "V1 validates and previews Circuit JSON only; native OpenPCB ECS/history remains authoritative.",
      },
    };
  }

  // The schema is the runtime boundary. The circuit-json type makes review of
  // element fields type-aware without asking root application code to resolve
  // the workspace's Zod 3 dependency.
  const elements = checked.data as unknown as AnyCircuitElement[];
  const elementTypes: Record<string, number> = {};
  const issueCounts = new Map<
    string,
    { category: GeometryCategory; count: number }
  >();
  const scan = {
    visitedNodes: 0,
    converted: 0,
    quantized: 0,
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    hasBounds: false,
  };

  for (let index = 0; index < elements.length; index += 1) {
    if (index % YIELD_EVERY_ELEMENTS === 0) {
      throwIfCancelled(control);
      await yieldToWorker();
    }
    const element = elements[index] as unknown as Record<string, unknown>;
    const type = String(element.type);
    elementTypes[type] = (elementTypes[type] ?? 0) + 1;
    const category = geometryCategory(type);
    if (category) {
      const key = `${category}:${type}`;
      const existing = issueCounts.get(key);
      issueCounts.set(key, { category, count: (existing?.count ?? 0) + 1 });
    }
    scanMillimetreValues(element, scan);
  }
  throwIfCancelled(control);

  const unsupportedGeometry: UnsupportedGeometryIssue[] = Array.from(
    issueCounts.entries(),
  )
    .map(([key, value]) => {
      const elementType = key.slice(key.indexOf(":") + 1);
      return {
        category: value.category,
        elementType,
        count: value.count,
        severity: "blocks-materialization" as const,
        message: issueMessage(value.category),
      };
    })
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category) ||
        a.elementType.localeCompare(b.elementType),
    );

  return {
    valid: true,
    source: "circuit-json",
    authorityMode: "native",
    elementCount: elements.length,
    elementTypes,
    convertedMmValueCount: scan.converted,
    boundsNm: scan.hasBounds
      ? {
          minX: scan.minX,
          minY: scan.minY,
          maxX: scan.maxX,
          maxY: scan.maxY,
        }
      : null,
    unsupportedGeometry,
    errors: [],
    warnings: [
      "Preview only: no native design, history revision, undo entry, or manufacturing export was changed.",
      ...(scan.quantized > 0
        ? [
            `${scan.quantized} millimetre values were rounded to the nearest integer nanometre for preview bounds.`,
          ]
        : []),
    ],
    nativeMaterialization: {
      canApply: false,
      reason:
        "Atomic native materialization is intentionally unavailable in V1 until full geometry and net-identity validation can produce one revision and one undo entry.",
    },
  };
}
