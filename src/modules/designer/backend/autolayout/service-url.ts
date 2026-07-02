// Single source of truth for the cloud auto-layout service base URL.
//
// cloud-auto-router + cloud-auto-place were merged into ONE service
// (cloud-auto-layout) that serves BOTH /v1/route and /v1/place on one base URL
// (:3002). The autoroute + autoplace backend clients both resolve through here.
//
// AUTO_LAYOUT_URL is the canonical env var. The legacy AUTO_ROUTER_URL /
// AUTO_PLACE_URL are still honoured as fallbacks so existing deployments keep
// working — both now point at the same merged service.

export function autoLayoutBaseUrl(): string {
  const url =
    process.env.AUTO_LAYOUT_URL ??
    process.env.AUTO_ROUTER_URL ??
    process.env.AUTO_PLACE_URL ??
    "http://localhost:3002";
  return url.replace(/\/+$/, "");
}
