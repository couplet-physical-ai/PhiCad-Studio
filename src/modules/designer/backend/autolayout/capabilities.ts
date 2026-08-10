// Capability negotiation against the deployed cloud auto-layout service.
//
// The desktop and the service deploy independently, so what a given deployment supports is
// a runtime question, not a build-time one. `GET /v1/version` is unauthenticated by design
// (a signed-out desktop must still be able to decide whether to offer Auto Layout at all),
// and it publishes per-engine `features` booleans precisely so consumers never do
// `if (engineVersion >= "0.9.5")`.
//
// Every accessor here FAILS CLOSED: unknown capabilities read as unsupported. Offering a
// feature the deployment lacks produces a confusing mid-run 404; hiding one it has is a
// recoverable annoyance.

import {
  readCapabilities,
  type AutoLayoutServiceCapabilities,
  type CloudEdaEngine,
} from "../../../../sdks/designer/cloud-autolayout";
import { getAutoLayoutVersion } from "./client";

export type { AutoLayoutServiceCapabilities };

/**
 * Current service capabilities, or `null` when the service is unreachable / its response
 * is unusable. Shares the 60 s TTL cache behind `getAutoLayoutVersion()`.
 */
export async function getAutoLayoutCapabilities(): Promise<AutoLayoutServiceCapabilities | null> {
  return readCapabilities(await getAutoLayoutVersion());
}

/** Is `/v1/layout` (full Auto Layout) mounted on this deployment? */
export function supportsLayout(caps: AutoLayoutServiceCapabilities | null): boolean {
  return caps?.layout === true;
}

/** Is `/v1/route` (Route Board) mounted? */
export function supportsRoute(caps: AutoLayoutServiceCapabilities | null): boolean {
  return caps?.route === true;
}

/** Is `/v1/place` (standalone Auto Place) mounted? */
export function supportsPlace(caps: AutoLayoutServiceCapabilities | null): boolean {
  return caps?.place === true;
}

/**
 * Read one engine feature switch. Values are booleans or numeric ceilings
 * (`ripQuotaMax`), verbatim from the service. An unknown key is `undefined`, which every
 * caller must treat as unsupported.
 */
export function feature(
  caps: AutoLayoutServiceCapabilities | null,
  engine: CloudEdaEngine,
  key: string,
): unknown {
  return caps?.features?.[engine]?.[key];
}

/** Boolean feature switch, false when absent/unknown. */
export function hasFeature(
  caps: AutoLayoutServiceCapabilities | null,
  engine: CloudEdaEngine,
  key: string,
): boolean {
  return feature(caps, engine, key) === true;
}
