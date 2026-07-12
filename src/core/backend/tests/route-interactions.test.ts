import { describe, expect, test } from "bun:test";
import { resolveRouteClickAction } from "../../../modules/designer/frontend/pcb/tools/route-interactions";

const freeAnchor = { onPad: false, netId: null } as const;
const padAnchor = (netId: string | null) => ({ onPad: true, netId });

describe("resolveRouteClickAction", () => {
  test("idle click starts a session regardless of anchor", () => {
    expect(
      resolveRouteClickAction({
        routing: false,
        anchor: freeAnchor,
        sessionNetId: null,
        clickCount: 1,
      }),
    ).toBe("start");
    expect(
      resolveRouteClickAction({
        routing: false,
        anchor: padAnchor("net-1"),
        sessionNetId: null,
        clickCount: 2,
      }),
    ).toBe("start");
  });

  test("single click on free space commits a waypoint", () => {
    expect(
      resolveRouteClickAction({
        routing: true,
        anchor: freeAnchor,
        sessionNetId: "net-1",
        clickCount: 1,
      }),
    ).toBe("waypoint");
  });

  test("click on same-net pad finishes", () => {
    expect(
      resolveRouteClickAction({
        routing: true,
        anchor: padAnchor("net-1"),
        sessionNetId: "net-1",
        clickCount: 1,
      }),
    ).toBe("finish");
  });

  test("pad finish allowed when either side is net-less", () => {
    expect(
      resolveRouteClickAction({
        routing: true,
        anchor: padAnchor("net-1"),
        sessionNetId: null,
        clickCount: 1,
      }),
    ).toBe("finish");
    expect(
      resolveRouteClickAction({
        routing: true,
        anchor: padAnchor(null),
        sessionNetId: "net-1",
        clickCount: 1,
      }),
    ).toBe("finish");
  });

  test("single click on different-net pad is a waypoint, not a short", () => {
    expect(
      resolveRouteClickAction({
        routing: true,
        anchor: padAnchor("net-2"),
        sessionNetId: "net-1",
        clickCount: 1,
      }),
    ).toBe("waypoint");
  });

  test("click on same-net copper (trace/via) finishes in a T-junction", () => {
    expect(
      resolveRouteClickAction({
        routing: true,
        anchor: { onPad: false, netId: "net-1" },
        sessionNetId: "net-1",
        clickCount: 1,
      }),
    ).toBe("finish");
  });

  test("copper finish requires a strict non-null net match", () => {
    // Different net → waypoint (live DRC will flag the crossing).
    expect(
      resolveRouteClickAction({
        routing: true,
        anchor: { onPad: false, netId: "net-2" },
        sessionNetId: "net-1",
        clickCount: 1,
      }),
    ).toBe("waypoint");
    // Net-less session never auto-finishes on arbitrary copper.
    expect(
      resolveRouteClickAction({
        routing: true,
        anchor: { onPad: false, netId: "net-1" },
        sessionNetId: null,
        clickCount: 1,
      }),
    ).toBe("waypoint");
  });

  test("double-click finishes anywhere (dangling end)", () => {
    expect(
      resolveRouteClickAction({
        routing: true,
        anchor: freeAnchor,
        sessionNetId: "net-1",
        clickCount: 2,
      }),
    ).toBe("finish");
  });

  test("double-click on different-net pad still finishes at that point", () => {
    // Explicit user intent: double-click always ends the route; DRC reports
    // any resulting clearance/short violation.
    expect(
      resolveRouteClickAction({
        routing: true,
        anchor: padAnchor("net-2"),
        sessionNetId: "net-1",
        clickCount: 2,
      }),
    ).toBe("finish");
  });

  test("modifier click on a compatible pad proposes auto-finish", () => {
    expect(
      resolveRouteClickAction({
        routing: true,
        anchor: padAnchor("net-1"),
        sessionNetId: "net-1",
        clickCount: 1,
        autoFinishModifier: true,
      }),
    ).toBe("auto-finish");
    // Net-less pad / net-less session are pad-finish-compatible → auto-finish.
    expect(
      resolveRouteClickAction({
        routing: true,
        anchor: padAnchor(null),
        sessionNetId: "net-1",
        clickCount: 1,
        autoFinishModifier: true,
      }),
    ).toBe("auto-finish");
  });

  test("modifier click never proposes on incompatible or non-pad anchors", () => {
    // Different-net pad stays a waypoint (no silent short, no proposal).
    expect(
      resolveRouteClickAction({
        routing: true,
        anchor: padAnchor("net-2"),
        sessionNetId: "net-1",
        clickCount: 1,
        autoFinishModifier: true,
      }),
    ).toBe("waypoint");
    // Free space with the modifier is still a plain waypoint.
    expect(
      resolveRouteClickAction({
        routing: true,
        anchor: freeAnchor,
        sessionNetId: "net-1",
        clickCount: 1,
        autoFinishModifier: true,
      }),
    ).toBe("waypoint");
    // Same-net copper (non-pad) keeps its strict-match finish semantics.
    expect(
      resolveRouteClickAction({
        routing: true,
        anchor: { onPad: false, netId: "net-1" },
        sessionNetId: "net-1",
        clickCount: 1,
        autoFinishModifier: true,
      }),
    ).toBe("finish");
    // Idle click starts a session even with the modifier held.
    expect(
      resolveRouteClickAction({
        routing: false,
        anchor: padAnchor("net-1"),
        sessionNetId: null,
        clickCount: 1,
        autoFinishModifier: true,
      }),
    ).toBe("start");
  });
});
