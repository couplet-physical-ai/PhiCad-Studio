import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { checkReleasedPublicKey } from "../../../../scripts/lib/corelib-trust";

const KEYS_DIR = path.resolve(import.meta.dir, "../../../../resources/keys");
const PRODUCTION_PUB = readFileSync(
  path.join(KEYS_DIR, "openpcb-core-2026.pub"),
  "utf8",
);
// Stand-in for the retired placeholder key that CoreLibrary's unsigned v0.1.0-beta.*
// releases still ship as openpcb-core.pub (not a real key; never trusted).
const PLACEHOLDER_PUB = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAU2U1VEZBQTNwbGFjZWhvbGRlcktleUZvclRlc3RzMTI=
-----END PUBLIC KEY-----
`;
const trustedKeys = new Map([["openpcb-core-2026", PRODUCTION_PUB]]);

describe("CoreLibrary released-key check", () => {
  test("signed release with a trusted released key passes", () => {
    expect(
      checkReleasedPublicKey({
        tag: "v1.0.0",
        signed: true,
        releasedPubText: PRODUCTION_PUB.replace(/\n/g, "\r\n"),
        trustedKeys,
      }),
    ).toBeNull();
  });

  test("signed release with an untrusted released key is refused", () => {
    expect(() =>
      checkReleasedPublicKey({
        tag: "v1.0.0",
        signed: true,
        releasedPubText: PLACEHOLDER_PUB,
        trustedKeys,
      }),
    ).toThrow(/v1\.0\.0.*does not match any trusted key.*refusing to trust/);
  });

  test("signed release is refused when no keys are trusted at all", () => {
    expect(() =>
      checkReleasedPublicKey({
        tag: "v1.0.0",
        signed: true,
        releasedPubText: PRODUCTION_PUB,
        trustedKeys: new Map(),
      }),
    ).toThrow(/refusing to trust/);
  });

  test("unsigned release with an untrusted released key warns, naming the tag", () => {
    const warning = checkReleasedPublicKey({
      tag: "v0.1.0-beta.1",
      signed: false,
      releasedPubText: PLACEHOLDER_PUB,
      trustedKeys,
    });
    expect(warning).toContain(
      "unsigned CoreLibrary release v0.1.0-beta.1; released-pub check skipped",
    );
  });

  test("no released key: nothing to compare", () => {
    for (const signed of [true, false]) {
      expect(
        checkReleasedPublicKey({
          tag: "v1.0.0",
          signed,
          releasedPubText: null,
          trustedKeys,
        }),
      ).toBeNull();
    }
  });

  test("the trust store holds only the production key (no placeholder)", () => {
    const committed = readFileSync(
      path.join(KEYS_DIR, "openpcb-core-2026.pub"),
      "utf8",
    );
    expect(committed).toContain("BEGIN PUBLIC KEY");
    expect(readdirSync(KEYS_DIR).filter((f) => f.endsWith(".pub"))).toEqual([
      "openpcb-core-2026.pub",
    ]);
  });
});
