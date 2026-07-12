import { describe, expect, test } from "bun:test";
import {
  diffPairPartnerName,
  isDiffPair,
} from "../../../modules/designer/frontend/pcb/tools/diff-pair";

describe("diffPairPartnerName", () => {
  test("_P/_N suffix, case preserved", () => {
    expect(diffPairPartnerName("CLK_P")).toBe("CLK_N");
    expect(diffPairPartnerName("CLK_N")).toBe("CLK_P");
    expect(diffPairPartnerName("lvds0_p")).toBe("lvds0_n");
    expect(diffPairPartnerName("lvds0_n")).toBe("lvds0_p");
  });

  test("trailing +/- (USB style)", () => {
    expect(diffPairPartnerName("D+")).toBe("D-");
    expect(diffPairPartnerName("D-")).toBe("D+");
    expect(diffPairPartnerName("USB_DM-")).toBe("USB_DM+");
  });

  test("non-pair names return null", () => {
    expect(diffPairPartnerName("GND")).toBeNull();
    expect(diffPairPartnerName("CLKP")).toBeNull(); // no underscore
    expect(diffPairPartnerName("N")).toBeNull(); // bare suffix
    expect(diffPairPartnerName("_P")).toBeNull(); // empty stem
    expect(diffPairPartnerName("+")).toBeNull();
  });
});

describe("isDiffPair", () => {
  test("matches both directions, rejects self and mismatches", () => {
    expect(isDiffPair("CLK_P", "CLK_N")).toBe(true);
    expect(isDiffPair("D-", "D+")).toBe(true);
    expect(isDiffPair("CLK_P", "CLK_P")).toBe(false);
    expect(isDiffPair("CLK_P", "DATA_N")).toBe(false);
    expect(isDiffPair("GND", "VCC")).toBe(false);
  });
});
