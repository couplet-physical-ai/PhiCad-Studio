import { describe, expect, it } from "bun:test";
import {
  cloudProxyHeaders,
  resolveCloudWorkspace,
} from "../../../modules/assistant/backend/cloud/cloud-context";

async function withFetch<T>(
  impl: typeof fetch,
  fn: () => Promise<T>,
): Promise<T> {
  const orig = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = orig;
  }
}

const creds = { bearer: "tok", apiUrl: "http://api.test" };

describe("resolveCloudWorkspace", () => {
  it("returns the personal workspace id with the bearer", async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const ctx = await withFetch(
      (async (url: string | URL | Request, init?: RequestInit) => {
        seen.push({
          url: String(url),
          headers: (init?.headers ?? {}) as Record<string, string>,
        });
        return new Response(JSON.stringify({ id: "ws_9" }), { status: 200 });
      }) as unknown as typeof fetch,
      () => resolveCloudWorkspace(creds),
    );
    expect(ctx).toEqual({ bearer: "tok", workspaceId: "ws_9" });
    expect(seen[0]!.url).toBe("http://api.test/v1/workspaces/me/personal");
    expect(seen[0]!.headers.authorization).toBe("Bearer tok");
  });

  it("tolerates a trailing slash on the api url", async () => {
    const seen: string[] = [];
    await withFetch(
      (async (url: string | URL | Request) => {
        seen.push(String(url));
        return new Response(JSON.stringify({ id: "ws_9" }), { status: 200 });
      }) as unknown as typeof fetch,
      () => resolveCloudWorkspace({ bearer: "tok", apiUrl: "http://api.test/" }),
    );
    expect(seen[0]).toBe("http://api.test/v1/workspaces/me/personal");
  });

  // Each failure surfaces verbatim in the UI, so assert the wording is
  // actionable rather than a raw fetch/JSON error.
  it("rejects a missing api url with an actionable message", async () => {
    await expect(
      resolveCloudWorkspace({ bearer: "tok", apiUrl: "  " }),
    ).rejects.toThrow(/missing the cloud API URL/i);
  });

  it("wraps a transport failure", async () => {
    await withFetch(
      (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
      async () => {
        await expect(resolveCloudWorkspace(creds)).rejects.toThrow(
          /workspace resolution failed \(ECONNREFUSED\)/i,
        );
      },
    );
  });

  it("wraps a non-2xx with its status", async () => {
    await withFetch(
      (async () => new Response("nope", { status: 403 })) as unknown as typeof fetch,
      async () => {
        await expect(resolveCloudWorkspace(creds)).rejects.toThrow(/HTTP 403/);
      },
    );
  });

  it("rejects a 200 that carries no id", async () => {
    await withFetch(
      (async () =>
        new Response(JSON.stringify({}), { status: 200 })) as unknown as typeof fetch,
      async () => {
        await expect(resolveCloudWorkspace(creds)).rejects.toThrow(/no id/i);
      },
    );
  });
});

describe("cloudProxyHeaders", () => {
  it("always carries workspace attribution", () => {
    expect(cloudProxyHeaders("ws_1")).toEqual({
      "x-openpcb-workspace-id": "ws_1",
    });
  });

  it("adds run stitching only when a run id is given", () => {
    expect(cloudProxyHeaders("ws_1", "run_2")).toEqual({
      "x-openpcb-workspace-id": "ws_1",
      "x-openpcb-run-id": "run_2",
    });
  });
});
