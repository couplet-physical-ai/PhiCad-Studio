import { describe, expect, test } from "bun:test";
import { dispatchFailureMessage } from "../../../modules/designer/frontend/pcb/dispatch-failure";

describe("dispatchFailureMessage", () => {
  test("keeps the backend problem detail when present", () => {
    expect(
      dispatchFailureMessage("Trace", {
        ok: false,
        code: "INVALID_PCB_TRACE",
        detail: "path must contain at least 2 distinct points",
      }),
    ).toBe("Trace rejected: path must contain at least 2 distinct points");
  });

  test("falls back to the error code when no detail exists", () => {
    expect(
      dispatchFailureMessage("Via", {
        ok: false,
        code: "REVISION_CONFLICT",
        conflict: { expected: 3, actual: 5 },
      }),
    ).toBe("Via rejected (REVISION_CONFLICT)");
  });
});
