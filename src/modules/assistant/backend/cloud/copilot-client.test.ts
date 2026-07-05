import { describe, expect, test } from "bun:test";
import { SseParser, streamRun } from "./copilot-client";

describe("SseParser", () => {
  test("parses id/event/data frames and ignores ping comments", () => {
    const p = new SseParser();
    const events = p.feed(
      ': ping\n\nid: 3\nevent: run.started\ndata: {"type":"run.started"}\n\n',
    );
    expect(events).toEqual([
      { id: "3", event: "run.started", data: '{"type":"run.started"}' },
    ]);
  });

  test("reassembles events split across chunks (partial lines)", () => {
    const p = new SseParser();
    expect(p.feed("id: 7\nda")).toEqual([]);
    expect(p.feed('ta: {"seq":')).toEqual([]);
    const events = p.feed("7}\n\n");
    expect(events).toEqual([{ id: "7", event: null, data: '{"seq":7}' }]);
  });

  test("joins multi-line data and handles CRLF", () => {
    const p = new SseParser();
    const events = p.feed("data: a\r\ndata: b\r\n\r\n");
    expect(events).toEqual([{ id: null, event: null, data: "a\nb" }]);
  });

  test("id persists across events until overwritten (spec behavior)", () => {
    const p = new SseParser();
    const events = p.feed("id: 1\ndata: x\n\ndata: y\n\nid: 2\ndata: z\n\n");
    expect(events.map((e) => e.id)).toEqual(["1", "1", "2"]);
  });
});

describe("streamRun", () => {
  function sseResponse(body: string): Response {
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }

  test("consumes frames, tracks lastEventId, stops at terminal frame", async () => {
    const body =
      'id: 1\nevent: run.started\ndata: {"type":"run.started","runId":"r1","seq":1,"data":{}}\n\n' +
      'id: 2\nevent: run.message.delta\ndata: {"type":"run.message.delta","runId":"r1","seq":2,"data":{"delta":"hi"}}\n\n' +
      'id: 3\nevent: run.completed\ndata: {"type":"run.completed","runId":"r1","seq":3,"data":{}}\n\n';
    const originalFetch = globalThis.fetch;
    const requests: Array<Record<string, string>> = [];
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      requests.push(
        Object.fromEntries(
          Object.entries((init?.headers ?? {}) as Record<string, string>),
        ),
      );
      return sseResponse(body);
    }) as typeof fetch;

    try {
      const seen: string[] = [];
      const result = await streamRun(
        { copilotUrl: "http://copilot.test", bearer: "tok" },
        "r1",
        {
          lastEventId: "0",
          onFrame: (f) => {
            seen.push(f.type);
          },
        },
      );
      expect(seen).toEqual(["run.started", "run.message.delta", "run.completed"]);
      expect(result).toEqual({ lastEventId: "3", terminal: true });
      expect(requests[0]?.["last-event-id"]).toBe("0");
      expect(requests[0]?.authorization).toBe("Bearer tok");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("connection ending without terminal frame reports terminal: false", async () => {
    const body =
      'id: 5\nevent: run.message.delta\ndata: {"type":"run.message.delta","runId":"r1","seq":5,"data":{"delta":"…"}}\n\n';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => sseResponse(body)) as typeof fetch;
    try {
      const result = await streamRun(
        { copilotUrl: "http://copilot.test", bearer: "tok" },
        "r1",
        { onFrame: () => {} },
      );
      expect(result).toEqual({ lastEventId: "5", terminal: false });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
