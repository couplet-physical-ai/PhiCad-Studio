import { afterEach, describe, expect, test } from "bun:test";

import {
  DEV_AUTO_LAYOUT_URL,
  PRODUCTION_AUTO_LAYOUT_URL,
  autoLayoutBaseUrl,
} from "../../../modules/designer/backend/autolayout/service-url";

const ENV_KEYS = [
  "AUTO_LAYOUT_URL",
  "AUTO_ROUTER_URL",
  "AUTO_PLACE_URL",
  "NODE_ENV",
] as const;

const saved = new Map<string, string | undefined>(
  ENV_KEYS.map((k) => [k, process.env[k]]),
);

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function clearEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe("autoLayoutBaseUrl", () => {
  test("prefers AUTO_LAYOUT_URL over everything else", () => {
    clearEnv();
    process.env.NODE_ENV = "production";
    process.env.AUTO_ROUTER_URL = "http://legacy:3002";
    process.env.AUTO_LAYOUT_URL = "https://staging.example/";
    expect(autoLayoutBaseUrl()).toBe("https://staging.example");
  });

  test("honours the legacy pre-merge env vars", () => {
    clearEnv();
    process.env.AUTO_ROUTER_URL = "http://router:3002";
    expect(autoLayoutBaseUrl()).toBe("http://router:3002");

    delete process.env.AUTO_ROUTER_URL;
    process.env.AUTO_PLACE_URL = "http://placer:3002";
    expect(autoLayoutBaseUrl()).toBe("http://placer:3002");
  });

  test("a packaged build defaults to the public ingress, never localhost", () => {
    // Regression guard: the packaged desktop has no local service, so falling back
    // to localhost silently kills Auto Layout + Route Board in production builds.
    clearEnv();
    process.env.NODE_ENV = "production";
    expect(autoLayoutBaseUrl()).toBe(PRODUCTION_AUTO_LAYOUT_URL);
    expect(autoLayoutBaseUrl().startsWith("https://")).toBe(true);
  });

  test("dev defaults to the local devstack", () => {
    clearEnv();
    process.env.NODE_ENV = "development";
    expect(autoLayoutBaseUrl()).toBe(DEV_AUTO_LAYOUT_URL);

    delete process.env.NODE_ENV;
    expect(autoLayoutBaseUrl()).toBe(DEV_AUTO_LAYOUT_URL);
  });

  test("strips trailing slashes so path joins never double up", () => {
    clearEnv();
    process.env.AUTO_LAYOUT_URL = "https://autolayout.example///";
    expect(autoLayoutBaseUrl()).toBe("https://autolayout.example");
  });
});
