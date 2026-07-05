/**
 * Copper patch classifier — the single source of created/modified/deleted PCB
 * geometry per command, read from the SAME history patches that mutate the DB.
 *
 * Why patches and not dispatch results: `pcb_add_trace_via` returns only the via
 * id as `createdEntityId` (command-executor.ts) — the trace id is dropped — and
 * modifications/deletions return no ids at all. Forward/inverse patch pairing is
 * exact: forward `component.set` + inverse `entity.delete` ⇒ created; forward
 * `component.set` + inverse `component.set` ⇒ modified; forward `entity.delete`
 * (inverse `entity.restore` carries the payload, incl. netId) ⇒ deleted.
 */

import type { EcsPatch } from "../../../../shared/domain/commands";

const TRACE_PREFIX = "pcb:trace:";
const VIA_PREFIX = "pcb:via:";

export interface CopperGeometryRef {
  geometryId: string;
  kind: "trace" | "via";
  netId: string | null;
}

export interface ClassifiedCopperPatches {
  created: CopperGeometryRef[];
  modified: CopperGeometryRef[];
  deleted: CopperGeometryRef[];
}

function copperKey(entityId: string): { kind: "trace" | "via"; id: string } | null {
  if (entityId.startsWith(TRACE_PREFIX)) {
    return { kind: "trace", id: entityId.slice(TRACE_PREFIX.length) };
  }
  if (entityId.startsWith(VIA_PREFIX)) {
    return { kind: "via", id: entityId.slice(VIA_PREFIX.length) };
  }
  return null;
}

function netIdFromComponent(component: unknown): string | null {
  if (component && typeof component === "object" && "payload" in component) {
    const payload = (component as { payload?: unknown }).payload;
    if (payload && typeof payload === "object" && "netId" in payload) {
      const netId = (payload as { netId?: unknown }).netId;
      if (typeof netId === "string") return netId;
    }
  }
  return null;
}

function netIdFromRestore(components: unknown): string | null {
  if (!components || typeof components !== "object") return null;
  for (const component of Object.values(components)) {
    const netId = netIdFromComponent(component);
    if (netId) return netId;
  }
  return null;
}

export function classifyCopperPatches(
  forward: readonly EcsPatch[],
  inverse: readonly EcsPatch[],
): ClassifiedCopperPatches {
  const inverseByEntity = new Map<string, EcsPatch[]>();
  for (const patch of inverse as readonly EcsPatch[]) {
    if ("entityId" in patch) {
      const list = inverseByEntity.get(patch.entityId as string) ?? [];
      list.push(patch);
      inverseByEntity.set(patch.entityId as string, list);
    }
  }

  const result: ClassifiedCopperPatches = { created: [], modified: [], deleted: [] };
  for (const patch of forward as readonly EcsPatch[]) {
    if (!("entityId" in patch)) continue;
    const copper = copperKey(patch.entityId as string);
    if (!copper) continue;
    const inversePatches = inverseByEntity.get(patch.entityId as string) ?? [];

    if (patch.kind === "component.set") {
      const ref: CopperGeometryRef = {
        geometryId: copper.id,
        kind: copper.kind,
        netId: netIdFromComponent(patch.component),
      };
      if (inversePatches.some((p) => p.kind === "entity.delete")) {
        result.created.push(ref);
      } else {
        result.modified.push(ref);
      }
    } else if (patch.kind === "entity.delete") {
      const restore = inversePatches.find((p) => p.kind === "entity.restore");
      result.deleted.push({
        geometryId: copper.id,
        kind: copper.kind,
        netId: restore ? netIdFromRestore((restore as { components?: unknown }).components) : null,
      });
    }
  }
  return result;
}
