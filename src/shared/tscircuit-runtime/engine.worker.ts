/// <reference lib="webworker" />

import {
  TSCIRCUIT_LIMITS,
  TSCIRCUIT_PROTOCOL_VERSION,
  TSCIRCUIT_RUNTIME_VERSIONS,
  TscircuitRuntimeError,
  type TscircuitCapabilities,
  type TscircuitRequest,
  type TscircuitResponse,
} from "./protocol";
import { validateCircuitJsonPreview } from "./preview";

const worker = self as DedicatedWorkerGlobalScope;
const cancelledRequests = new Set<string>();

// The V1 engine is intentionally offline. This worker has no filesystem or
// Electron/Node bridge, receives no environment, and fails closed if a future
// dependency attempts to fetch a registry, CDN, model, or arbitrary URL.
Object.defineProperty(worker, "fetch", {
  configurable: false,
  writable: false,
  value: () =>
    Promise.reject(
      new TscircuitRuntimeError(
        "runtime-error",
        "Network access is disabled inside Circuit Engine.",
      ),
    ),
});

const CAPABILITIES: TscircuitCapabilities = {
  product: "PhiCad-Studio",
  engine: "Circuit Engine",
  protocolVersion: TSCIRCUIT_PROTOCOL_VERSION,
  runtimeVersions: TSCIRCUIT_RUNTIME_VERSIONS,
  authorityMode: "native",
  circuitJsonPreview: true,
  codeEvaluation: "unavailable-v1",
  codeLinkedPersistence: "unavailable-v1",
  nativeMaterialization: "unavailable-v1",
  network: "blocked",
  filesystem: "none",
  environmentSecrets: "not-exposed",
  limits: TSCIRCUIT_LIMITS,
};

function respond(response: TscircuitResponse): void {
  worker.postMessage(response);
}

function errorResponse(
  id: string,
  error: unknown,
): Extract<TscircuitResponse, { ok: false }> {
  if (error instanceof TscircuitRuntimeError) {
    return {
      protocolVersion: TSCIRCUIT_PROTOCOL_VERSION,
      id,
      ok: false,
      error: { code: error.code, message: error.message },
    };
  }
  return {
    protocolVersion: TSCIRCUIT_PROTOCOL_VERSION,
    id,
    ok: false,
    error: {
      code: "runtime-error",
      message: error instanceof Error ? error.message : "Unknown engine error.",
    },
  };
}

function isRequest(value: unknown): value is TscircuitRequest {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.method === "string";
}

worker.onmessage = (event: MessageEvent<unknown>) => {
  const request = event.data;
  if (!isRequest(request)) return;

  if (request.protocolVersion !== TSCIRCUIT_PROTOCOL_VERSION) {
    respond({
      protocolVersion: TSCIRCUIT_PROTOCOL_VERSION,
      id: request.id,
      ok: false,
      error: {
        code: "invalid-protocol",
        message: `Unsupported protocol version; expected ${TSCIRCUIT_PROTOCOL_VERSION}.`,
      },
    });
    return;
  }

  if (request.method === "cancel") {
    cancelledRequests.add(request.targetRequestId);
    respond({
      protocolVersion: TSCIRCUIT_PROTOCOL_VERSION,
      id: request.id,
      ok: true,
      result: { cancelledRequestId: request.targetRequestId },
    });
    return;
  }

  void (async () => {
    try {
      if (request.method === "capabilities") {
        respond({
          protocolVersion: TSCIRCUIT_PROTOCOL_VERSION,
          id: request.id,
          ok: true,
          result: CAPABILITIES,
        });
        return;
      }
      if (request.method === "validate-circuit-json-preview") {
        const result = await validateCircuitJsonPreview(
          request.payload.circuitJson,
          { isCancelled: () => cancelledRequests.has(request.id) },
        );
        respond({
          protocolVersion: TSCIRCUIT_PROTOCOL_VERSION,
          id: request.id,
          ok: true,
          result,
        });
        return;
      }
      respond({
        protocolVersion: TSCIRCUIT_PROTOCOL_VERSION,
        id: request.id,
        ok: false,
        error: { code: "invalid-request", message: "Unknown engine method." },
      });
    } catch (error) {
      respond(errorResponse(request.id, error));
    } finally {
      cancelledRequests.delete(request.id);
    }
  })();
};
