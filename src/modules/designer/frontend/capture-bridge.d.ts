// Dev-only marketing-capture bridge (M0.2). Present on `window` ONLY when the
// app is launched with OPENPCB_CAPTURE=1 (surfaced by the electron preload as
// `electronAPI.captureMode`). Every producer merges into the SINGLE
// `window.__openpcbCapture` namespace and deletes only its own keys on unmount.
import type { DesignerCommand, DesignerDispatchResult } from "../../../sdks";

export interface OpenpcbCapturePose {
  thetaDeg: number;
  phiDeg: number;
  radius: number;
  target: [number, number, number];
}

export interface OpenpcbCaptureThreeApi {
  /** Current orbit pose derived from camera position minus the controls target. */
  getPose(): OpenpcbCapturePose;
  /** Move the orbit camera. Resolves TRUE only if a frame actually rendered (see renderFrame). */
  setOrbit(thetaDeg: number, phiDeg: number, radius: number): Promise<boolean>;
  /** Re-aim the orbit at a scene-space point (boards import off-origin). */
  setTarget(x: number, y: number, z: number): Promise<boolean>;
  /**
   * Invalidate the demand loop. Resolves TRUE when a frame really rendered, FALSE if the
   * safety timeout fired or the bridge unmounted. Callers that screenshot MUST check it —
   * capturing after a FALSE yields a stale buffer, i.e. a duplicated frame.
   */
  renderFrame(): Promise<boolean>;
}

export interface OpenpcbCapturePcbApi {
  /** World-nm anchor → canvas CSS-px (mirrorX for the bottom view). */
  project(
    anchorNm: { x: number; y: number },
    mirrorX?: boolean,
  ): { x: number; y: number; onScreen: boolean };
  /** Live canvas content-box rect in CSS px. */
  rect(): { width: number; height: number };
}

export interface OpenpcbCaptureApi {
  three?: OpenpcbCaptureThreeApi;
  pcb?: OpenpcbCapturePcbApi;
  /**
   * Same projection contract as `pcb`, for the schematic canvas. Read-only: it lets a capture aim a
   * REAL click at a real pin (place a part, draw a wire), which is the only honest way to script the
   * schematic — the canvas is WebGL, so a pin has no DOM node to target.
   */
  schematic?: OpenpcbCapturePcbApi;
  dispatch?: (command: DesignerCommand) => Promise<DesignerDispatchResult>;
  selectedDesignId?: string | null;
}

declare global {
  interface Window {
    __openpcbCapture?: OpenpcbCaptureApi;
  }
}
