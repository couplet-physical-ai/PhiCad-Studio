import { describe, expect, test } from "bun:test";
import {
  CORE_LIBRARY_SIGNATURE_ENV,
  STUDIO_UPDATE_OPT_IN_ENV,
  coreLibrarySignatureRequired,
  enforcePackagedCoreLibraryTrust,
  studioUpdateNetworkEnabled,
} from "./product-policy";

describe("PhiCad-Studio packaged product policy", () => {
  test("makes no updater network request without exact local opt-in", () => {
    expect(studioUpdateNetworkEnabled(true, {})).toBe(false);
    expect(
      studioUpdateNetworkEnabled(true, { [STUDIO_UPDATE_OPT_IN_ENV]: "0" }),
    ).toBe(false);
    expect(
      studioUpdateNetworkEnabled(true, { [STUDIO_UPDATE_OPT_IN_ENV]: "true" }),
    ).toBe(false);
    expect(
      studioUpdateNetworkEnabled(true, { [STUDIO_UPDATE_OPT_IN_ENV]: "1" }),
    ).toBe(true);
    expect(
      studioUpdateNetworkEnabled(false, { [STUDIO_UPDATE_OPT_IN_ENV]: "1" }),
    ).toBe(false);
  });

  test("requires signatures in every packaged process", () => {
    expect(coreLibrarySignatureRequired(true, {})).toBe(true);
    expect(
      coreLibrarySignatureRequired(true, { [CORE_LIBRARY_SIGNATURE_ENV]: "0" }),
    ).toBe(true);
    expect(coreLibrarySignatureRequired(false, {})).toBe(false);
    expect(
      coreLibrarySignatureRequired(false, {
        [CORE_LIBRARY_SIGNATURE_ENV]: "1",
      }),
    ).toBe(true);
  });

  test("overrides a packaged caller's permissive signature environment", () => {
    const env = { [CORE_LIBRARY_SIGNATURE_ENV]: "0" };
    enforcePackagedCoreLibraryTrust(true, env);
    expect(env[CORE_LIBRARY_SIGNATURE_ENV]).toBe("1");

    const devEnv = { [CORE_LIBRARY_SIGNATURE_ENV]: "0" };
    enforcePackagedCoreLibraryTrust(false, devEnv);
    expect(devEnv[CORE_LIBRARY_SIGNATURE_ENV]).toBe("0");
  });
});
