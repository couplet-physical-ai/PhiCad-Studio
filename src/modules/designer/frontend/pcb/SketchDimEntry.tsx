import type { ReactElement } from "react";
import { formatMm } from "./tools/measure-tool-state";
import { formatAngleDeg, type SketchEntry } from "./sketch-dimensions";
import type { InferKind } from "./sketch-inference";

interface SketchDimEntryProps {
  /** Typed-entry buffer, or null when the user is placing by mouse only. */
  entry: SketchEntry | null;
  /** Live length/angle of the rubber-band edge (last vertex → resolved point). */
  readout: { lengthMm: number; angleDeg: number } | null;
  /** Active soft-inference constraint, shown as a chip. */
  constraint?: InferKind | null;
  /** Viewport cursor position; the box floats just off it. */
  cursorClientPx: { x: number; y: number } | null;
}

const CONSTRAINT_CHIP: Record<Exclude<InferKind, "none">, string> = {
  horizontal: "— H",
  vertical: "| V",
  vertex: "⊙ snap",
};

function Field({
  label,
  value,
  active,
  typed,
}: {
  label: string;
  value: string;
  active: boolean;
  typed: boolean;
}): ReactElement {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-3 text-slate-400">{label}</span>
      <span
        className={
          "min-w-[3.5rem] rounded px-1 py-0.5 text-right tabular-nums " +
          (active
            ? "bg-violet-500/25 text-white ring-1 ring-violet-400/70"
            : "text-slate-200")
        }
      >
        {value}
        {active && typed ? (
          <span className="ml-0.5 inline-block w-px animate-pulse bg-violet-300">
            &nbsp;
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * SolidWorks-style at-cursor readout for the Board Shape draw tool. Always shows
 * the live edge length + angle while drawing; the field the user is typing into
 * is highlighted with the raw buffer. `pointer-events-none` + non-focusable so
 * the window keydown handler keeps capturing keystrokes (an `<input>` would
 * steal focus and the tool's global key routing).
 */
export function SketchDimEntry({
  entry,
  readout,
  constraint = null,
  cursorClientPx,
}: SketchDimEntryProps): ReactElement | null {
  if (!cursorClientPx || (!entry && !readout)) return null;
  const chip =
    constraint && constraint !== "none" ? CONSTRAINT_CHIP[constraint] : null;

  const lengthTyped = entry?.field === "length" && entry.lengthText !== "";
  const angleTyped = entry?.field === "angle" && entry.angleText !== "";
  const lengthValue = lengthTyped
    ? `${entry!.lengthText} mm`
    : readout
      ? formatMm(readout.lengthMm)
      : "—";
  const angleValue = angleTyped
    ? `${entry!.angleText}°`
    : readout
      ? formatAngleDeg(readout.angleDeg)
      : "—";

  return (
    <div
      data-testid="sketch-dim-entry"
      className="pointer-events-none fixed z-30 flex flex-col gap-0.5 rounded-md border border-slate-700 bg-slate-950/95 px-2 py-1 text-[11px] font-medium shadow-lg backdrop-blur"
      style={{ left: cursorClientPx.x + 18, top: cursorClientPx.y + 18 }}
    >
      <Field
        label="L"
        value={lengthValue}
        active={entry?.field === "length"}
        typed={lengthTyped}
      />
      <Field
        label="∠"
        value={angleValue}
        active={entry?.field === "angle"}
        typed={angleTyped}
      />
      {chip ? (
        <div className="mt-0.5 self-start rounded bg-amber-500/20 px-1 py-px text-[10px] font-semibold text-amber-300">
          {chip}
        </div>
      ) : null}
    </div>
  );
}
