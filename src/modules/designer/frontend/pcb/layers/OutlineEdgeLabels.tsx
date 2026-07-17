import { useThree } from "@react-three/fiber";
import { useMemo, type ReactElement } from "react";
import type { PcbPointMm } from "../../../../../sdks";
import { EDAText } from "../../../../../shared/frontend/canvas/primitives/EDAText";
import { RENDER_ORDER } from "../../../../../shared/frontend/canvas/layers";
import { formatMm } from "../tools/measure-tool-state";

/** One straight edge to dimension. `live` edges bypass the zoom gate. */
export interface DimEdge {
  a: PcbPointMm;
  b: PcbPointMm;
  live?: boolean;
}

/** Sketch labels tolerate a wider zoom-out than net names (smaller text ok). */
const MIN_PX_PER_MM = 6;
/** Edges shorter than this skip the label — keeps tiny jogs uncluttered. */
const MIN_EDGE_LEN_MM = 1.5;
const FONT_MM = 0.6;
/** Perpendicular offset so text sits beside the edge, not on the line. */
const OFFSET_MM = 0.9;

/**
 * Length labels along a set of straight board-outline edges. Shared by the
 * draw tool (rubber-band + committed edges) and outline edit mode. Each label
 * sits just off its edge, rotated along the edge tangent (flipped past vertical
 * so it never reads upside-down), and is zoom-gated except for the live edge.
 */
export function OutlineEdgeLabels({
  edges,
  color = "#e2e8f0",
  counterMirror = false,
}: {
  edges: readonly DimEdge[];
  color?: string;
  counterMirror?: boolean;
}): ReactElement | null {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const pxPerMm = useMemo(() => {
    if ("right" in camera && "left" in camera) {
      const c = camera as unknown as { right: number; left: number };
      const worldWidth = (c.right - c.left) / camera.zoom;
      if (worldWidth <= 0) return MIN_PX_PER_MM;
      return size.width / worldWidth;
    }
    return MIN_PX_PER_MM;
  }, [camera, size.width]);

  const labels = useMemo(() => {
    type L = { key: string; x: number; y: number; angle: number; text: string };
    const out: L[] = [];
    edges.forEach((e, i) => {
      const dx = e.b.x - e.a.x;
      const dy = e.b.y - e.a.y;
      const len = Math.hypot(dx, dy);
      if (len < MIN_EDGE_LEN_MM) return;
      if (!e.live && pxPerMm < MIN_PX_PER_MM) return;
      const angleRaw = Math.atan2(dy, dx);
      const angle =
        angleRaw > Math.PI / 2 || angleRaw < -Math.PI / 2
          ? angleRaw + Math.PI
          : angleRaw;
      const nx = -dy / len;
      const ny = dx / len;
      out.push({
        key: `${i}`,
        x: (e.a.x + e.b.x) / 2 + nx * OFFSET_MM,
        y: (e.a.y + e.b.y) / 2 + ny * OFFSET_MM,
        angle,
        text: formatMm(len),
      });
    });
    return out;
  }, [edges, pxPerMm]);

  if (labels.length === 0) return null;
  const scaleX = counterMirror ? -1 : 1;

  return (
    <>
      {labels.map((l) => (
        <group key={l.key} position={[l.x, l.y, 0]} scale={[scaleX, 1, 1]}>
          <EDAText
            position={[0, 0, 0]}
            fontSize={FONT_MM}
            color={color}
            anchorX="center"
            anchorY="middle"
            rotation={[0, 0, l.angle]}
            renderOrder={RENDER_ORDER.METADATA}
            outlineWidth={FONT_MM * 0.2}
            outlineColor="#000000"
          >
            {l.text}
          </EDAText>
        </group>
      ))}
    </>
  );
}
