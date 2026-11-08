export const TSCIRCUIT_PROTOCOL_VERSION = "1.0.0" as const;

export const TSCIRCUIT_RUNTIME_VERSIONS = {
  circuitJson: "0.0.489",
  zod: "3.25.76",
} as const;

export const TSCIRCUIT_LIMITS = {
  maxPayloadBytes: 5_000_000,
  maxElements: 25_000,
  maxVisitedNodes: 250_000,
  maxDepth: 24,
  maxCoordinateAbsMm: 1_000_000,
  requestTimeoutMs: 8_000,
} as const;

export type TscircuitAuthorityMode = "native" | "code-linked-preview";

export interface TscircuitCapabilities {
  product: "PhiCad-Studio";
  engine: "Circuit Engine";
  protocolVersion: typeof TSCIRCUIT_PROTOCOL_VERSION;
  runtimeVersions: typeof TSCIRCUIT_RUNTIME_VERSIONS;
  authorityMode: "native";
  circuitJsonPreview: true;
  codeEvaluation: "unavailable-v1";
  codeLinkedPersistence: "unavailable-v1";
  nativeMaterialization: "unavailable-v1";
  network: "blocked";
  filesystem: "none";
  environmentSecrets: "not-exposed";
  limits: typeof TSCIRCUIT_LIMITS;
}

export type GeometryCategory =
  | "copper"
  | "copper-pour"
  | "keepout"
  | "slot"
  | "cutout"
  | "courtyard"
  | "layer-stack"
  | "connectivity"
  | "unknown-element";

export interface UnsupportedGeometryIssue {
  category: GeometryCategory;
  elementType: string;
  count: number;
  severity: "blocks-materialization";
  message: string;
}

export interface PreviewBoundsNm {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface TscircuitCancelAck {
  cancelledRequestId: string;
}

export interface CircuitJsonPreviewReport {
  valid: boolean;
  source: "circuit-json";
  authorityMode: "native";
  elementCount: number;
  elementTypes: Record<string, number>;
  convertedMmValueCount: number;
  boundsNm: PreviewBoundsNm | null;
  unsupportedGeometry: UnsupportedGeometryIssue[];
  errors: string[];
  warnings: string[];
  nativeMaterialization: {
    canApply: false;
    reason: string;
  };
}

export type TscircuitRequest =
  | {
      protocolVersion: typeof TSCIRCUIT_PROTOCOL_VERSION;
      id: string;
      method: "capabilities";
    }
  | {
      protocolVersion: typeof TSCIRCUIT_PROTOCOL_VERSION;
      id: string;
      method: "validate-circuit-json-preview";
      payload: { circuitJson: string };
    }
  | {
      protocolVersion: typeof TSCIRCUIT_PROTOCOL_VERSION;
      id: string;
      method: "cancel";
      targetRequestId: string;
    };

export type TscircuitResponse =
  | {
      protocolVersion: typeof TSCIRCUIT_PROTOCOL_VERSION;
      id: string;
      ok: true;
      result:
        | TscircuitCapabilities
        | CircuitJsonPreviewReport
        | TscircuitCancelAck;
    }
  | {
      protocolVersion: typeof TSCIRCUIT_PROTOCOL_VERSION;
      id: string;
      ok: false;
      error: {
        code:
          | "invalid-protocol"
          | "invalid-request"
          | "limit-exceeded"
          | "cancelled"
          | "runtime-error";
        message: string;
      };
    };

export class TscircuitRuntimeError extends Error {
  constructor(
    public readonly code: Extract<
      TscircuitResponse,
      { ok: false }
    >["error"]["code"],
    message: string,
  ) {
    super(message);
    this.name = "TscircuitRuntimeError";
  }
}
