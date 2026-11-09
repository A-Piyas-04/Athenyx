import { z } from "zod";
import type { Finding, Prisma } from "@/generated/prisma/client";
import { FindingStatus } from "@/generated/prisma/enums";
import { ApiError } from "@/lib/api";
import { FixOptionSchema, readJsonArray } from "@/lib/review/types";

/**
 * User-controlled finding fields (07 `PATCH /api/findings/:id`, 02 rules).
 * RESOLVED is normally set only by a re-check; a user may mark it manually
 * with a note, stored with a `[manual] ` prefix and shown as "not verified".
 */

export const MANUAL_PREFIX = "[manual] ";

/** Statuses whose change requires a note explaining why. */
export const NOTE_REQUIRED: ReadonlySet<FindingStatus> = new Set<FindingStatus>(["ACCEPTED_RISK", "DISMISSED", "RESOLVED"]);

export const updateFindingSchema = z
  .object({
    status: z.enum(Object.values(FindingStatus) as [FindingStatus, ...FindingStatus[]]).optional(),
    statusNote: z.string().trim().max(2000).optional(),
    chosenOptionIndex: z.number().int().min(0).max(2).nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.chosenOptionIndex !== undefined, {
    message: "Provide a status or a chosen option.",
  });

export type UpdateFindingInput = z.infer<typeof updateFindingSchema>;

export function isManualResolution(finding: Pick<Finding, "status" | "statusNote">): boolean {
  return finding.status === "RESOLVED" && (finding.statusNote ?? "").startsWith(MANUAL_PREFIX.trim());
}

/** Note text without the `[manual]` marker, for display. */
export function displayNote(note: string | null): string | null {
  if (!note) return null;
  return note.startsWith(MANUAL_PREFIX.trim()) ? note.slice(MANUAL_PREFIX.trim().length).trim() : note;
}

/** Builds the Prisma update for a validated request, enforcing the note rules. */
export function findingUpdateData(finding: Finding, input: UpdateFindingInput): Prisma.FindingUpdateInput {
  const data: Prisma.FindingUpdateInput = {};

  if (input.chosenOptionIndex !== undefined) {
    if (input.chosenOptionIndex !== null) {
      const options = readJsonArray(finding.options, FixOptionSchema);
      if (input.chosenOptionIndex >= options.length) {
        throw new ApiError(400, "validation_error", "That fix option does not exist for this finding.");
      }
    }
    data.chosenOptionIndex = input.chosenOptionIndex;
  }

  if (input.status !== undefined) {
    const note = input.statusNote?.trim() ?? "";
    if (NOTE_REQUIRED.has(input.status) && note === "") {
      const what =
        input.status === "ACCEPTED_RISK"
          ? "accepting a risk"
          : input.status === "DISMISSED"
            ? "dismissing a finding"
            : "marking a finding resolved";
      throw new ApiError(400, "validation_error", `A note is required when ${what}.`);
    }
    data.status = input.status;
    if (input.status === "RESOLVED") data.statusNote = `${MANUAL_PREFIX}${note}`;
    else if (input.status === "ACCEPTED_RISK" || input.status === "DISMISSED") data.statusNote = note;
    else data.statusNote = note === "" ? null : note;
  }
  return data;
}
