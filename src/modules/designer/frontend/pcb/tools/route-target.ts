import type { PcbPointMm, RatsnestSegment } from "../../../../../sdks/designer";

/**
 * Closest open pad on `netId` per the ratsnest — the pad the dynamic ratsnest
 * guide points at while routing, and the auto-finish target. Deterministic
 * tie-break: squared distance, then pad id, so the guide and Tab always agree.
 */
export function nearestRatsnestPad(input: {
  ratsnest: ReadonlyArray<RatsnestSegment>;
  netId: string;
  fromMm: PcbPointMm;
  excludePadIds?: ReadonlySet<string>;
}): { padId: string; centerMm: PcbPointMm } | null {
  const pads = new Map<string, PcbPointMm>();
  for (const seg of input.ratsnest) {
    if (seg.netId !== input.netId) continue;
    const fromKey = `${seg.fromPlacementId}|${seg.fromPadNumber}`;
    const toKey = `${seg.toPlacementId}|${seg.toPadNumber}`;
    if (!pads.has(fromKey)) pads.set(fromKey, seg.fromMm);
    if (!pads.has(toKey)) pads.set(toKey, seg.toMm);
  }
  let bestId: string | null = null;
  let bestCenter: PcbPointMm | null = null;
  let bestDistSq = Infinity;
  for (const [padId, centerMm] of pads) {
    if (input.excludePadIds?.has(padId)) continue;
    const dx = centerMm.x - input.fromMm.x;
    const dy = centerMm.y - input.fromMm.y;
    const distSq = dx * dx + dy * dy;
    if (
      distSq < bestDistSq ||
      (distSq === bestDistSq && bestId !== null && padId < bestId)
    ) {
      bestDistSq = distSq;
      bestId = padId;
      bestCenter = centerMm;
    }
  }
  if (bestId === null || bestCenter === null) return null;
  return { padId: bestId, centerMm: bestCenter };
}
