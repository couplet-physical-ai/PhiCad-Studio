import { useCallback, useEffect, useRef } from "react";
import { addAfterEffect, useThree } from "@react-three/fiber";
import { Spherical, Vector3, type PerspectiveCamera } from "three";
import type {
  OpenpcbCapturePose,
  OpenpcbCaptureThreeApi,
} from "../capture-bridge";

/** Same minimal shape the sibling controls components read off `state.controls`. */
type OrbitLikeControls = {
  target: Vector3;
  update(): void;
} | null;

const DEG = Math.PI / 180;
/** Cap on how long renderFrame waits if a frame never renders (ms). */
const RENDER_TIMEOUT_MS = 500;

/**
 * Dev-only capture bridge (M0.2). Mounted inside the R3F <Canvas> ONLY when
 * `window.electronAPI?.captureMode` is set (OPENPCB_CAPTURE=1). Exposes a
 * deterministic orbit + render-sync API on `window.__openpcbCapture.three` so
 * the marketing capture harness can step the camera frame-by-frame. Renders
 * nothing and has zero effect on the normal app.
 */
export function CaptureBridge(): null {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as OrbitLikeControls;
  const invalidate = useThree((s) => s.invalidate);

  // Mirror the latest camera/controls into refs so the (stable) api methods
  // always read current values even though the api object is assigned once.
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  /** In-flight renderFrame cancellers, so unmount settles them instead of hanging the caller. */
  const pending = useRef(new Set<() => void>());

  /**
   * Resolves TRUE only when a frame actually rendered, FALSE if the safety timeout fired
   * (canvas inactive / nothing dirty / unmounted). The caller MUST check this: resolving
   * blindly on the timeout would let a frame-stepped capture screenshot a stale buffer and
   * emit a duplicated frame — the exact judder artefact this bridge exists to avoid.
   */
  const renderFrame = useCallback((): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      let unsubscribe: (() => void) | null = null;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const settle = (rendered: boolean): void => {
        if (settled) return;
        settled = true;
        unsubscribe?.();
        if (timeout !== null) clearTimeout(timeout);
        pending.current.delete(cancel);
        resolve(rendered);
      };
      const cancel = (): void => settle(false); // unmount → never leave a caller hanging
      pending.current.add(cancel);
      // addAfterEffect fires after the global loop actually renders the next
      // frame — the true "frame done" signal, not a guessed double-rAF.
      unsubscribe = addAfterEffect(() => settle(true));
      // Safety valve: a no-op invalidate (nothing dirty to draw) must not hang forever.
      timeout = setTimeout(() => settle(false), RENDER_TIMEOUT_MS);
      invalidate();
    });
  }, [invalidate]);

  const getPose = useCallback((): OpenpcbCapturePose => {
    const cam = cameraRef.current;
    const target = controlsRef.current?.target ?? new Vector3(0, 0, 0);
    const spherical = new Spherical().setFromVector3(
      cam.position.clone().sub(target),
    );
    return {
      thetaDeg: spherical.theta / DEG,
      phiDeg: spherical.phi / DEG,
      radius: spherical.radius,
      target: [target.x, target.y, target.z],
    };
  }, []);

  const setOrbit = useCallback(
    async (thetaDeg: number, phiDeg: number, radius: number): Promise<boolean> => {
      const cam = cameraRef.current;
      const ctrls = controlsRef.current;
      const target = ctrls?.target ?? new Vector3(0, 0, 0);
      const spherical = new Spherical(radius, phiDeg * DEG, thetaDeg * DEG);
      spherical.makeSafe(); // clamp polar angle off the poles to avoid flips
      cam.position.setFromSpherical(spherical).add(target);
      cam.lookAt(target);
      ctrls?.update();
      return renderFrame();
    },
    [renderFrame],
  );

  const setTarget = useCallback(
    async (x: number, y: number, z: number): Promise<boolean> => {
      const cam = cameraRef.current;
      const ctrls = controlsRef.current;
      if (ctrls) {
        ctrls.target.set(x, y, z);
        ctrls.update();
      }
      cam.lookAt(x, y, z);
      return renderFrame();
    },
    [renderFrame],
  );

  useEffect(() => {
    const three: OpenpcbCaptureThreeApi = {
      getPose,
      setOrbit,
      setTarget,
      renderFrame,
    };
    const existing = window.__openpcbCapture ?? {};
    window.__openpcbCapture = { ...existing, three };
    const inFlight = pending.current;
    return () => {
      for (const cancel of [...inFlight]) cancel(); // settle(false), never hang an awaiting driver
      inFlight.clear();
      const current = window.__openpcbCapture;
      if (current) delete current.three;
    };
  }, [getPose, setOrbit, setTarget, renderFrame]);

  return null;
}
