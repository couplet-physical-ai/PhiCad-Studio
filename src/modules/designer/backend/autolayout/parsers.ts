// Structural validation of everything crossing INTO the desktop from the cloud service,
// plus the local apply-request body.
//
// The generated types (src/sdks/designer/cloud-autolayout) describe what the service is
// supposed to send; they are compile-time only and vanish at runtime. A deployment can be
// older than this desktop, a proxy can truncate a body, a 200 can carry an error page.
// Since a candidate's operations are fed straight into a board-mutating command, "trust the
// declared type" is not an option here.
//
// Hand-written guards rather than a JSON-Schema validator: the repo parses every HTTP body
// this way already (routes.ts), it adds no dependency, and the checks below are exactly the
// fields the apply path dereferences — no more.

import type {
  LayoutCandidate,
  LayoutResultEnvelope,
  PlaceOperation,
  RouteOperation,
} from "../../../../sdks/designer/cloud-autolayout";
import { AutoLayoutError } from "./errors";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mismatch(what: string): AutoLayoutError {
  return new AutoLayoutError(
    "AUTO_LAYOUT_CONTRACT_MISMATCH",
    `OpenPCB Cloud returned an unexpected ${what}. The deployed service may be incompatible with this version of OpenPCB.`,
  );
}

const PLACE_OP_TYPES = new Set([
  "pcb_move_placement",
  "pcb_rotate_placement",
  "pcb_flip_placement",
]);
const ROUTE_OP_TYPES = new Set([
  "pcb_add_trace",
  "pcb_add_via",
  "pcb_add_trace_via",
]);

function validOperations(
  value: unknown,
  allowed: ReadonlySet<string>,
): boolean {
  if (value === undefined || value === null) return true; // absent list is empty
  if (!Array.isArray(value)) return false;
  return value.every((op) => {
    if (!isRecord(op)) return false;
    const payload = op.payload;
    return isRecord(payload) && typeof payload.type === "string" && allowed.has(payload.type);
  });
}

/**
 * Validate a `LayoutResultEnvelope` far enough that the apply path can trust it.
 *
 * Checked: the envelope kind, the candidate list, and every operation payload's
 * discriminator — the fields the desktop dereferences or dispatches. NOT checked: metrics,
 * explanations and scorecards, which are only rendered; a malformed number there should not
 * block an otherwise-good candidate from being applied.
 */
export function parseLayoutResult(value: unknown): LayoutResultEnvelope {
  if (!isRecord(value)) throw mismatch("layout result");
  if (value.kind !== "designer_pcb_autolayout") throw mismatch("layout result kind");
  if (!Array.isArray(value.candidates)) throw mismatch("candidate list");

  for (const candidate of value.candidates) {
    if (!isRecord(candidate) || typeof candidate.candidateId !== "string") {
      throw mismatch("layout candidate");
    }
    const place = candidate.placeEnvelope;
    if (place != null) {
      if (!isRecord(place) || !validOperations(place.operations, PLACE_OP_TYPES)) {
        throw mismatch("placement operation");
      }
    }
    const route = candidate.routeEnvelope;
    if (route != null) {
      if (!isRecord(route) || !validOperations(route.operations, ROUTE_OP_TYPES)) {
        throw mismatch("routing operation");
      }
    }
  }
  return value as unknown as LayoutResultEnvelope;
}

/** Locate a candidate by id, or fail with the code the UI expects. */
export function requireCandidate(
  result: LayoutResultEnvelope,
  candidateId: string,
): LayoutCandidate {
  const candidate = result.candidates.find((c) => c.candidateId === candidateId);
  if (!candidate) {
    throw new AutoLayoutError(
      "AUTO_LAYOUT_INVALID_CANDIDATE",
      `Candidate ${candidateId} is not part of this Auto Layout result.`,
    );
  }
  return candidate;
}

/**
 * A candidate is applicable when it succeeded and carries at least one operation.
 *
 * Rejected here rather than at the command layer so the user gets "this candidate failed"
 * instead of "the command was empty": a failed candidate, or one whose routing stage never
 * ran, is a legitimate part of the result set — it is shown, with diagnostics, and simply
 * cannot be applied.
 */
export function assertApplicable(candidate: LayoutCandidate): {
  placementOperations: PlaceOperation[];
  routeOperations: RouteOperation[];
} {
  if (candidate.failure) {
    throw new AutoLayoutError(
      "AUTO_LAYOUT_CANDIDATE_NOT_APPLICABLE",
      `Candidate ${candidate.candidateId} failed (${candidate.failure.code}) and cannot be applied.`,
      { detail: candidate.failure },
    );
  }
  const placementOperations = candidate.placeEnvelope?.operations ?? [];
  const routeOperations = candidate.routeEnvelope?.operations ?? [];
  if (placementOperations.length === 0 && routeOperations.length === 0) {
    throw new AutoLayoutError(
      "AUTO_LAYOUT_CANDIDATE_NOT_APPLICABLE",
      `Candidate ${candidate.candidateId} contains no operations to apply.`,
    );
  }
  return { placementOperations, routeOperations };
}

export interface ApplyCandidateRequest {
  jobId: string;
  candidateId: string;
  snapshotDigest: string;
  /**
   * Client-generated, stable across transport retries. It becomes the command id, so a
   * retry after a lost response replays the original result instead of applying twice.
   */
  applyRequestId: string;
  sessionId: string;
}

/**
 * Parse the LOCAL apply request. Note what is NOT here: the operations. The renderer sends
 * only which candidate of which job it wants; the backend re-fetches the candidate from the
 * service and derives the operations itself, so a compromised or stale renderer cannot
 * hand the command layer geometry the cloud never produced.
 */
export function parseApplyCandidateBody(value: unknown): ApplyCandidateRequest {
  if (!isRecord(value)) {
    throw new AutoLayoutError("AUTO_LAYOUT_OPERATION_INVALID", "Request body must be an object");
  }
  const jobId = value.jobId;
  const candidateId = value.candidateId;
  const snapshotDigest = value.snapshotDigest;
  const applyRequestId = value.applyRequestId;
  const sessionId = value.sessionId;
  if (
    typeof jobId !== "string" ||
    typeof candidateId !== "string" ||
    typeof snapshotDigest !== "string" ||
    typeof applyRequestId !== "string" ||
    typeof sessionId !== "string"
  ) {
    throw new AutoLayoutError(
      "AUTO_LAYOUT_OPERATION_INVALID",
      "jobId, candidateId, snapshotDigest, applyRequestId and sessionId are required",
    );
  }
  return { jobId, candidateId, snapshotDigest, applyRequestId, sessionId };
}
