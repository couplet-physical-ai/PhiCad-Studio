import type { DesignerDispatchResult } from "../../../../sdks";

/**
 * Human-readable message for a failed command dispatch. Keeps the backend's
 * problem detail instead of a generic "<op> failed" so route-tool rejections
 * tell the user what to fix.
 */
export function dispatchFailureMessage(
  op: string,
  result: DesignerDispatchResult & { ok: false },
): string {
  const detail =
    "detail" in result && typeof result.detail === "string"
      ? `: ${result.detail}`
      : ` (${result.code})`;
  return `${op} rejected${detail}`;
}
