import type { Prisma } from "@/generated/prisma/client";
import type { Usage } from "@/lib/ai/client";

/** Small helpers shared by the review and re-check pipelines. */

/** A failure whose message is written for the user. */
export class ReviewFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewFailure";
  }
}

/** `usage` is stored only when an LLM call was made (the daily limit relies on this). */
export function usageData(usage: Usage): { usage?: Prisma.InputJsonValue } {
  return usage.calls > 0 ? { usage: usage as unknown as Prisma.InputJsonValue } : {};
}

/** True when two SHAs name the same commit (either may be abbreviated). */
export function sameCommit(a: string, b: string): boolean {
  return a === b || (a.length < 40 && b.startsWith(a)) || (b.length < 40 && a.startsWith(b));
}

/**
 * A log-safe summary of an unexpected error: name, the first line of the
 * message (capped) and the stack frames. Full messages are not logged because
 * some (e.g. Prisma validation errors) echo their arguments, which can hold
 * repository snippets — and file contents must never reach the logs.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error).slice(0, 300);
  const firstLine = error.message.split("\n").find((l) => l.trim() !== "")?.trim().slice(0, 300) ?? "";
  const frames = (error.stack ?? "")
    .split("\n")
    .filter((l) => l.trimStart().startsWith("at "))
    .slice(0, 8)
    .join("\n");
  return `${error.name}: ${firstLine}${frames ? `\n${frames}` : ""}`;
}
