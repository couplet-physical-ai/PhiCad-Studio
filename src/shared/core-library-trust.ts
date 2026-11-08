export const CORE_LIBRARY_TRUST_ERROR_CODE = "CORE_LIBRARY_TRUST_BLOCKED";

export function coreLibraryTrustError(message: string): Error {
  return new Error(`${CORE_LIBRARY_TRUST_ERROR_CODE}: ${message}`);
}

export function isCoreLibraryTrustError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(`${CORE_LIBRARY_TRUST_ERROR_CODE}:`);
}
