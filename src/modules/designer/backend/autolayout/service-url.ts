// Single source of truth for the cloud auto-layout service base URL.
//
// cloud-auto-router + cloud-auto-place were merged into ONE service
// (cloud-auto-layout) that serves BOTH /v1/route and /v1/place on one base URL
// (:3002). The autoroute + autoplace backend clients both resolve through here.
//
// AUTO_LAYOUT_URL is the canonical env var. The legacy AUTO_ROUTER_URL /
// AUTO_PLACE_URL are still honoured as fallbacks so existing deployments keep
// working — both now point at the same merged service.
//
// Resolution order: explicit env → packaged default (the public ingress) → dev
// default (localhost devstack). A PACKAGED build must never fall through to
// localhost: the service does not run on the user's machine, so the feature would
// simply be dead. Electron main stamps NODE_ENV=production for packaged builds
// (electron/src/main/backend-server.ts), which is what selects the public default.

export const PRODUCTION_AUTO_LAYOUT_URL = "https://autolayout.cloud.openpcb.app";
export const DEV_AUTO_LAYOUT_URL = "http://localhost:3002";

export function autoLayoutBaseUrl(): string {
  const url =
    process.env.AUTO_LAYOUT_URL ??
    process.env.AUTO_ROUTER_URL ??
    process.env.AUTO_PLACE_URL ??
    (process.env.NODE_ENV === "production"
      ? PRODUCTION_AUTO_LAYOUT_URL
      : DEV_AUTO_LAYOUT_URL);
  return url.replace(/\/+$/, "");
}
