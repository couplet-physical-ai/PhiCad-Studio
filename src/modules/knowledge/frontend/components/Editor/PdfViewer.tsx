import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ZoomIn, ZoomOut, Download, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@shared/frontend/ui/button";

// pdf.js runs its parser in a worker; the URL is resolved + bundled by Vite so
// no external network is hit (Electron/CSP-safe).
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.2;

interface RenderHandle {
  promise: Promise<void>;
  cancel: () => void;
}

function PdfPageCanvas({
  doc,
  pageNumber,
  scale,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderHandle | null = null;

    void (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale });
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      renderTask = page.render({
        canvas,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      }) as unknown as RenderHandle;

      try {
        await renderTask.promise;
      } catch {
        // Render was cancelled (scale change / unmount) — ignore.
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [doc, pageNumber, scale]);

  return (
    <canvas
      ref={canvasRef}
      className="mx-auto mb-4 block rounded-card bg-white shadow-sm"
    />
  );
}

export function PdfViewer({
  pdfUrl,
  fileName,
}: {
  pdfUrl: string;
  fileName?: string;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;
    setLoading(true);
    setError(null);
    setDoc(null);
    setNumPages(0);

    void (async () => {
      try {
        const res = await fetch(pdfUrl);
        if (!res.ok) throw new Error(`Failed to load PDF (HTTP ${res.status})`);
        const buffer = await res.arrayBuffer();
        if (cancelled) return;
        loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
        const loadedDoc = await loadingTask.promise;
        if (cancelled) return;
        setDoc(loadedDoc);
        setNumPages(loadedDoc.numPages);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load PDF");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      // Destroying the loading task tears down the document + worker transport.
      void loadingTask?.destroy();
    };
  }, [pdfUrl]);

  const zoomOut = () =>
    setScale((s) => Math.max(MIN_SCALE, Math.round((s - SCALE_STEP) * 10) / 10));
  const zoomIn = () =>
    setScale((s) => Math.min(MAX_SCALE, Math.round((s + SCALE_STEP) * 10) / 10));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-1.5 dark:border-slate-800">
        <Button
          variant="ghost"
          size="sm"
          title="Zoom out"
          aria-label="Zoom out"
          icon={<ZoomOut className="h-4 w-4" />}
          onClick={zoomOut}
          disabled={scale <= MIN_SCALE}
        />
        <span className="w-12 text-center text-xs tabular-nums text-text-secondary">
          {Math.round(scale * 100)}%
        </span>
        <Button
          variant="ghost"
          size="sm"
          title="Zoom in"
          aria-label="Zoom in"
          icon={<ZoomIn className="h-4 w-4" />}
          onClick={zoomIn}
          disabled={scale >= MAX_SCALE}
        />
        <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
        <span className="text-xs text-text-tertiary">
          {numPages > 0 ? `${numPages} ${numPages === 1 ? "page" : "pages"}` : ""}
        </span>
        <div className="ml-auto">
          <a
            href={pdfUrl}
            download={fileName || "document.pdf"}
            className="inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-xs text-text-secondary hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 py-4 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-text-tertiary">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading PDF…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-status-danger">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        ) : doc ? (
          Array.from({ length: numPages }, (_, i) => (
            <PdfPageCanvas key={i} doc={doc} pageNumber={i + 1} scale={scale} />
          ))
        ) : null}
      </div>
    </div>
  );
}
