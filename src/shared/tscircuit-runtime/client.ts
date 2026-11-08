import {
  TSCIRCUIT_LIMITS,
  TSCIRCUIT_PROTOCOL_VERSION,
  TscircuitRuntimeError,
  type CircuitJsonPreviewReport,
  type TscircuitCapabilities,
  type TscircuitRequest,
  type TscircuitResponse,
} from "./protocol";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
  removeAbortListener: () => void;
};

function requestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `tscircuit-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export class TscircuitRuntimeClient {
  private worker: Worker | null = null;
  private readonly pending = new Map<string, PendingRequest>();

  /** Laziness boundary: no worker or tscircuit chunk exists before first use. */
  private getWorker(): Worker {
    if (this.worker) return this.worker;
    const next = new Worker(new URL("./engine.worker.ts", import.meta.url), {
      type: "module",
      name: "circuit-engine",
    });
    next.onmessage = (event: MessageEvent<TscircuitResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      clearTimeout(pending.timeout);
      pending.removeAbortListener();
      if (response.protocolVersion !== TSCIRCUIT_PROTOCOL_VERSION) {
        pending.reject(
          new TscircuitRuntimeError(
            "invalid-protocol",
            `Engine replied with protocol ${response.protocolVersion}.`,
          ),
        );
      } else if (!response.ok) {
        pending.reject(
          new TscircuitRuntimeError(
            response.error.code,
            response.error.message,
          ),
        );
      } else {
        pending.resolve(response.result);
      }
    };
    next.onerror = () => {
      this.failAll(
        new TscircuitRuntimeError(
          "runtime-error",
          "Circuit Engine worker failed.",
        ),
      );
    };
    this.worker = next;
    return next;
  }

  private failAll(error: Error): void {
    this.worker?.terminate();
    this.worker = null;
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.removeAbortListener();
      request.reject(error);
    }
    this.pending.clear();
  }

  private send<TResult>(
    request: TscircuitRequest,
    signal?: AbortSignal,
  ): Promise<TResult> {
    if (signal?.aborted) {
      return Promise.reject(
        new TscircuitRuntimeError("cancelled", "Preview request cancelled."),
      );
    }
    const worker = this.getWorker();
    return new Promise<TResult>((resolve, reject) => {
      const abort = () => {
        const pending = this.pending.get(request.id);
        if (!pending) return;
        this.pending.delete(request.id);
        clearTimeout(pending.timeout);
        signal?.removeEventListener("abort", abort);
        worker.postMessage({
          protocolVersion: TSCIRCUIT_PROTOCOL_VERSION,
          id: requestId(),
          method: "cancel",
          targetRequestId: request.id,
        } satisfies TscircuitRequest);
        reject(
          new TscircuitRuntimeError("cancelled", "Preview request cancelled."),
        );
      };
      signal?.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(() => {
        this.failAll(
          new TscircuitRuntimeError(
            "limit-exceeded",
            `Engine request exceeded ${TSCIRCUIT_LIMITS.requestTimeoutMs} ms and the worker was terminated.`,
          ),
        );
      }, TSCIRCUIT_LIMITS.requestTimeoutMs);
      this.pending.set(request.id, {
        resolve: (value) => resolve(value as TResult),
        reject,
        timeout,
        removeAbortListener: () => signal?.removeEventListener("abort", abort),
      });
      worker.postMessage(request);
    });
  }

  capabilities(signal?: AbortSignal): Promise<TscircuitCapabilities> {
    return this.send<TscircuitCapabilities>(
      {
        protocolVersion: TSCIRCUIT_PROTOCOL_VERSION,
        id: requestId(),
        method: "capabilities",
      },
      signal,
    );
  }

  validateCircuitJsonPreview(
    circuitJson: string,
    signal?: AbortSignal,
  ): Promise<CircuitJsonPreviewReport> {
    return this.send<CircuitJsonPreviewReport>(
      {
        protocolVersion: TSCIRCUIT_PROTOCOL_VERSION,
        id: requestId(),
        method: "validate-circuit-json-preview",
        payload: { circuitJson },
      },
      signal,
    );
  }

  dispose(): void {
    this.failAll(
      new TscircuitRuntimeError(
        "cancelled",
        "Circuit Engine worker disposed.",
      ),
    );
  }
}

let sharedClient: TscircuitRuntimeClient | null = null;

export function getTscircuitRuntimeClient(): TscircuitRuntimeClient {
  sharedClient ??= new TscircuitRuntimeClient();
  return sharedClient;
}
