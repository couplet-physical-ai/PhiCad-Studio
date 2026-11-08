import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  FileJson,
  LoaderCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  getTscircuitRuntimeClient,
  TscircuitRuntimeError,
  type CircuitJsonPreviewReport,
  type TscircuitCapabilities,
} from "@shared/tscircuit-runtime";

const STARTER_CIRCUIT_JSON = `[
  {
    "type": "source_project_metadata",
    "name": "Preview only"
  },
  {
    "type": "pcb_component",
    "pcb_component_id": "preview_component_1",
    "source_component_id": "source_component_1",
    "center": { "x": 0, "y": 0 },
    "width": 10,
    "height": 5,
    "rotation": 0,
    "layer": "top",
    "obstructs_within_bounds": true
  }
]`;

interface CircuitJsonPreviewPanelProps {
  onClose: () => void;
}

type PreviewInputOrigin = "manual" | "local-file";

function formatNm(value: number): string {
  return `${value.toLocaleString()} nm`;
}

export function CircuitJsonPreviewPanel({
  onClose,
}: CircuitJsonPreviewPanelProps) {
  const [capabilities, setCapabilities] =
    useState<TscircuitCapabilities | null>(null);
  const [text, setText] = useState(STARTER_CIRCUIT_JSON);
  const [inputOrigin, setInputOrigin] = useState<PreviewInputOrigin>("manual");
  const [report, setReport] = useState<CircuitJsonPreviewReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getTscircuitRuntimeClient()
      .capabilities(controller.signal)
      .then(setCapabilities)
      .catch((reason: unknown) => {
        if (
          reason instanceof TscircuitRuntimeError &&
          reason.code === "cancelled"
        ) {
          return;
        }
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => controller.abort();
  }, []);

  const runPreview = useCallback(async (value: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setReport(null);
    setError(null);
    try {
      const next = await getTscircuitRuntimeClient().validateCircuitJsonPreview(
        value,
        controller.signal,
      );
      setReport(next);
    } catch (reason) {
      if (
        reason instanceof TscircuitRuntimeError &&
        reason.code === "cancelled"
      ) {
        setError("Preview cancelled. No design data was changed.");
      } else {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setRunning(false);
    }
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-panel text-text">
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-text-strong">
            <Braces className="h-3.5 w-3.5" /> Circuit JSON build preview
          </div>
          <p className="mt-1 text-[10px] leading-4 text-text-tertiary">
            Read-only interchange validation. Nothing is written to the native
            design or manufacturing export.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close build preview"
          className="cursor-pointer p-1 text-text-tertiary hover:text-text-strong"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div className="rounded-control border border-status-info/30 bg-status-info-soft p-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-strong">
            <ShieldCheck className="h-3.5 w-3.5 text-status-info" /> Native is
            authoritative
          </div>
          <p className="mt-1 text-[10px] leading-4 text-text-secondary">
            Code-linked persistence and native materialization are unavailable
            in V1. OpenPCB ECS/history owns edits, undo, and fabrication output.
          </p>
        </div>

        {capabilities ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-border-subtle pb-3 text-[10px]">
            <dt className="text-text-tertiary">Circuit JSON</dt>
            <dd className="text-right text-text-secondary">
              {capabilities.runtimeVersions.circuitJson}
            </dd>
            <dt className="text-text-tertiary">Protocol</dt>
            <dd className="text-right font-mono text-text-secondary">
              {capabilities.protocolVersion}
            </dd>
            <dt className="text-text-tertiary">Network / secrets</dt>
            <dd className="text-right text-text-secondary">
              blocked / not exposed
            </dd>
            <dt className="text-text-tertiary">Code evaluation</dt>
            <dd className="text-right text-status-warning">
              unavailable in V1
            </dd>
          </dl>
        ) : null}

        <label className="block">
          <span className="mb-1 flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-wide text-text-caps">
            <span>Circuit JSON</span>
            <span className="font-mono text-[9px] normal-case tracking-normal text-text-tertiary">
              origin: {inputOrigin}
            </span>
          </span>
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setInputOrigin("manual");
              setReport(null);
              setError(null);
            }}
            spellCheck={false}
            aria-label="Circuit JSON to validate"
            className="h-52 w-full resize-y rounded-control border border-border-control bg-surface-input p-2 font-mono text-[10px] leading-4 text-text outline-none focus:border-selection"
          />
        </label>

        <div className="flex items-center justify-between gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-border-control px-2 py-1.5 text-[10px] text-text-secondary hover:bg-surface-hover">
            <FileJson className="h-3.5 w-3.5" /> Open .json
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.size > 8 * 1024 * 1024) {
                  setError("Local file exceeds the 8 MiB preview limit.");
                  event.target.value = "";
                  return;
                }
                void file.text().then((value) => {
                  setText(value);
                  setInputOrigin("local-file");
                  setReport(null);
                  setError(null);
                });
                event.target.value = "";
              }}
            />
          </label>
          {running ? (
            <button
              type="button"
              onClick={() => controllerRef.current?.abort()}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-status-warning/40 px-2.5 py-1.5 text-[10px] text-status-warning"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void runPreview(text)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-control bg-primary px-2.5 py-1.5 text-[10px] text-primary-foreground hover:opacity-90"
            >
              <Braces className="h-3 w-3" /> Validate preview
            </button>
          )}
        </div>

        {running ? (
          <div className="flex items-center gap-2 border-t border-border-subtle pt-3 text-[11px] text-text-tertiary">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Validating in
            isolated worker…
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="rounded-control border border-status-danger/30 bg-status-danger-soft p-2 text-[10px] leading-4 text-status-danger"
          >
            {error}
          </div>
        ) : null}

        {report ? (
          <div className="space-y-3 border-t border-border pt-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              {report.valid ? (
                <CheckCircle2 className="h-4 w-4 text-status-success" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-status-danger" />
              )}
              {report.valid ? "Structurally valid" : "Validation failed"}
            </div>

            {report.valid ? (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                <dt className="text-text-tertiary">Elements</dt>
                <dd className="text-right tabular-nums">
                  {report.elementCount}
                </dd>
                <dt className="text-text-tertiary">mm→nm values checked</dt>
                <dd className="text-right tabular-nums">
                  {report.convertedMmValueCount}
                </dd>
                {report.boundsNm ? (
                  <>
                    <dt className="text-text-tertiary">Preview bounds</dt>
                    <dd className="text-right font-mono text-[9px]">
                      {formatNm(report.boundsNm.minX)},{" "}
                      {formatNm(report.boundsNm.minY)}
                      <br />
                      {formatNm(report.boundsNm.maxX)},{" "}
                      {formatNm(report.boundsNm.maxY)}
                    </dd>
                  </>
                ) : null}
              </dl>
            ) : null}

            {report.errors.length > 0 ? (
              <ul className="space-y-1 text-[10px] leading-4 text-status-danger">
                {report.errors.map((message) => (
                  <li key={message}>• {message}</li>
                ))}
              </ul>
            ) : null}

            {report.unsupportedGeometry.length > 0 ? (
              <div>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-status-warning">
                  Unsupported for native materialization
                </div>
                <ul className="space-y-1.5">
                  {report.unsupportedGeometry.map((issue) => (
                    <li
                      key={`${issue.category}:${issue.elementType}`}
                      className="rounded-control border border-status-warning/25 bg-status-warning-soft p-2 text-[10px] leading-4"
                    >
                      <div className="font-mono text-text-strong">
                        {issue.elementType} × {issue.count}
                      </div>
                      <div className="text-text-secondary">{issue.message}</div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-control border border-border-subtle p-2 text-[10px] leading-4 text-text-tertiary">
              <strong className="text-text-secondary">Not applied:</strong>{" "}
              {report.nativeMaterialization.reason} Input origin was{" "}
              <span className="font-mono">{inputOrigin}</span>; tscircuit and
              Studio diagnostics remain separate.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
