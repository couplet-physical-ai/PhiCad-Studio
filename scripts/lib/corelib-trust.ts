/**
 * CoreLibrary release trust: the released-public-key check used by
 * scripts/fetch-core-library.ts (kept pure so it is unit-tested in
 * src/core/backend/tests/corelib-release-trust.test.ts).
 *
 * Trust in a `.opclib` comes ONLY from verifying its manifest signature against
 * the committed keys in resources/keys/ — a key the release ships is never
 * trusted by itself. The released `openpcb-core.pub` is a consistency check:
 *
 * - Signed manifest: the released key MUST match a committed trusted key, or the
 *   release is refused (a signed release from a key we do not trust).
 * - Unsigned manifest: there is no signature for the released key to vouch for,
 *   so the comparison carries no security weight (an unsigned release could just
 *   as well omit the file). It is skipped with a WARNING naming the tag; the
 *   SHA256SUMS check still applies. This is the state of every CoreLibrary
 *   release so far: unsigned, still shipping the retired placeholder key, while
 *   resources/keys/ trusts only the production key (openpcb-core-2026).
 */

export interface ReleasedKeyCheckInput {
  /** CoreLibrary release tag (for messages). */
  tag: string;
  /** Whether the release's library.json carries a signature. */
  signed: boolean;
  /** Contents of the released openpcb-core.pub, or null if not published. */
  releasedPubText: string | null;
  /** Committed trusted keys (resources/keys/*.pub), keyed by key id. */
  trustedKeys: ReadonlyMap<string, Uint8Array | string>;
}

function normalizePem(pem: Uint8Array | string): string {
  const text =
    typeof pem === "string" ? pem : Buffer.from(pem).toString("utf8");
  // Windows checkouts can convert LF -> CRLF on the committed file.
  return text.replace(/\r\n/g, "\n").trim();
}

/**
 * Throws if a SIGNED release publishes a key that matches no committed trusted
 * key. Returns a warning string when the check is skipped for an UNSIGNED
 * release whose published key is not trusted; null otherwise.
 */
export function checkReleasedPublicKey(
  input: ReleasedKeyCheckInput,
): string | null {
  if (input.releasedPubText === null) return null;
  const released = normalizePem(input.releasedPubText);
  for (const committed of input.trustedKeys.values()) {
    if (normalizePem(committed) === released) return null;
  }
  if (input.signed) {
    throw new Error(
      `released openpcb-core.pub (${input.tag}) does not match any trusted key in resources/keys/ — refusing to trust`,
    );
  }
  return `WARNING: unsigned CoreLibrary release ${input.tag}; released-pub check skipped (its openpcb-core.pub matches no key in resources/keys/, and with no signature it vouches for nothing). Ask CoreLibrary to cut a release signed with the production key.`;
}
