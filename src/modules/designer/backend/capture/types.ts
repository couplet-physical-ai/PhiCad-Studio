/**
 * Dataset-capture types (WP-D4 / SPEC_ML0_DATASET_FOUNDATION §6).
 *
 * Spec deviation, verified against source: there is no `CommandBatch` type in the
 * command architecture — the unit of work is a single `DesignerCommandEnvelope`
 * (see @openpcb/command-pattern). The session log therefore records one entry per
 * envelope; multi-op applies (auto-layout, assistant proposals) are linked by a
 * shared `groupId`/`jobId`.
 */

import type {
  DesignerCommandEnvelope,
  DesignerDispatchResult,
} from "../../../../sdks";

export type CaptureActor = "user" | "assistant" | "autolayout_apply" | "import";

/** Optional capture metadata threaded through dispatchCommand call sites. */
export interface DispatchCaptureMeta {
  actor: CaptureActor;
  /** Auto-layout apply only. */
  jobId?: string;
  appliedCandidateId?: string;
  /** One ULID per apply/proposal loop — the batch surrogate. */
  groupId?: string;
}

export interface SessionLogTags {
  touchedNetIds: string[];
  touchesAutoCopper: boolean;
  /** Command-type histogram; per single-envelope entry this is `{<type>: 1}`. */
  opKinds: Record<string, number>;
}

export type SessionLogEntryKind =
  | "session_start"
  | "command"
  | "undo"
  | "redo"
  | "import"
  | "autolayout_applied"
  | "milestone_snapshot"
  | "per_net_outcome"
  | "capture_truncated";

export type MilestoneTrigger =
  | "project_open"
  | "autolayout_applied"
  | "export"
  | "every_n_commands"
  | "session_end"
  | "import";

export type PerNetOutcomeKind = "accepted" | "modified" | "ripped" | "rerouted";

export interface PerNetOutcome {
  jobId: string;
  appliedCandidateId: string | null;
  netId: string;
  /** "accepted" is a first-class, explicitly emitted label (spec §6). */
  outcome: PerNetOutcomeKind;
  editCount: number;
  trigger: "export";
}

export interface SessionLogEntry {
  v: 1;
  seq: number;
  id: string; // ULID
  ts: string; // ISO-8601 UTC
  designId: string;
  kind: SessionLogEntryKind;
  actor: CaptureActor | "system";
  /** kind=command: the envelope + result, verbatim ("capture everything"). */
  envelope?: DesignerCommandEnvelope;
  result?: DesignerDispatchResult;
  groupId?: string;
  jobId?: string;
  appliedCandidateId?: string;
  /** null = tag derivation failed; the raw entry is still logged (failure-isolated). */
  tags?: SessionLogTags | null;
  tagError?: string;
  /** kind=undo|redo: which history entry was replayed. */
  history?: { editorSessionId: string; commandId: string; revision: number };
  /** kind=milestone_snapshot. */
  snapshot?: { sha256: string; trigger: MilestoneTrigger; path: string };
  /** kind=per_net_outcome. */
  outcome?: PerNetOutcome;
  /** kind=import: summary payload from the importer (no envelopes exist). */
  importSummary?: unknown;
}
