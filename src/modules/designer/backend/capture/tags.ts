/**
 * Derived tags per session-log entry (spec §6). Pure; the caller wraps it in
 * try/catch — if derivation throws, the raw entry is logged with `tags: null`.
 */

import type { DesignerCommandEnvelope } from "../../../../sdks";
import type { ClassifiedCopperPatches } from "./patch-classifier";
import type { SessionLogTags } from "./types";

export function deriveTags(
  envelope: DesignerCommandEnvelope,
  classified: ClassifiedCopperPatches,
  isRegisteredAutoCopper: (geometryId: string) => boolean,
): SessionLogTags {
  const touchedNetIds = new Set<string>();
  let touchesAutoCopper = false;
  for (const group of [classified.created, classified.modified, classified.deleted]) {
    for (const ref of group) {
      if (ref.netId) touchedNetIds.add(ref.netId);
      if (isRegisteredAutoCopper(ref.geometryId)) touchesAutoCopper = true;
    }
  }
  // The command payload itself may name a net (e.g. pcb_add_trace.netId).
  const command = envelope.command as { netId?: unknown };
  if (typeof command.netId === "string") touchedNetIds.add(command.netId);

  return {
    touchedNetIds: [...touchedNetIds].sort(),
    touchesAutoCopper,
    opKinds: { [envelope.command.type]: 1 },
  };
}
