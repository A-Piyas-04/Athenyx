import type { FileReader } from "@/lib/repo/files";
import type { ExcludedFile } from "@/lib/repo/filters";
import {
  createImportResolver,
  findImporters,
  localImportsOf,
  type ImportResolver,
} from "@/lib/repo/imports";
import { renderProjectMap, type ProjectMap } from "@/lib/repo/mapper";
import { redactionLimitation, redactSecrets } from "@/lib/repo/redact";
import { findTestsFor, searchKeywords } from "@/lib/repo/search";

/**
 * Assembles the ContextBundle (04 §5b–5d): which files a review sees, within a
 * token budget, rendered with line numbers so evidence can be checked later.
 */

// ---------------------------------------------------------------------------
// Tokens and escaping
// ---------------------------------------------------------------------------

/** Rough token estimate used for every budget decision (04 §5c). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Neutralises closing tags inside data blocks so repository or user text can
 * never end a `<repository_file>` (or any other) block early (05 §9).
 */
export function escapeTagContent(text: string): string {
  return text.replaceAll("</", "<\\/");
}

/** Escapes a value for use inside a double-quoted XML-style attribute. */
export function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Splits text into lines the way editors number them (a trailing newline adds no line). */
export function splitLines(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

// ---------------------------------------------------------------------------
// Deterministic expansion (04 §5b)
// ---------------------------------------------------------------------------

/** Budget priority, highest first (04 §5c). */
export const CONTEXT_GROUPS = [
  "changed",
  "planner",
  "always",
  "imports",
  "importers",
  "keywords",
  "tests",
] as const;
export type ContextGroup = (typeof CONTEXT_GROUPS)[number];

export type ContextCandidate = { path: string; group: ContextGroup };

export const MAX_PLANNER_FILES = 30;
export const MAX_IMPORTERS = 10;

/** Small, high-value files included in every review when present. */
export function alwaysIncludePaths(fileSet: ReadonlySet<string>): string[] {
  return [
    "package.json",
    "tsconfig.json",
    "prisma/schema.prisma",
    "middleware.ts",
    "src/middleware.ts",
  ].filter((p) => fileSet.has(p));
}

export type ExpandContextInput = {
  /** Filtered snapshot files (only these can ever be selected). */
  files: { path: string }[];
  read: FileReader;
  /** LATEST_CHANGES / RECHECK: changed files, in the order to prefer. */
  changedFiles?: string[];
  /** Planner-ranked files. */
  plannerFiles?: string[];
  /** Planner keywords to grep for. */
  keywords?: string[];
  /** LATEST_CHANGES: add files that import a changed file. */
  includeImporters?: boolean;
  /** Reuse a resolver built for this snapshot. */
  resolver?: ImportResolver;
};

/**
 * Turns planner output (+ changed files) into a priority-ordered, de-duplicated
 * candidate list. Paths not in the filtered snapshot are dropped here, so
 * nothing the model names can bypass the filters.
 */
export function expandContext(input: ExpandContextInput): ContextCandidate[] {
  const paths = input.files.map((f) => f.path);
  const resolver = input.resolver ?? createImportResolver(paths, input.read);
  const fileSet = resolver.fileSet;

  const seen = new Set<string>();
  const out: ContextCandidate[] = [];
  const add = (p: string, group: ContextGroup) => {
    if (!fileSet.has(p) || seen.has(p)) return;
    seen.add(p);
    out.push({ path: p, group });
  };

  for (const p of input.changedFiles ?? []) add(p, "changed");
  for (const p of (input.plannerFiles ?? []).slice(0, MAX_PLANNER_FILES)) add(p, "planner");
  for (const p of alwaysIncludePaths(fileSet)) add(p, "always");

  const roots = out.filter((c) => c.group === "changed" || c.group === "planner").map((c) => c.path);
  for (const root of roots) {
    for (const imported of localImportsOf(root, input.read, resolver)) add(imported, "imports");
  }

  if (input.includeImporters) {
    let added = 0;
    for (const changed of input.changedFiles ?? []) {
      if (added >= MAX_IMPORTERS) break;
      for (const importer of findImporters(changed, input.read, resolver, MAX_IMPORTERS)) {
        if (added >= MAX_IMPORTERS) break;
        if (!seen.has(importer)) added += 1;
        add(importer, "importers");
      }
    }
  }

  for (const hit of searchKeywords(input.keywords ?? [], paths, input.read, seen)) {
    add(hit.path, "keywords");
  }

  const sources = out.filter((c) => c.group !== "always").map((c) => c.path);
  for (const source of sources) {
    for (const test of findTestsFor(source, fileSet)) add(test, "tests");
  }

  return out;
}

// ---------------------------------------------------------------------------
// Bundle (04 §5c–5d)
// ---------------------------------------------------------------------------

/** One file of a GitHub compare response (03 §5). */
export type DiffFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  previous_filename?: string;
};

export type DiffInput = { base: string; head: string; files: DiffFile[] };

export type PriorFinding = {
  id: string;
  title: string;
  persona: string;
  paths: string[];
  status: string;
};

export type IncludedFile = {
  path: string;
  /** Always 1: files are included from the top. */
  startLine: number;
  /** Last line shown to the model. */
  endLine: number;
  totalLines: number;
  truncated: boolean;
  /** Redacted snapshot lines 1..endLine — what the validator compares quotes against. */
  lines: string[];
};

export type ContextBundle = {
  text: string;
  estimatedTokens: number;
  files: IncludedFile[];
  filesIncluded: string[];
  filesExcluded: ExcludedFile[];
  limitations: string[];
  redactedCount: number;
};

export type BuildContextInput = {
  projectMap: ProjectMap;
  snapshot: { repo: string; branch: string; commitSha: string };
  candidates: ContextCandidate[];
  read: FileReader;
  /** Total input budget in tokens (AI_REVIEW_MAX_INPUT_TOKENS). */
  budgetTokens: number;
  /** Tokens used outside the bundle: system rules, persona brief, task text. */
  instructionTokens?: number;
  /** Files excluded by the filters (from the snapshot scan). */
  filterExclusions?: ExcludedFile[];
  diff?: DiffInput;
  priorFindings?: PriorFinding[];
  /** Already-rendered developer input; placed verbatim (escaped) in its block. */
  developerInput?: string;
  /** Limitations from earlier stages (e.g. the project map). */
  limitations?: string[];
  /** Tree lines in the rendered project map (reviewers can only cite files, so they need less). */
  mapTreeLines?: number;
};

/** Files larger than this share of the budget are truncated (04 §5c). */
export const LARGE_FILE_SHARE = 0.25;
/** The diff block may use at most this share of the budget (04 §5c). */
export const DIFF_SHARE = 0.3;
/** A truncated file shorter than this is not worth including. */
const MIN_TRUNCATED_LINES = 20;
/** Excluded-files list entries shown to the model (coverage keeps all). */
const MAX_EXCLUDED_LINES = 200;

export function renderRepositoryFile(
  path: string,
  lines: string[],
  totalLines: number,
): string {
  const body = lines.map((line, i) => `${i + 1}| ${escapeTagContent(line)}`).join("\n");
  const marker =
    lines.length < totalLines
      ? `\n… [truncated: lines ${lines.length + 1}–${totalLines} omitted]`
      : "";
  const range = lines.length > 0 ? `1-${lines.length}` : "0-0";
  return `<repository_file path="${escapeAttr(path)}" lines="${range}">\n${body}${marker}\n</repository_file>`;
}

function renderExcluded(excluded: ExcludedFile[]): string {
  if (excluded.length === 0) return "";
  const shown = excluded.slice(0, MAX_EXCLUDED_LINES).map((e) => `${e.path} (${e.reason})`);
  if (excluded.length > MAX_EXCLUDED_LINES) {
    shown.push(`… and ${excluded.length - MAX_EXCLUDED_LINES} more`);
  }
  return `<excluded_files>\n${escapeTagContent(shown.join("\n"))}\n</excluded_files>`;
}

function renderPriorFindings(findings: PriorFinding[]): string {
  if (findings.length === 0) return "";
  const rows = findings.map(
    (f) => `${f.id} | ${f.title} | ${f.persona} | ${f.paths.join(", ")} | ${f.status}`,
  );
  return `<prior_findings>\n${escapeTagContent(rows.join("\n"))}\n</prior_findings>`;
}

/**
 * Renders the diff within `maxTokens`. Patches are redacted; files whose patch
 * GitHub omitted, or that no longer fit, are listed without one.
 */
function renderDiff(
  diff: DiffInput,
  maxTokens: number,
): { text: string; limitations: string[]; redacted: number } {
  const limitations: string[] = [];
  let redacted = 0;
  const open = `<diff base="${escapeAttr(diff.base)}" head="${escapeAttr(diff.head)}">`;
  const close = "</diff>";
  let used = estimateTokens(open + close) + 1;
  const parts: string[] = [];
  let truncated = 0;

  for (const file of diff.files) {
    const renamed = file.previous_filename ? ` (renamed from ${file.previous_filename})` : "";
    const header = `### ${file.filename}${renamed} — ${file.status}, +${file.additions} -${file.deletions}`;
    let section = header;

    if (file.patch === undefined) {
      limitations.push(`Patch unavailable for ${file.filename}`);
      section += "\n(patch unavailable)";
    } else {
      const { text, count } = redactSecrets(file.patch);
      redacted += count;
      section += `\n${text}`;
    }

    const cost = estimateTokens(section) + 1;
    if (used + cost <= maxTokens) {
      parts.push(section);
      used += cost;
      continue;
    }

    // Truncate this patch to the lines that still fit, then list the rest headers-only.
    const remainingChars = (maxTokens - used) * 4;
    const marker = "\n… [patch truncated]";
    if (remainingChars > header.length + marker.length + 80) {
      const kept = section.slice(0, remainingChars - marker.length);
      const cut = kept.lastIndexOf("\n");
      parts.push((cut > header.length ? kept.slice(0, cut) : header) + marker);
      used = maxTokens;
    } else if (used + estimateTokens(header) + 1 <= maxTokens) {
      parts.push(`${header}\n(patch omitted)`);
      used += estimateTokens(header) + 5;
    }
    truncated += 1;
  }

  if (truncated > 0) limitations.push("Diff truncated to fit the context budget.");
  const text = `${open}\n${escapeTagContent(parts.join("\n\n"))}\n${close}`;
  return { text, limitations, redacted };
}

/**
 * Builds the bundle. Files are added in candidate order (already priority
 * ordered by {@link expandContext}); those that do not fit are excluded with
 * reason `budget`, and later smaller files may still fit.
 */
export function buildContextBundle(input: BuildContextInput): ContextBundle {
  const limitations: string[] = [...(input.limitations ?? [])];
  let redactedCount = 0;
  const budget = input.budgetTokens;

  // Fixed blocks.
  const mapBlock = `<project_map>\n${escapeTagContent(renderProjectMap(input.projectMap, { maxTreeLines: input.mapTreeLines }))}\n</project_map>`;
  const { repo, branch, commitSha } = input.snapshot;
  const snapshotTag = `<review_snapshot repo="${escapeAttr(repo)}" branch="${escapeAttr(branch)}" commit="${escapeAttr(commitSha)}" />`;

  let diffBlock = "";
  if (input.diff) {
    const diff = renderDiff(input.diff, Math.floor(budget * DIFF_SHARE));
    diffBlock = diff.text;
    limitations.push(...diff.limitations);
    redactedCount += diff.redacted;
  }

  const inputBlock =
    input.developerInput !== undefined && input.developerInput.trim() !== ""
      ? `<developer_input>\n${escapeTagContent(input.developerInput)}\n</developer_input>`
      : "";

  const priorAll = input.priorFindings ?? [];
  const filterExclusions = input.filterExclusions ?? [];

  // Reserve room for the worst case of the variable blocks: every candidate
  // excluded for budget, every prior finding listed.
  const reserveExcluded = renderExcluded([
    ...filterExclusions,
    ...input.candidates.map((c) => ({ path: c.path, reason: "budget" as const })),
  ]);
  const overhead =
    estimateTokens(
      [mapBlock, snapshotTag, diffBlock, reserveExcluded, renderPriorFindings(priorAll), inputBlock].join("\n\n"),
    ) + (input.instructionTokens ?? 0);

  let remaining = budget - overhead;
  if (remaining <= 0) {
    limitations.push("Context budget was used up by the project map, diff and input; no files could be included.");
  }
  const largeFileTokens = Math.floor(budget * LARGE_FILE_SHARE);

  const included: IncludedFile[] = [];
  const fileBlocks: string[] = [];
  const budgetExcluded: ExcludedFile[] = [];

  for (const candidate of input.candidates) {
    const raw = input.read(candidate.path);
    if (raw === null) continue;
    const { text, count } = redactSecrets(raw);
    const lines = splitLines(text);

    let shown = lines;
    let block = renderRepositoryFile(candidate.path, lines, lines.length);
    let cost = estimateTokens(block) + 1;

    // A file over 25% of the budget is cut to the first lines that fit.
    if (cost > largeFileTokens) {
      shown = remaining > 0 ? fitLines(candidate.path, lines, Math.min(largeFileTokens, remaining)) : [];
      block = renderRepositoryFile(candidate.path, shown, lines.length);
      cost = estimateTokens(block) + 1;
    }

    if (cost > remaining || (shown.length < MIN_TRUNCATED_LINES && shown.length < lines.length)) {
      budgetExcluded.push({ path: candidate.path, reason: "budget" });
      continue;
    }

    remaining -= cost;
    redactedCount += count;
    fileBlocks.push(block);
    const truncated = shown.length < lines.length;
    if (truncated) {
      limitations.push(
        `Large file ${candidate.path} truncated to lines 1–${shown.length} of ${lines.length}.`,
      );
    }
    included.push({
      path: candidate.path,
      startLine: 1,
      endLine: shown.length,
      totalLines: lines.length,
      truncated,
      lines: shown,
    });
  }

  if (budgetExcluded.length > 0) {
    limitations.push(
      `${budgetExcluded.length} relevant file${budgetExcluded.length === 1 ? " was" : "s were"} left out to fit the context budget.`,
    );
  }
  const redaction = redactionLimitation(redactedCount);
  if (redaction) limitations.push(redaction);

  const includedPaths = new Set(included.map((f) => f.path));
  const prior = priorAll.filter((f) => f.paths.some((p) => includedPaths.has(p)));
  const filesExcluded = [...filterExclusions, ...budgetExcluded];

  const text = [
    mapBlock,
    snapshotTag,
    diffBlock,
    ...fileBlocks,
    renderExcluded(filesExcluded),
    renderPriorFindings(prior),
    inputBlock,
  ]
    .filter((block) => block !== "")
    .join("\n\n");

  return {
    text,
    estimatedTokens: estimateTokens(text),
    files: included,
    filesIncluded: included.map((f) => f.path),
    filesExcluded,
    limitations,
    redactedCount,
  };
}

/** The longest prefix of `lines` whose rendered block fits in `maxTokens`. */
function fitLines(path: string, lines: string[], maxTokens: number): string[] {
  let lo = 0;
  let hi = lines.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const cost = estimateTokens(renderRepositoryFile(path, lines.slice(0, mid), lines.length)) + 1;
    if (cost <= maxTokens) lo = mid;
    else hi = mid - 1;
  }
  return lines.slice(0, lo);
}
