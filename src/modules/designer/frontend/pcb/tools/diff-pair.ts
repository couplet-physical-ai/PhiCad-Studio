/**
 * Differential-pair detection — LOCKED to net-name suffix conventions only:
 * `_P` ↔ `_N` (case preserved) and trailing `+` ↔ `-` (USB D+/D-). No
 * per-net pair metadata in v1.
 */
export function diffPairPartnerName(netName: string): string | null {
  if (netName.length < 2) return null;
  if (netName.endsWith("+")) return `${netName.slice(0, -1)}-`;
  if (netName.endsWith("-")) return `${netName.slice(0, -1)}+`;
  const match = /^(.+_)([PpNn])$/.exec(netName);
  if (!match) return null;
  const suffix = match[2]!;
  const partner =
    suffix === "P" ? "N" : suffix === "p" ? "n" : suffix === "N" ? "P" : "p";
  return match[1]! + partner;
}

/** True when the two net names form a `_P/_N` or `+/-` pair. */
export function isDiffPair(nameA: string, nameB: string): boolean {
  return (
    nameA !== nameB &&
    (diffPairPartnerName(nameA) === nameB ||
      diffPairPartnerName(nameB) === nameA)
  );
}
