import type {
  CheckResult,
  Classification,
  DecisionStatus,
  FindingStatus,
  Confidence,
  RunStage,
  RunStatus,
  Severity,
} from "@/generated/prisma/enums";

/** Display labels shared by server and client components (no server imports here). */

export const STAGE_STEPS: { stage: RunStage; label: string }[] = [
  { stage: "RESOLVING_COMMIT", label: "Resolve commit" },
  { stage: "FETCHING_SNAPSHOT", label: "Fetch code" },
  { stage: "MAPPING_PROJECT", label: "Map project" },
  { stage: "SELECTING_CONTEXT", label: "Select context" },
  { stage: "REVIEWING", label: "Review" },
  { stage: "VALIDATING", label: "Validate" },
  { stage: "SUMMARIZING", label: "Summarize" },
  { stage: "SAVING", label: "Save" },
];

export const STATUS_LABELS: Record<RunStatus, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  INFO: "Info",
};

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  VERIFIED_DEFECT: "Verified defect",
  POTENTIAL_RISK: "Potential risk",
  DESIGN_CONCERN: "Design concern",
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  HIGH: "High confidence",
  MEDIUM: "Medium confidence",
  LOW: "Low confidence",
};

export const FINDING_STATUS_LABELS: Record<FindingStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  ACCEPTED_RISK: "Accepted risk",
  DISMISSED: "Dismissed",
};

export const CHECK_RESULT_LABELS: Record<CheckResult, string> = {
  RESOLVED: "Resolved",
  STILL_PRESENT: "Still present",
  PARTIALLY_RESOLVED: "Partially resolved",
  UNVERIFIABLE: "Unverifiable",
};

export const DECISION_STATUS_LABELS: Record<DecisionStatus, string> = {
  PROPOSED: "Proposed",
  ACCEPTED: "Accepted",
  SUPERSEDED: "Superseded",
  REVERTED: "Reverted",
};

/** Persona display names come from the single persona registry. */
export { personaName as personaLabel } from "@/lib/ai/prompts/personas";

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}
