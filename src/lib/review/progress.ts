import type { Prisma } from "@/generated/prisma/client";
import type { RunStage } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { PersonaRunStatus } from "@/lib/review/types";

/** Run progress updates (04 §1, §11): stage, heartbeat, persona status, cancellation. */

export class RunCancelled extends Error {
  constructor() {
    super("Review cancelled.");
    this.name = "RunCancelled";
  }
}

export async function setStage(runId: string, stage: RunStage): Promise<void> {
  await db.reviewRun.update({ where: { id: runId }, data: { stage, heartbeatAt: new Date() } });
}

export async function heartbeat(runId: string): Promise<void> {
  await db.reviewRun.update({ where: { id: runId }, data: { heartbeatAt: new Date() } });
}

/** Keeps a per-run copy so concurrent updates within one run never clobber each other. */
export function createPersonaStatusTracker(runId: string, personas: string[]) {
  const state: Record<string, PersonaRunStatus> = Object.fromEntries(personas.map((p) => [p, "pending"]));
  const write = () =>
    db.reviewRun.update({
      where: { id: runId },
      data: { personaStatus: state as Prisma.InputJsonValue, heartbeatAt: new Date() },
    });
  return {
    async init() {
      await db.reviewRun.update({
        where: { id: runId },
        data: { personas, personaStatus: state as Prisma.InputJsonValue },
      });
    },
    async set(persona: string, status: PersonaRunStatus) {
      if (state[persona] === status) return;
      state[persona] = status;
      await write();
    },
    snapshot: () => ({ ...state }),
  };
}

/** Throws {@link RunCancelled} when the user cancelled the run (checked between stages). */
export async function assertNotCancelled(runId: string): Promise<void> {
  const run = await db.reviewRun.findUnique({ where: { id: runId }, select: { status: true } });
  if (!run || run.status === "CANCELLED") throw new RunCancelled();
}
