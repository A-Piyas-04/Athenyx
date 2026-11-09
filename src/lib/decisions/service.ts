import { z } from "zod";
import type { Decision, Prisma } from "@/generated/prisma/client";
import { DecisionStatus } from "@/generated/prisma/enums";
import { ApiError } from "@/lib/api";
import { db } from "@/lib/db";

/**
 * Decision Ledger logic (07 "Decisions"). Linked findings must belong to the
 * decision's project; superseding keeps history (old → SUPERSEDED with a link
 * to its replacement).
 */

const text = (max: number) => z.string().trim().max(max);
const required = (max: number, field: string) =>
  z.string({ error: `${field} is required.` }).trim().min(1, `${field} is required.`).max(max);
const optionalText = (max: number) =>
  text(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === null || v === "" ? null : v));

const alternativeSchema = z.object({
  title: required(200, "An alternative's title"),
  whyNot: text(2000).default(""),
});

const SHA_RE = /^[0-9a-f]{7,40}$/i;

export const decisionBodySchema = z.object({
  title: required(200, "A title"),
  context: required(4000, "Context"),
  chosenOption: required(4000, "The chosen option"),
  rationale: required(4000, "A rationale"),
  alternatives: z.array(alternativeSchema).max(10).default([]),
  constraints: optionalText(4000),
  assumptions: optionalText(4000),
  relatedFiles: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  findingIds: z.array(z.string().min(1).max(64)).max(50).default([]),
  status: z.enum(["PROPOSED", "ACCEPTED", "REVERTED"]).optional(),
  commitSha: z.string().trim().regex(SHA_RE, "Must be a commit SHA.").nullable().optional(),
});

export type DecisionBody = z.infer<typeof decisionBodySchema>;

/** PATCH accepts any subset; SUPERSEDED is only set by the supersede flow. */
export const decisionPatchSchema = decisionBodySchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: "Provide at least one field to update.",
});

export type DecisionPatch = z.infer<typeof decisionPatchSchema>;

export const DECISION_STATUSES = Object.values(DecisionStatus);

async function assertFindingsInProject(
  tx: Prisma.TransactionClient,
  projectId: string,
  findingIds: string[],
): Promise<string[]> {
  const unique = [...new Set(findingIds)];
  if (unique.length === 0) return unique;
  const count = await tx.finding.count({ where: { id: { in: unique }, projectId } });
  if (count !== unique.length) {
    throw new ApiError(400, "validation_error", "Linked findings must belong to this project.");
  }
  return unique;
}

function scalarData(body: Partial<DecisionBody>) {
  return {
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.context !== undefined ? { context: body.context } : {}),
    ...(body.chosenOption !== undefined ? { chosenOption: body.chosenOption } : {}),
    ...(body.rationale !== undefined ? { rationale: body.rationale } : {}),
    ...(body.alternatives !== undefined ? { alternatives: body.alternatives as Prisma.InputJsonValue } : {}),
    ...(body.constraints !== undefined ? { constraints: body.constraints } : {}),
    ...(body.assumptions !== undefined ? { assumptions: body.assumptions } : {}),
    ...(body.relatedFiles !== undefined ? { relatedFiles: [...new Set(body.relatedFiles)] } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.commitSha !== undefined ? { commitSha: body.commitSha } : {}),
  };
}

async function create(tx: Prisma.TransactionClient, projectId: string, body: DecisionBody): Promise<Decision> {
  const findingIds = await assertFindingsInProject(tx, projectId, body.findingIds);
  return tx.decision.create({
    data: {
      projectId,
      title: body.title,
      context: body.context,
      chosenOption: body.chosenOption,
      rationale: body.rationale,
      alternatives: body.alternatives as Prisma.InputJsonValue,
      constraints: body.constraints ?? null,
      assumptions: body.assumptions ?? null,
      relatedFiles: [...new Set(body.relatedFiles)],
      status: body.status ?? "ACCEPTED",
      commitSha: body.commitSha ?? null,
      findingLinks: { create: findingIds.map((findingId) => ({ findingId })) },
    },
  });
}

export function createDecision(projectId: string, body: DecisionBody): Promise<Decision> {
  return db.$transaction((tx) => create(tx, projectId, body));
}

export async function updateDecision(decision: Decision, patch: DecisionPatch): Promise<Decision> {
  if (decision.status === "SUPERSEDED" && patch.status !== undefined) {
    throw new ApiError(409, "conflict", "A superseded decision keeps its status; edit its replacement instead.");
  }
  return db.$transaction(async (tx) => {
    if (patch.findingIds !== undefined) {
      const ids = await assertFindingsInProject(tx, decision.projectId, patch.findingIds);
      await tx.decisionFinding.deleteMany({ where: { decisionId: decision.id } });
      if (ids.length > 0) {
        await tx.decisionFinding.createMany({ data: ids.map((findingId) => ({ decisionId: decision.id, findingId })) });
      }
    }
    return tx.decision.update({ where: { id: decision.id }, data: scalarData(patch) });
  });
}

/** Creates the replacement and marks the old decision SUPERSEDED, pointing at it. */
export async function supersedeDecision(decision: Decision, body: DecisionBody): Promise<Decision> {
  if (decision.status === "SUPERSEDED") {
    throw new ApiError(409, "conflict", "This decision has already been superseded.");
  }
  return db.$transaction(async (tx) => {
    const replacement = await create(tx, decision.projectId, body);
    await tx.decision.update({
      where: { id: decision.id },
      data: { status: "SUPERSEDED", supersededById: replacement.id },
    });
    return replacement;
  });
}

export async function deleteDecision(decision: Decision): Promise<void> {
  await db.$transaction(async (tx) => {
    // Keep the chain readable: anything superseded by this one no longer points at it.
    await tx.decision.updateMany({ where: { supersededById: decision.id }, data: { supersededById: null } });
    await tx.decision.delete({ where: { id: decision.id } });
  });
}
