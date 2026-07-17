/**
 * Pure dimension math for the Board Shape draw/edit tools. No THREE, no store —
 * unit-tested standalone. Turns a typed length and/or angle into an exact next
 * vertex, letting the live cursor drive whichever field the user did not type
 * (SolidWorks-style on-screen numeric entry).
 *
 * Coordinates are millimetres (board-outline space). Angle is absolute, measured
 * from +X CCW in degrees — the same convention as `measureBetween`, so the
 * at-cursor readout and this producer never disagree.
 */
import type { PcbPointMm } from "../../../../sdks";
import { constrainAngle } from "./sketch-geometry";

export interface LengthAngleInput {
  /** Exact edge length in mm. Omit/undefined ⇒ take the length from the cursor. */
  lengthMm?: number;
  /** Exact edge angle in degrees (absolute, +X CCW). Omit ⇒ take the cursor's. */
  angleDeg?: number;
}

const DEG = Math.PI / 180;

/**
 * Place the next vertex from `prev` using any typed length/angle, filling the
 * un-typed field from the current cursor direction/distance. Returns `cursor`
 * unchanged when nothing is typed (pure mouse placement).
 */
export function applyLengthAngle(
  prev: PcbPointMm,
  cursor: PcbPointMm,
  input: LengthAngleInput,
): PcbPointMm {
  const hasLen =
    input.lengthMm != null && Number.isFinite(input.lengthMm) && input.lengthMm >= 0;
  const hasAng = input.angleDeg != null && Number.isFinite(input.angleDeg);
  if (!hasLen && !hasAng) return cursor;

  const dx = cursor.x - prev.x;
  const dy = cursor.y - prev.y;
  const length = hasLen ? input.lengthMm! : Math.hypot(dx, dy);
  const angle = hasAng ? input.angleDeg! * DEG : Math.atan2(dy, dx);

  return {
    x: prev.x + Math.cos(angle) * length,
    y: prev.y + Math.sin(angle) * length,
  };
}

/** Compact angle label, e.g. `45°` / `-90°`. Normalised to (-180, 180]. */
export function formatAngleDeg(deg: number): string {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  // Collapse ±0 to a clean "0°".
  const rounded = Math.abs(a) < 0.05 ? 0 : a;
  if (rounded === 0) return "0°";
  const digits = Math.abs(rounded) < 100 ? 1 : 0;
  return `${rounded.toFixed(digits)}°`;
}

// ---------------------------------------------------------------------------
// Typed-entry buffer (SolidWorks-style on-screen numeric input)
// ---------------------------------------------------------------------------

/** Which field of the at-cursor box the next keystroke edits. */
export type SketchEntryField = "length" | "angle";

/** In-progress typed dimension buffer. `""` fields fall back to the cursor. */
export interface SketchEntry {
  field: SketchEntryField;
  lengthText: string;
  angleText: string;
}

export function emptySketchEntry(field: SketchEntryField = "length"): SketchEntry {
  return { field, lengthText: "", angleText: "" };
}

function parseNum(text: string): number | null {
  const n = Number.parseFloat(text);
  return Number.isFinite(n) ? n : null;
}

/** True once either field holds a parseable number. */
export function entryHasValue(entry: SketchEntry): boolean {
  return parseNum(entry.lengthText) != null || parseNum(entry.angleText) != null;
}

/** Extract the typed fields as a {@link LengthAngleInput} for the producers. */
export function parsedEntry(entry: SketchEntry): LengthAngleInput {
  const lengthMm = parseNum(entry.lengthText);
  const angleDeg = parseNum(entry.angleText);
  return {
    ...(lengthMm != null ? { lengthMm } : {}),
    ...(angleDeg != null ? { angleDeg } : {}),
  };
}

/** Swap the active field (Tab). */
export function toggleEntryField(entry: SketchEntry): SketchEntry {
  return { ...entry, field: entry.field === "length" ? "angle" : "length" };
}

/**
 * Append a printable key to the active field. Digits always append; `.` only
 * when the buffer has none yet; `-` toggles the sign of the ANGLE field only
 * (length is unsigned).
 */
export function appendToEntry(entry: SketchEntry, key: string): SketchEntry {
  const which = entry.field === "length" ? "lengthText" : "angleText";
  const cur = entry[which];
  let next = cur;
  if (/^[0-9]$/.test(key)) next = cur + key;
  else if (key === ".") next = cur.includes(".") ? cur : (cur === "" ? "0." : cur + ".");
  else if (key === "-" && entry.field === "angle") {
    next = cur.startsWith("-") ? cur.slice(1) : "-" + cur;
  } else return entry;
  return { ...entry, [which]: next };
}

/** Delete the last char of the active field (Backspace while entry is open). */
export function backspaceEntry(entry: SketchEntry): SketchEntry {
  const which = entry.field === "length" ? "lengthText" : "angleText";
  return { ...entry, [which]: entry[which].slice(0, -1) };
}

/**
 * Resolve the next vertex from the cursor, applying (in order) the Shift 45°
 * lock and any typed length/angle. This is the single producer both the live
 * preview and the click/Enter commit call, so what you see is what commits.
 */
export function resolveSketchPoint(
  prev: PcbPointMm,
  cursor: PcbPointMm,
  opts: { shiftLock: boolean } & LengthAngleInput,
): PcbPointMm {
  const base = opts.shiftLock ? constrainAngle(prev, cursor, true) : cursor;
  return applyLengthAngle(prev, base, {
    lengthMm: opts.lengthMm,
    angleDeg: opts.angleDeg,
  });
}
