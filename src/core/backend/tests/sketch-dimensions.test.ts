import { describe, expect, test } from "bun:test";
import {
  appendToEntry,
  applyLengthAngle,
  backspaceEntry,
  emptySketchEntry,
  entryHasValue,
  formatAngleDeg,
  parsedEntry,
  resolveSketchPoint,
  toggleEntryField,
} from "../../../modules/designer/frontend/pcb/sketch-dimensions";

const p = (x: number, y: number) => ({ x, y });

describe("applyLengthAngle", () => {
  test("no typed input returns the cursor unchanged", () => {
    expect(applyLengthAngle(p(0, 0), p(3, 4), {})).toEqual(p(3, 4));
  });

  test("length-only keeps the cursor angle, sets the distance", () => {
    // Cursor is up-right at 3-4-5; force length 10 along the same direction.
    const out = applyLengthAngle(p(0, 0), p(3, 4), { lengthMm: 10 });
    expect(out.x).toBeCloseTo(6, 6);
    expect(out.y).toBeCloseTo(8, 6);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(10, 6);
  });

  test("angle-only keeps the cursor distance, sets the angle", () => {
    // Cursor 5 mm to the right; rotate to 90°, distance preserved.
    const out = applyLengthAngle(p(0, 0), p(5, 0), { angleDeg: 90 });
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.y).toBeCloseTo(5, 6);
  });

  test("both typed places an exact polar vertex from prev (ignores cursor)", () => {
    const out = applyLengthAngle(p(2, 2), p(999, -999), { lengthMm: 4, angleDeg: 0 });
    expect(out.x).toBeCloseTo(6, 6);
    expect(out.y).toBeCloseTo(2, 6);
  });

  test("respects a non-origin prev anchor", () => {
    const out = applyLengthAngle(p(10, 5), p(20, 5), { lengthMm: 3, angleDeg: 90 });
    expect(out.x).toBeCloseTo(10, 6);
    expect(out.y).toBeCloseTo(8, 6);
  });

  test("negative and non-finite lengths fall back to the cursor length", () => {
    const neg = applyLengthAngle(p(0, 0), p(5, 0), { lengthMm: -3, angleDeg: 0 });
    expect(neg.x).toBeCloseTo(5, 6); // length taken from cursor (5), angle 0
    const nan = applyLengthAngle(p(0, 0), p(5, 0), { lengthMm: Number.NaN });
    expect(nan).toEqual(p(5, 0));
  });
});

describe("formatAngleDeg", () => {
  test("normalises into (-180, 180] and drops -0", () => {
    expect(formatAngleDeg(0)).toBe("0°");
    expect(formatAngleDeg(-0)).toBe("0°");
    expect(formatAngleDeg(45)).toBe("45.0°");
    expect(formatAngleDeg(270)).toBe("-90.0°");
    expect(formatAngleDeg(360)).toBe("0°");
    expect(formatAngleDeg(179.99)).toBe("180°");
  });

  test("drops decimals past 100°", () => {
    expect(formatAngleDeg(135)).toBe("135°");
  });
});

describe("sketch entry buffer", () => {
  test("digits append to the active field only", () => {
    let e = emptySketchEntry(); // field: length
    e = appendToEntry(e, "1");
    e = appendToEntry(e, "2");
    expect(e.lengthText).toBe("12");
    expect(e.angleText).toBe("");
    e = toggleEntryField(e); // → angle
    e = appendToEntry(e, "9");
    expect(e.angleText).toBe("9");
    expect(e.lengthText).toBe("12");
  });

  test("a single dot is allowed; a leading dot becomes 0.", () => {
    let e = appendToEntry(emptySketchEntry(), ".");
    expect(e.lengthText).toBe("0.");
    e = appendToEntry(e, "5");
    e = appendToEntry(e, "."); // second dot ignored
    expect(e.lengthText).toBe("0.5");
  });

  test("minus toggles the sign of the angle field only", () => {
    let e = toggleEntryField(emptySketchEntry()); // angle
    e = appendToEntry(e, "4");
    e = appendToEntry(e, "5");
    e = appendToEntry(e, "-");
    expect(e.angleText).toBe("-45");
    e = appendToEntry(e, "-"); // toggle back
    expect(e.angleText).toBe("45");
    // minus is ignored on the length field
    const len = appendToEntry(appendToEntry(emptySketchEntry(), "3"), "-");
    expect(len.lengthText).toBe("3");
  });

  test("entryHasValue + parsedEntry reflect the buffers", () => {
    expect(entryHasValue(emptySketchEntry())).toBe(false);
    const e = appendToEntry(emptySketchEntry(), "7");
    expect(entryHasValue(e)).toBe(true);
    expect(parsedEntry(e)).toEqual({ lengthMm: 7 });
    const both = appendToEntry(toggleEntryField(appendToEntry(emptySketchEntry(), "5")), "9");
    expect(parsedEntry(both)).toEqual({ lengthMm: 5, angleDeg: 9 });
  });

  test("backspace trims the active field", () => {
    let e = appendToEntry(appendToEntry(emptySketchEntry(), "1"), "2");
    e = backspaceEntry(e);
    expect(e.lengthText).toBe("1");
  });
});

describe("resolveSketchPoint (shift-lock + typed compose)", () => {
  const prev = { x: 0, y: 0 };

  test("no lock, no typed → cursor passthrough", () => {
    expect(
      resolveSketchPoint(prev, { x: 3, y: 4 }, { shiftLock: false }),
    ).toEqual({ x: 3, y: 4 });
  });

  test("typed length overrides distance, keeps cursor direction", () => {
    const out = resolveSketchPoint(prev, { x: 3, y: 4 }, { shiftLock: false, lengthMm: 10 });
    expect(out.x).toBeCloseTo(6, 6);
    expect(out.y).toBeCloseTo(8, 6);
  });

  test("shift lock snaps a near-horizontal cursor to 0°, then typed length applies", () => {
    // Cursor slightly above the axis; 45° lock rounds to horizontal.
    const out = resolveSketchPoint(prev, { x: 10, y: 0.3 }, { shiftLock: true, lengthMm: 5 });
    expect(out.x).toBeCloseTo(5, 6);
    expect(out.y).toBeCloseTo(0, 6);
  });

  test("typed angle overrides the shift-locked direction", () => {
    const out = resolveSketchPoint(prev, { x: 10, y: 0 }, { shiftLock: true, angleDeg: 90 });
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.y).toBeCloseTo(10, 6);
  });
});
