/**
 * Minimal monotonic ULID (Crockford base32). Local util — the repo has no id
 * dependency beyond crypto.randomUUID, and session-log ids must sort by time.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

let lastTime = 0;
let lastRandom: number[] = [];

function encodeTime(time: number): string {
  let out = "";
  for (let i = 9; i >= 0; i--) {
    out = ALPHABET[time % 32] + out;
    time = Math.floor(time / 32);
  }
  return out;
}

function randomPart(): number[] {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // 16 base32 chars, 5 bits each
  return Array.from(bytes.slice(0, 16), (b) => b % 32);
}

/** Monotonic within the process: same-ms calls increment the random part. */
export function ulid(now: number = Date.now()): string {
  if (now === lastTime) {
    for (let i = lastRandom.length - 1; i >= 0; i--) {
      const digit = lastRandom[i] ?? 0;
      if (digit < 31) {
        lastRandom[i] = digit + 1;
        break;
      }
      lastRandom[i] = 0;
    }
  } else {
    lastTime = now;
    lastRandom = randomPart();
  }
  return encodeTime(now) + lastRandom.map((v) => ALPHABET[v]).join("");
}
