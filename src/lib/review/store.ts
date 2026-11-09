import type { Prisma } from "@/generated/prisma/client";
import type { FindingStatus } from "@/generated/prisma/enums";
import { isDuplicate } from "@/lib/review/dedupe";
import type { EvidenceItem } from "@/lib/review/types";
import type { ValidatedFinding } from "@/lib/review/validate";

/** Persists a run's validated findings (04 §8): link to existing, or create. */

export type PriorFindingRecord = {
  id: string;
  title: string;
  status: FindingStatus;
  evidence: EvidenceItem[];
};

/**
 * Picks the stored finding a new one repeats: the model's (already validated)
 * `existingFindingId`, else — as a deterministic safety net for weak models —
 * a prior finding with overlapping primary evidence and a similar title.
 * NOTE: the safety net is an addition so repeated runs don't duplicate issues
 * when a free model forgets to set `existingFindingId`.
 */
export function resolveLinks(
  findings: ValidatedFinding[],
  prior: PriorFindingRecord[],
): (string | null)[] {
  const used = new Set<string>();
  return findings.map((finding) => {
    let id = finding.existingFindingId;
    if (id === null) {
      id = prior.find((p) => !used.has(p.id) && isDuplicate(p, finding))?.id ?? null;
    }
    if (id !== null && used.has(id)) id = null;
    if (id !== null) used.add(id);
    return id;
  });
}

export type SaveFindingsInput = {
  projectId: string;
  runId: string;
  commitSha: string;
  findings: ValidatedFinding[];
  prior: PriorFindingRecord[];
};

/** Must run inside the SAVING transaction. Returns counts for the run summary. */
export async function saveFindings(
  tx: Prisma.TransactionClient,
  input: SaveFindingsInput,
): Promise<{ created: number; linked: number }> {
  const links = resolveLinks(input.findings, input.prior);
  let created = 0;
  let linked = 0;

  for (const [index, finding] of input.findings.entries()) {
    const linkId = links[index];
    const evidence = finding.evidence as unknown as Prisma.InputJsonValue;

    if (linkId !== null) {
      const hasEvidence = finding.evidence.length > 0;
      // `updateMany` scoped to the project: an id from another project can never be touched.
      const result = await tx.finding.updateMany({
        where: { id: linkId, projectId: input.projectId },
        data: {
          lastSeenRunId: input.runId,
          // Evidence and its commit move together, so stored line numbers always match lastSeenSha.
          ...(hasEvidence ? { evidence, lastSeenSha: input.commitSha } : {}),
          model: finding.model,
        },
      });
      if (result.count === 1) {
        linked += 1;
        // Reopen only if it is RESOLVED right now — re-read inside the transaction, so a status the
        // user set while the review was running is never overwritten.
        const reopened = await tx.finding.updateMany({
          where: { id: linkId, projectId: input.projectId, status: "RESOLVED" },
          data: { status: "OPEN", statusNote: null },
        });
        if (reopened.count === 1) {
          await tx.findingCheck.create({
            data: {
              findingId: linkId,
              runId: input.runId,
              commitSha: input.commitSha,
              result: "STILL_PRESENT",
              reasoning: `Reappeared in review run ${input.runId}.`,
              evidence: hasEvidence ? evidence : undefined,
            },
          });
        }
        continue;
      }
    }

    await tx.finding.create({
      data: {
        projectId: input.projectId,
        firstSeenRunId: input.runId,
        lastSeenRunId: input.runId,
        lastSeenSha: input.commitSha,
        persona: finding.persona,
        model: finding.model,
        title: finding.title,
        observation: finding.observation,
        impact: finding.impact,
        classification: finding.classification,
        severity: finding.severity,
        confidence: finding.confidence,
        evidence,
        userPremise: finding.userPremise,
        options: finding.options as unknown as Prisma.InputJsonValue,
        recommendation: finding.recommendation
          ? (finding.recommendation as unknown as Prisma.InputJsonValue)
          : undefined,
        verification: finding.verification,
      },
    });
    created += 1;
  }
  return { created, linked };
}
