/**
 * The single geometric tolerance policy for DRC and creation gates
 * (DRC_HARDENING_PLAN.md P1). One rule everywhere: exact-spec geometry always
 * passes; deficits/excesses inside the tolerance are float noise, not
 * violations.
 *
 * Floating-point sums like `(0.3 - 0.1) / 2` land at `0.09999999999999999`,
 * which would falsely fail a bare `< 0.1` minimum — and `(0.7 - 0.4) / 2`
 * lands at `0.14999999999999997`, which falsely failed the fab annular
 * validator before P1 (audit B2-1). 1e-6 mm = 1 nm — far below any real DRC
 * value and below the 1 nm coordinate quantum.
 */
export const DRC_EPS_MM = 1e-6;

/**
 * Overlap tolerance for short detection (0.1 µm). Different-net copper closer
 * than this is a dead short regardless of the configured clearance rule.
 */
export const SHORT_EPS_MM = 1e-4;

/** True when `value` is below `limit` by more than the geometric tolerance. */
export function below(value: number, limit: number, eps = DRC_EPS_MM): boolean {
  return value < limit - eps;
}

/** True when `value` exceeds `limit` by more than the geometric tolerance. */
export function exceeds(
  value: number,
  limit: number,
  eps = DRC_EPS_MM,
): boolean {
  return value > limit + eps;
}
