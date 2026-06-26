import { useCallback, useRef, useState } from "react";
import type {
  PcbLayerId,
  PcbPlacedPart,
  PcbPointMm,
  PlaceOperation,
  PlaceOperationPayload,
} from "../../../../sdks";

/**
 * Non-destructive auto-place preview state.
 *
 * When the cloud auto-placer returns a `PlacementResultEnvelope`, the canvas enters a
 * preview where affected components render solid at their PROPOSED pose and the user can
 * drag / rotate / flip them to adjust — all held in this local transform map, never the
 * DB, until Accept. Accept diffs the final map vs. the captured originals into a fresh
 * `PlaceOperation[]` and reuses the existing apply endpoint; Reject just clears.
 */
export interface ProposedTransform {
  positionMm: PcbPointMm;
  /** Cardinal once produced by the engine or by `rotate()`; may echo a non-cardinal original. */
  rotationDeg: number;
  layer: PcbLayerId;
  mirrored: boolean;
}

const EPS_MM = 1e-6;

function transformOf(p: PcbPlacedPart): ProposedTransform {
  return {
    positionMm: { ...p.positionMm },
    rotationDeg: p.rotationDeg,
    layer: p.layer,
    mirrored: p.mirrored,
  };
}

/** Next cardinal rotation, snapping a non-cardinal start to its nearest 90° first. */
function nextCardinal(deg: number): 0 | 90 | 180 | 270 {
  const snapped = Math.round(deg / 90) * 90;
  return ((((snapped + 90) % 360) + 360) % 360) as 0 | 90 | 180 | 270;
}

/**
 * Seed the proposed transform per affected id by replaying the engine's ops onto each
 * component's current pose. Mirrors the apply path: move→position, rotate→absolute
 * cardinal, flip→toggle BOTH layer (F.Cu↔B.Cu) and `mirrored`.
 */
export function buildProposedTransforms(
  placements: readonly PcbPlacedPart[],
  ops: readonly PlaceOperation[],
): Map<string, ProposedTransform> {
  const byId = new Map(placements.map((p) => [p.id, p]));
  const out = new Map<string, ProposedTransform>();
  for (const op of ops) {
    const payload = op.payload;
    const base = byId.get(payload.placementId);
    if (!base) continue;
    const cur = out.get(payload.placementId) ?? transformOf(base);
    if (payload.type === "pcb_move_placement") {
      out.set(payload.placementId, {
        ...cur,
        positionMm: { ...payload.positionMm },
      });
    } else if (payload.type === "pcb_rotate_placement") {
      out.set(payload.placementId, {
        ...cur,
        rotationDeg: payload.rotationDeg,
      });
    } else if (payload.type === "pcb_flip_placement") {
      out.set(payload.placementId, {
        ...cur,
        layer: cur.layer === "B.Cu" ? "F.Cu" : "B.Cu",
        mirrored: !cur.mirrored,
      });
    }
  }
  return out;
}

function poseDiffers(t: ProposedTransform, o: PcbPlacedPart): boolean {
  return (
    Math.abs(t.positionMm.x - o.positionMm.x) > EPS_MM ||
    Math.abs(t.positionMm.y - o.positionMm.y) > EPS_MM ||
    t.rotationDeg !== o.rotationDeg ||
    t.mirrored !== o.mirrored
  );
}

/** Overlay the proposed transforms onto the live placements (unaffected ids pass through). */
export function applyTransformsToPlacements(
  placements: readonly PcbPlacedPart[],
  transforms: Map<string, ProposedTransform>,
): PcbPlacedPart[] {
  if (transforms.size === 0) return [...placements];
  return placements.map((p) => {
    const t = transforms.get(p.id);
    if (!t) return p;
    return {
      ...p,
      positionMm: t.positionMm,
      rotationDeg: t.rotationDeg,
      layer: t.layer,
      mirrored: t.mirrored,
    };
  });
}

/** The original placements (as dim "from" markers) for ids whose net pose actually changed. */
export function buildFromMarkers(
  transforms: Map<string, ProposedTransform>,
  originals: Map<string, PcbPlacedPart>,
): PcbPlacedPart[] {
  const out: PcbPlacedPart[] = [];
  for (const [id, t] of transforms) {
    const o = originals.get(id);
    if (o && poseDiffers(t, o)) out.push(o);
  }
  return out;
}

/** Standing proposed origin positions for every touched id — drives the preview ratsnest. */
export function buildPositionOverride(
  transforms: Map<string, ProposedTransform>,
): Map<string, PcbPointMm> {
  const out = new Map<string, PcbPointMm>();
  for (const [id, t] of transforms) out.set(id, t.positionMm);
  return out;
}

/**
 * Diff the final adjusted transforms against the captured originals into a fresh batch of
 * `PlaceOperation`s. Move/rotate are absolute; flip is a single toggle emitted iff side
 * parity differs (so a double-flip yields no op). The wrapper fields are cosmetic — the
 * apply endpoint only forwards `payload`.
 */
export function diffToOperations(
  transforms: Map<string, ProposedTransform>,
  originals: Map<string, PcbPlacedPart>,
): PlaceOperation[] {
  const ops: PlaceOperation[] = [];
  const push = (
    kind: PlaceOperation["kind"],
    title: string,
    payload: PlaceOperationPayload,
  ): void => {
    ops.push({
      id: crypto.randomUUID(),
      kind,
      title,
      summary: title,
      riskLevel: "low",
      payload,
      sources: [],
      warnings: [],
    });
  };
  for (const [id, t] of transforms) {
    const o = originals.get(id);
    if (!o) continue;
    if (
      Math.abs(t.positionMm.x - o.positionMm.x) > EPS_MM ||
      Math.abs(t.positionMm.y - o.positionMm.y) > EPS_MM
    ) {
      push("pcb_move_placement", `Move ${o.reference}`, {
        type: "pcb_move_placement",
        placementId: id,
        positionMm: t.positionMm,
      });
    }
    if (t.rotationDeg !== o.rotationDeg) {
      push("pcb_rotate_placement", `Rotate ${o.reference}`, {
        type: "pcb_rotate_placement",
        placementId: id,
        rotationDeg: t.rotationDeg as 0 | 90 | 180 | 270,
      });
    }
    if (t.mirrored !== o.mirrored) {
      push("pcb_flip_placement", `Flip ${o.reference}`, {
        type: "pcb_flip_placement",
        placementId: id,
      });
    }
  }
  return ops;
}

interface PreviewState {
  active: boolean;
  transforms: Map<string, ProposedTransform>;
  originals: Map<string, PcbPlacedPart>;
}

const EMPTY: PreviewState = {
  active: false,
  transforms: new Map(),
  originals: new Map(),
};

export interface PcbPlacePreview {
  active: boolean;
  transforms: Map<string, ProposedTransform>;
  originals: Map<string, PcbPlacedPart>;
  /** Synchronous read of the latest transforms for pointer/keyboard handlers. */
  transformsRef: React.MutableRefObject<Map<string, ProposedTransform>>;
  begin: (
    placements: readonly PcbPlacedPart[],
    ops: readonly PlaceOperation[],
  ) => void;
  setPositions: (
    updates: ReadonlyArray<{ placementId: string; positionMm: PcbPointMm }>,
    originalById: Map<string, PcbPlacedPart>,
  ) => void;
  rotate: (id: string, originalById: Map<string, PcbPlacedPart>) => void;
  flip: (id: string, originalById: Map<string, PcbPlacedPart>) => void;
  flipMany: (
    ids: readonly string[],
    originalById: Map<string, PcbPlacedPart>,
  ) => void;
  clear: () => void;
}

export function usePcbPlacePreview(): PcbPlacePreview {
  const [state, setState] = useState<PreviewState>(EMPTY);
  const transformsRef = useRef<Map<string, ProposedTransform>>(
    state.transforms,
  );
  transformsRef.current = state.transforms;

  const begin = useCallback(
    (placements: readonly PcbPlacedPart[], ops: readonly PlaceOperation[]) => {
      const transforms = buildProposedTransforms(placements, ops);
      const byId = new Map(placements.map((p) => [p.id, p]));
      const originals = new Map<string, PcbPlacedPart>();
      for (const id of transforms.keys()) {
        const p = byId.get(id);
        if (p) originals.set(id, p);
      }
      setState({ active: true, transforms, originals });
    },
    [],
  );

  /** Capture an untouched component's original pose the first time the user adjusts it. */
  const ensureOriginal = (
    originals: Map<string, PcbPlacedPart>,
    id: string,
    originalById: Map<string, PcbPlacedPart>,
  ): Map<string, PcbPlacedPart> => {
    if (originals.has(id)) return originals;
    const o = originalById.get(id);
    if (!o) return originals;
    const next = new Map(originals);
    next.set(id, o);
    return next;
  };

  const currentTransform = (
    transforms: Map<string, ProposedTransform>,
    id: string,
    originalById: Map<string, PcbPlacedPart>,
  ): ProposedTransform | null => {
    const cur = transforms.get(id);
    if (cur) return cur;
    const o = originalById.get(id);
    return o ? transformOf(o) : null;
  };

  const setPositions = useCallback(
    (
      updates: ReadonlyArray<{ placementId: string; positionMm: PcbPointMm }>,
      originalById: Map<string, PcbPlacedPart>,
    ) => {
      setState((prev) => {
        if (!prev.active) return prev;
        const transforms = new Map(prev.transforms);
        let originals = prev.originals;
        for (const u of updates) {
          originals = ensureOriginal(originals, u.placementId, originalById);
          const cur = currentTransform(transforms, u.placementId, originalById);
          if (!cur) continue;
          transforms.set(u.placementId, {
            ...cur,
            positionMm: { ...u.positionMm },
          });
        }
        return { active: true, transforms, originals };
      });
    },
    [],
  );

  const rotate = useCallback(
    (id: string, originalById: Map<string, PcbPlacedPart>) => {
      setState((prev) => {
        if (!prev.active) return prev;
        const cur = currentTransform(prev.transforms, id, originalById);
        if (!cur) return prev;
        const transforms = new Map(prev.transforms);
        transforms.set(id, {
          ...cur,
          rotationDeg: nextCardinal(cur.rotationDeg),
        });
        return {
          active: true,
          transforms,
          originals: ensureOriginal(prev.originals, id, originalById),
        };
      });
    },
    [],
  );

  const flipOne = (
    transforms: Map<string, ProposedTransform>,
    id: string,
    originalById: Map<string, PcbPlacedPart>,
  ): void => {
    const cur = currentTransform(transforms, id, originalById);
    if (!cur) return;
    transforms.set(id, {
      ...cur,
      layer: cur.layer === "B.Cu" ? "F.Cu" : "B.Cu",
      mirrored: !cur.mirrored,
    });
  };

  const flip = useCallback(
    (id: string, originalById: Map<string, PcbPlacedPart>) => {
      setState((prev) => {
        if (!prev.active) return prev;
        const transforms = new Map(prev.transforms);
        flipOne(transforms, id, originalById);
        return {
          active: true,
          transforms,
          originals: ensureOriginal(prev.originals, id, originalById),
        };
      });
    },
    [],
  );

  const flipMany = useCallback(
    (ids: readonly string[], originalById: Map<string, PcbPlacedPart>) => {
      setState((prev) => {
        if (!prev.active) return prev;
        const transforms = new Map(prev.transforms);
        let originals = prev.originals;
        for (const id of ids) {
          originals = ensureOriginal(originals, id, originalById);
          flipOne(transforms, id, originalById);
        }
        return { active: true, transforms, originals };
      });
    },
    [],
  );

  const clear = useCallback(() => setState(EMPTY), []);

  return {
    active: state.active,
    transforms: state.transforms,
    originals: state.originals,
    transformsRef,
    begin,
    setPositions,
    rotate,
    flip,
    flipMany,
    clear,
  };
}
