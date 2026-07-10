/**
 * Deterministic EE unit math for block param calc.
 *
 * Param calc lives HERE (and in the block generators), never in the LLM — the
 * model picks a block + high-level intent; the expander does the reproducible
 * float arithmetic (plan: "param calc lives in the deterministic expander").
 */

import type { IrParamValue } from "./ir";

const SI_PREFIX: Record<string, number> = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  µ: 1e-6,
  μ: 1e-6,
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
};

/**
 * Parse an SI-suffixed magnitude ("330", "4.7k", "10µF", "3.3V", "10mA") to a
 * plain number in base units. Unit letters (F/V/A/Ω/ohm) are stripped; only the
 * SI multiplier prefix is honoured. Returns null when unparseable.
 */
export function parseSiValue(raw: IrParamValue | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const m = /^\s*([+-]?\d+(?:\.\d+)?)\s*([pnuµμmkKMG]?)\s*(?:F|V|A|Ω|ohm|R|Hz)?\s*$/i.exec(raw);
  if (!m) return null;
  const mant = Number.parseFloat(m[1]!);
  if (!Number.isFinite(mant)) return null;
  const mult = m[2] ? (SI_PREFIX[m[2]] ?? 1) : 1;
  return mant * mult;
}

/** Read a numeric param with a fallback default. */
export function numParam(
  params: Record<string, IrParamValue> | undefined,
  key: string,
  fallback: number,
): number {
  const v = parseSiValue(params?.[key]);
  return v === null ? fallback : v;
}

const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];

/**
 * Smallest E12 preferred value ≥ `value`. Ceil (not nearest) because for a
 * current-limiting resistor a higher R keeps current ≤ target — the safe round.
 */
export function ceilE12(value: number): number {
  if (!(value > 0)) return E12[0]!;
  const decade = Math.floor(Math.log10(value));
  const base = 10 ** decade;
  for (const step of E12) {
    const candidate = step * base;
    if (candidate >= value - 1e-9) return roundSig(candidate);
  }
  return roundSig(E12[0]! * base * 10);
}

/** Round to 3 significant figures to avoid float dust (330.00000004 → 330). */
function roundSig(v: number): number {
  if (v === 0) return 0;
  const digits = Math.ceil(Math.log10(Math.abs(v)));
  const factor = 10 ** (3 - digits);
  return Math.round(v * factor) / factor;
}

/** Format an ohm value with an SI prefix: 330 → "330Ω", 4700 → "4.7kΩ". */
export function formatOhms(value: number): string {
  if (value >= 1e6) return `${trim(value / 1e6)}MΩ`;
  if (value >= 1e3) return `${trim(value / 1e3)}kΩ`;
  return `${trim(value)}Ω`;
}

function trim(v: number): string {
  return Number.parseFloat(v.toFixed(2)).toString();
}
