export const STUDIO_UPDATE_OPT_IN_ENV = "PHICAD_STUDIO_ENABLE_UPDATES";
export const CORE_LIBRARY_SIGNATURE_ENV = "OPENPCB_REQUIRE_SIGNED_OPCLIB";

export type RuntimeEnvironment = Record<string, string | undefined>;

/**
 * PhiCad-Studio never checks the network for updates unless the launching
 * environment opts in with the exact value `1`.
 */
export function studioUpdateNetworkEnabled(
  isPackaged: boolean,
  env: RuntimeEnvironment = process.env,
): boolean {
  return isPackaged && env[STUDIO_UPDATE_OPT_IN_ENV] === "1";
}

/**
 * Packaged Studio cannot opt out of CoreLibrary verification. Source/dev runs
 * retain upstream's explicit strict-mode environment switch.
 */
export function coreLibrarySignatureRequired(
  isPackaged: boolean,
  env: RuntimeEnvironment = process.env,
): boolean {
  return isPackaged || env[CORE_LIBRARY_SIGNATURE_ENV] === "1";
}

export function enforcePackagedCoreLibraryTrust(
  isPackaged: boolean,
  env: RuntimeEnvironment = process.env,
): void {
  if (isPackaged) env[CORE_LIBRARY_SIGNATURE_ENV] = "1";
}
