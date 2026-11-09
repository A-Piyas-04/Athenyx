/**
 * Checks `path:line` references in an AI answer against the files the review
 * actually saw. The answer is shown as written; unknown references only add a
 * visible limitation so the developer knows not to trust them.
 */

const REFERENCE_RE = /([A-Za-z0-9_@.[\]()-]+(?:\/[A-Za-z0-9_@.[\]()-]+)*\.[A-Za-z0-9]{1,6}):(\d+)/g;

export function answerReferences(answer: string): { path: string; line: number }[] {
  const refs: { path: string; line: number }[] = [];
  for (const match of answer.matchAll(REFERENCE_RE)) {
    refs.push({ path: match[1].replace(/^\.?\//, ""), line: Number(match[2]) });
  }
  return refs;
}

/** Distinct referenced paths that were not part of the review. */
export function unknownAnswerReferences(answer: string, knownPaths: ReadonlySet<string>): string[] {
  const unknown = new Set<string>();
  for (const ref of answerReferences(answer)) {
    if (!knownPaths.has(ref.path)) unknown.add(ref.path);
  }
  return [...unknown];
}
