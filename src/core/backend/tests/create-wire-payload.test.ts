import { describe, expect, test } from "bun:test";
import { buildCreateWirePayload } from "../../../modules/designer/backend/commands/create-wire";
import type { DesignerPin } from "../../../sdks/designer/types";

function pin(id: string, x: number, y: number): DesignerPin {
  return {
    id,
    originPinKey: id,
    number: null,
    name: id,
    electricalType: "passive",
    unit: 1,
    localPositionNm: { x: 0, y: 0 },
    worldPositionNm: { x, y },
  };
}

describe("buildCreateWirePayload path validation", () => {
  const source = pin("a:1", 0, 0);
  const target = pin("b:1", 10_000, 20_000);

  test("clean L path is preserved verbatim", () => {
    const built = buildCreateWirePayload(source, target, [
      { x: 0, y: 0 },
      { x: 10_000, y: 0 },
      { x: 10_000, y: 20_000 },
    ]);
    expect(built.invalidReason).toBeNull();
    expect(built.payload?.pointsNm).toEqual([
      { x: 0, y: 0 },
      { x: 10_000, y: 0 },
      { x: 10_000, y: 20_000 },
    ]);
  });

  test("no points → single L-bend default", () => {
    const built = buildCreateWirePayload(source, target, undefined);
    expect(built.invalidReason).toBeNull();
    expect(built.payload?.pointsNm).toEqual([
      { x: 0, y: 0 },
      { x: 10_000, y: 0 },
      { x: 10_000, y: 20_000 },
    ]);
  });

  test("rejects a path revisiting an earlier vertex", () => {
    const built = buildCreateWirePayload(source, target, [
      { x: 0, y: 0 },
      { x: 10_000, y: 0 },
      { x: 10_000, y: 5_000 },
      { x: 10_000, y: 0 }, // revisit
      { x: 10_000, y: 20_000 },
    ]);
    expect(built.payload).toBeNull();
    expect(built.invalidReason).toContain("revisits");
  });

  test("rejects a collinear direction reversal with no repeated vertex", () => {
    const built = buildCreateWirePayload(source, pin("c:1", 5_000, 0), [
      { x: 0, y: 0 },
      { x: 10_000, y: 0 },
      { x: 5_000, y: 0 }, // doubles back along the first segment
    ]);
    expect(built.payload).toBeNull();
    expect(built.invalidReason).toContain("doubles back");
  });

  test("valid Z path passes", () => {
    const built = buildCreateWirePayload(source, target, [
      { x: 0, y: 0 },
      { x: 5_000, y: 0 },
      { x: 5_000, y: 10_000 },
      { x: 10_000, y: 10_000 },
      { x: 10_000, y: 20_000 },
    ]);
    expect(built.invalidReason).toBeNull();
    expect(built.payload).not.toBeNull();
  });

  test("still rejects self-loop and zero-length", () => {
    expect(buildCreateWirePayload(source, source, undefined).payload).toBeNull();
    expect(
      buildCreateWirePayload(source, pin("d:1", 0, 0), undefined).payload,
    ).toBeNull();
  });
});
