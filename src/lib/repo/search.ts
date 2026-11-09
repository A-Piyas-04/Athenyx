import path from "node:path";
import type { FileReader } from "@/lib/repo/files";
import { isTestPath } from "@/lib/repo/filters";

/**
 * Keyword search over the snapshot (04 §5b step 1).
 *
 * NOTE: keywords come from the planner model, so they are matched as literal,
 * case-sensitive substrings — never compiled to a RegExp (avoids ReDoS and
 * regex-syntax surprises from model output).
 */

export const HITS_PER_KEYWORD = 3;
const MIN_KEYWORD_LENGTH = 2;
const MAX_KEYWORD_LENGTH = 200;

export type KeywordHit = { keyword: string; path: string };

/**
 * Files containing `keyword`, non-test files first, then in tree order.
 * `skip` lets callers avoid re-adding files already in the context.
 */
export function searchKeyword(
  keyword: string,
  paths: string[],
  read: FileReader,
  options: { limit?: number; skip?: ReadonlySet<string> } = {},
): string[] {
  const limit = options.limit ?? HITS_PER_KEYWORD;
  const needle = keyword.trim();
  if (needle.length < MIN_KEYWORD_LENGTH || needle.length > MAX_KEYWORD_LENGTH) return [];

  const source: string[] = [];
  const tests: string[] = [];
  for (const p of paths) {
    if (options.skip?.has(p)) continue;
    const text = read(p);
    if (text === null || !text.includes(needle)) continue;
    if (isTestPath(p)) tests.push(p);
    else source.push(p);
    // Enough non-test hits: no need to scan further.
    if (source.length >= limit) break;
  }
  return [...source, ...tests].slice(0, limit);
}

/** Runs every keyword (up to {@link HITS_PER_KEYWORD} files each), unique across keywords. */
export function searchKeywords(
  keywords: string[],
  paths: string[],
  read: FileReader,
  skip: ReadonlySet<string> = new Set(),
): KeywordHit[] {
  const taken = new Set(skip);
  const hits: KeywordHit[] = [];
  for (const keyword of [...new Set(keywords)]) {
    for (const p of searchKeyword(keyword, paths, read, { skip: taken })) {
      taken.add(p);
      hits.push({ keyword, path: p });
    }
  }
  return hits;
}

/**
 * Test files that belong to `sourcePath` (04 §5b step 4):
 * `x.test.*`, `x.spec.*` beside it, or `__tests__/x.*` / `__tests__/x.test.*`.
 */
export function findTestsFor(sourcePath: string, fileSet: ReadonlySet<string>): string[] {
  if (isTestPath(sourcePath)) return [];
  const dir = path.posix.dirname(sourcePath);
  const ext = path.posix.extname(sourcePath);
  const stem = path.posix.basename(sourcePath, ext);
  const join = (...parts: string[]) => path.posix.join(...parts);

  const exts = [ext, ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
  const candidates = new Set<string>();
  for (const e of exts) {
    for (const kind of ["test", "spec"]) {
      candidates.add(join(dir, `${stem}.${kind}${e}`));
      candidates.add(join(dir, "__tests__", `${stem}.${kind}${e}`));
    }
    candidates.add(join(dir, "__tests__", `${stem}${e}`));
  }
  return [...candidates].filter((c) => fileSet.has(c));
}
