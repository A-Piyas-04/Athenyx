import { z } from "zod";
import { DecisionStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

/** DB reads for the Decision Ledger. Always project-scoped. */

export const AlternativeSchema = z.object({ title: z.string(), whyNot: z.string() });
export type Alternative = z.infer<typeof AlternativeSchema>;

export function readAlternatives(value: unknown): Alternative[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    const parsed = AlternativeSchema.safeParse(v);
    return parsed.success ? [parsed.data] : [];
  });
}

export function parseDecisionStatus(value: string | string[] | undefined): DecisionStatus | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && (Object.values(DecisionStatus) as string[]).includes(v) ? (v as DecisionStatus) : null;
}

export async function listDecisions(projectId: string, status: DecisionStatus | null) {
  return db.decision.findMany({
    where: { projectId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      title: true,
      status: true,
      commitSha: true,
      createdAt: true,
      supersededById: true,
      _count: { select: { findingLinks: true } },
    },
  });
}

export async function getDecision(projectId: string, decisionId: string) {
  const row = await db.decision.findFirst({
    where: { id: decisionId, projectId },
    include: {
      findingLinks: {
        include: { finding: { select: { id: true, title: true, severity: true, status: true } } },
      },
    },
  });
  if (!row) return null;
  const [supersededBy, supersedes] = await Promise.all([
    row.supersededById
      ? db.decision.findFirst({ where: { id: row.supersededById, projectId }, select: { id: true, title: true } })
      : null,
    db.decision.findMany({ where: { supersededById: row.id, projectId }, select: { id: true, title: true } }),
  ]);
  return {
    decision: { ...row, alternatives: readAlternatives(row.alternatives) },
    findings: row.findingLinks.map((l) => l.finding),
    supersededBy,
    supersedes,
  };
}

/** PROPOSED decisions for the Overview (06 "Unresolved decisions"). */
export async function proposedDecisions(projectId: string, take = 5) {
  return db.decision.findMany({
    where: { projectId, status: "PROPOSED" },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, title: true, createdAt: true },
  });
}
