# 04 — Review Engine

The review engine turns a queued `ReviewRun` into validated, stored findings. It lives in `src/lib/review/**` and `src/lib/repo/**`, and is executed by the worker.

## 1. Pipeline overview

```text
runReview(runId)
  1. RESOLVING_COMMIT   branch → exact SHA (pin once)
  2. FETCHING_SNAPSHOT  tarball at SHA → temp dir (filtered)
  3. MAPPING_PROJECT    build ProjectMap (deterministic)
  4. SELECTING_CONTEXT  planner LLM call (personas + files + keywords) → deterministic expansion → budget
  5. REVIEWING          2–3 persona LLM calls (sequential, rate-limited)
  6. VALIDATING         evidence check, downgrade/drop, within-run dedupe
  7. SUMMARIZING        one synthesis LLM call (summary / answer / verdict)
  8. SAVING             persist findings, link to existing, update project
  finally: cleanup snapshot
```

Each stage updates `ReviewRun.stage` and `heartbeatAt` (via `progress.ts`). Any thrown error → `status=FAILED`, `error` = user-safe message (log full error to console). Never leave partial findings: write all findings in one Prisma transaction in SAVING.

`RECHECK` and `RELEASE` reuse stages 1–3 and differ afterwards (sections 9 and 10).

## 2. Review type configuration (`src/lib/review/types.ts`)

```ts
const REVIEW_TYPES = {
  PROJECT_HEALTH: { needsInput: false, usesDiff: false, defaultPersonaHint: null },
  LATEST_CHANGES: { needsInput: false, usesDiff: true },
  ASK:            { needsInput: "question", usesDiff: false, producesAnswer: true },
  PROPOSAL:       { needsInput: "brief",    usesDiff: false, producesAnswer: true },
  ISSUE:          { needsInput: "symptom",  usesDiff: false, producesAnswer: true },
  RELEASE:        { needsInput: false, usesDiff: false, producesVerdict: true },
  RECHECK:        { needsInput: "targetFindingIds", usesDiff: true },
};
```

Input fields (validated with Zod at enqueue time, max lengths in brackets):
- ASK: `question` [2000], optional `constraints` [2000]
- PROPOSAL: `brief` [4000], optional `constraints` [2000]
- ISSUE: `symptom` [2000], optional `expected` [1000], `actual` [1000], `log` [8000]
- PROJECT_HEALTH / LATEST_CHANGES: optional `focus` [1000]
- LATEST_CHANGES: optional `baseSha` (defaults to `project.lastReviewedSha`)

## 3. Stage 1 — Resolve commit

- `commitSha = getBranchHeadSha(run.branch)`; save to run immediately; also update `project.latestKnownSha`.
- LATEST_CHANGES: `baseSha = input.baseSha ?? project.lastReviewedSha`. If null → fail fast with a friendly message: "No previous review baseline. Run a Project Health review first." (UI also prevents this — see 06.) If `baseSha === commitSha` → complete the run with summary "No new commits since the last reviewed commit." and no LLM calls.

## 4. Stage 2–3 — Snapshot and Project Map

### Filters (`src/lib/repo/filters.ts`)

- **Ignored dirs:** `node_modules`, `.git`, `dist`, `build`, `out`, `.next`, `.nuxt`, `.turbo`, `.vercel`, `coverage`, `vendor`, `.cache`, `__pycache__`, `.venv`, `target`, `bin`, `obj`.
- **Ignored files:** lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`), `*.min.js`, `*.map`, images/fonts/media/archives/pdf, `*.snap`.
- **Secret files (never read, listed as excluded "secret"):** `.env`, `.env.*` (but allow `.env.example`/`.env.sample`), `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `*.keystore`, `credentials.json`, `service-account*.json`, `.npmrc`, `.netrc`.
- **Binary detection:** null byte in first 8KB → excluded "binary".
- **Size:** files > 200KB → excluded "too_large".

### Redaction (`src/lib/repo/redact.ts`)

Before any file content goes into a prompt, replace matches with `[REDACTED_SECRET]`: AWS keys (`AKIA[0-9A-Z]{16}`), GitHub tokens (`gh[pousr]_[A-Za-z0-9]{36,}`, `github_pat_…`), Anthropic/OpenAI style keys (`sk-[A-Za-z0-9_-]{20,}`), Slack tokens (`xox[baprs]-…`), Stripe (`sk_live_…`, `rk_live_…`), private key blocks (`-----BEGIN … PRIVATE KEY-----…-----END … PRIVATE KEY-----`), JWT-looking strings, and generic `(password|secret|api[_-]?key|token)\s*[:=]\s*["'][^"']{8,}["']` (keep the key name, redact the value). Keep line count unchanged so line numbers stay valid. Record `limitations: "N possible secrets redacted"` when N > 0 (no values).

### ProjectMap (`src/lib/repo/mapper.ts`, deterministic, no AI)

```ts
type ProjectMap = {
  commitSha: string;
  fileCount: number;
  tree: { path: string; size: number }[];      // filtered files only
  languages: Record<string, number>;           // by extension, file counts
  stack: string[];                             // e.g. ["nextjs","react","typescript","prisma","tailwind"]
  packageManifests: { path: string; name?: string; dependencies: string[]; devDependencies: string[]; scripts: Record<string,string> }[];
  configFiles: string[];                       // tsconfig, next.config.*, docker*, prisma/schema.prisma, .github/workflows/*, vercel.json, etc.
  testFiles: string[];                         // *.test.*, *.spec.*, __tests__/**, tests/**, e2e/**
  ciFiles: string[];                           // .github/workflows/*.yml, .gitlab-ci.yml, etc.
  entryPoints: string[];                       // app/**/page.tsx, app/**/route.ts, pages/**, pages/api/**, src/index.*, server.*, middleware.*
  usesAI: boolean;                             // deps include openai, @anthropic-ai/sdk, langchain, ai, @google/generative-ai, llamaindex, etc.
  primarySupported: boolean;                   // true if JS/TS is the majority language
};
```

Stack detection = dependency name lookup table (next, react, vue, svelte, express, fastify, nestjs, prisma, drizzle-orm, mongoose, typeorm, sequelize, tailwindcss, jest, vitest, playwright, cypress, stripe, next-auth/@auth/*, supabase, firebase …). Save the map to `project.projectMap`.

If `primarySupported` is false, add limitation: "Primary language is not JavaScript/TypeScript; review depth is limited." Continue the run anyway.

For prompts, render a **compact text form** of the map: stack, manifests (deps names only), config/test/CI files, entry points, and the directory tree truncated to ~400 lines (collapse deep dirs as `dir/ (N files)`).

## 5. Stage 4 — Context selection

### 5a. Planner call (one LLM call, role `light`)

Input: review type, compact ProjectMap, user input (as data), list of open findings (id, title, persona, paths) — titles only, and for LATEST_CHANGES the list of changed files with +/- counts.

Output (`PlannerOutput` schema in 05):
- `personas`: 1–3 persona keys, ordered by relevance (code caps to `MAX_PERSONAS_PER_RUN`).
- `files`: up to 30 repo paths to read, ranked.
- `keywords`: up to 10 identifiers/terms to grep for.
- `reason`: short text (stored nowhere important; log only).

Post-process deterministically:
- Drop unknown persona keys and paths not in the tree.
- Add `ai_ml` persona only if `projectMap.usesAI` or the user input mentions AI/LLM/model/prompt; never by default otherwise.
- If planner returns no personas, fall back by type: HEALTH → `architecture, security, quality`; CHANGES → `quality, security, code_quality`; ASK → `architecture`; PROPOSAL → `architecture, product_ux`; ISSUE → `reliability, quality`.

### 5b. Deterministic expansion (`src/lib/repo/search.ts`, `imports.ts`)

Starting from planner files (+ for LATEST_CHANGES: all changed files that pass filters, first):
1. **Keyword search:** case-sensitive substring/regex search over text files; add up to 3 files per keyword (prefer non-test files).
2. **Imports (one hop):** parse `import … from '…'`, `export … from '…'`, `require('…')`, dynamic `import('…')` with a regex. Resolve relative paths and `tsconfig.json` `compilerOptions.paths` aliases (e.g. `@/*`). Try extensions `.ts,.tsx,.js,.jsx,.mjs,.cjs` and `/index.*`. Add resolved local files.
3. **Importers (LATEST_CHANGES only):** files that import a changed file (grep for the module path basename), up to 10.
4. **Tests:** for each selected source file `x.ts`, add `x.test.ts` / `x.spec.ts` / `__tests__/x.*` if present.
5. **Always include** (small, high value): root `package.json`, `tsconfig.json`, `prisma/schema.prisma` if present, `middleware.ts` if present.

### 5c. Budget (`src/lib/repo/context.ts`)

- Estimate tokens = `Math.ceil(chars / 4)`.
- Budget = `AI_REVIEW_MAX_INPUT_TOKENS` minus fixed overhead (map + diff + input + instructions; compute it).
- Add files in priority order: changed files → planner-ranked files → always-include → imports → keyword hits → tests. Skip files that don't fit; record them as excluded with reason `budget`.
- A single file larger than 25% of budget is truncated to its first N lines that fit, with a marker `… [truncated: lines X–Y omitted]` and a limitation entry.
- Diff (LATEST_CHANGES/RECHECK): include unified patches from the compare API, capped at 30% of budget; truncate per file if needed.

### 5d. ContextBundle format (rendered into the prompt)

```xml
<project_map> …compact map… </project_map>
<review_snapshot repo="owner/name" branch="main" commit="abc1234…" />
<diff base="…" head="…"> per-file patches </diff>              <!-- only if usesDiff -->
<repository_file path="src/lib/split.ts" lines="1-120">
1| import Decimal from "decimal.js";
2| …
</repository_file>
…
<excluded_files> path (reason) … </excluded_files>
<prior_findings> id | title | persona | paths | status </prior_findings>   <!-- open findings touching included files -->
<developer_input> …user text, verbatim… </developer_input>
```

Every file line is prefixed with its 1-based line number and `| `. This is what makes evidence citation checkable.

## 6. Stage 5 — Persona calls

- For each selected persona, call `callJson({ role: "review", task: `persona.${key}`, reviewType: run.type, schema: PersonaOutput })` (05 §1). Planner/synthesis/recheck calls pass `task: "planner" | "synthesis" | "recheck"` the same way, so optional task routes (05 §1.7) apply.
- Prompt layout: `system` = shared rules + JSON instructions; `user` = ContextBundle + persona brief + review-type task text. The same ContextBundle is reused for every persona in the run (built once).
- Each call goes through the multi-model fallback chain (05 §1.6); store the returned `model`/`tier` on resulting findings and set `run.degraded` when `tier > 0`.
- Run persona calls **sequentially** (free-tier rate limits). The client's rate limiter spaces requests; while it waits, set `personaStatus[persona] = "waiting_rate_limit"` so the UI can show "Waiting for AI rate limit…".
- Update `personaStatus[persona]` as each starts/finishes. If one persona fails after SDK retries, mark it `failed`, add limitation "X reviewer failed", continue with the others. If all fail → run FAILED.

## 7. Stage 6 — Validation (`src/lib/review/validate.ts`) — the "Evidence Arbiter" (deterministic)

For every finding from every persona:

1. **Evidence check**, per evidence item:
   - `path` must exist in the snapshot and must have been included in the context (the model can't cite what it didn't see). Otherwise drop the item.
   - `startLine ≤ endLine`, both within file length. Clamp `endLine - startLine` to max 29.
   - Compare `quote` (model's quoted code) to the actual lines with whitespace-normalized substring match. If no match, search ±10 lines around for the quote and re-anchor; if still no match, drop the item.
   - Replace the model's quote with the **actual snapshot lines** → `EvidenceItem.snippet`. Attach `commitSha`.
2. **Finding-level rules:**
   - No valid evidence and no `userPremise` → drop the finding (log count as "N unsupported findings removed"; put count in coverage limitations).
   - No valid evidence but has `userPremise` (PROPOSAL/ISSUE) → keep, classification forced to `DESIGN_CONCERN` or `POTENTIAL_RISK`, confidence max `MEDIUM`.
   - `VERIFIED_DEFECT` is allowed only if evidence is valid **and** confidence is `HIGH`; else downgrade to `POTENTIAL_RISK`. (MVP never executes code, so "verified" means conclusive static evidence.)
   - `CRITICAL` severity with confidence `LOW` → downgrade severity to `HIGH`.
   - Truncate options to 3; drop `recommendation.optionIndex` if out of range.
   - `existingFindingId` must be an id from the `<prior_findings>` list; else set null.
3. **Within-run dedupe (`dedupe.ts`):** two findings are duplicates if they share a primary evidence path and their line ranges overlap, **and** their normalized titles share ≥ 50% of words (lowercase, stopwords removed). Merge: keep the higher severity, union evidence (unique by path+range), keep the more complete options list, record `persona` of the kept one, and note the other persona in the observation's end: "(Also raised by: Security Adversary)".
4. Sort: severity desc, then confidence desc. Keep max 15 findings per run; extra → limitation "N lower-priority findings omitted".

An **AI arbiter call is out of scope for MVP** (see 10). Conflicts are visible to the user through "Also raised by" and per-persona details.

## 8. Stage 7–8 — Synthesis and save

**Synthesis** (one call, role `light`, `SynthesisOutput` schema): input = review type, developer input, validated findings (title, severity, classification, persona, paths — no code), each persona's `summary` and `answer`, coverage limitations. Output = `summary` (markdown, ≤ 200 words), `answer` (markdown, for ASK/PROPOSAL/ISSUE; must reference only file paths present in findings/context), and for RELEASE the verdict fields (section 10). No new findings may be created here.

**Save** (single transaction):
- For each finding with valid `existingFindingId`: update that finding's `lastSeenRunId`, `lastSeenSha`, refresh `evidence`, keep user-controlled fields (`status`, `chosenOptionIndex`, `statusNote`). If its status was `RESOLVED`, set it back to `OPEN` and create a `FindingCheck` with `STILL_PRESENT` ("reappeared in run X").
- Otherwise create a new `Finding` with `firstSeenRunId = lastSeenRunId = run.id`.
- Update run: `personas`, `coverage`, `summary`, `answer`, `usage`, `status=COMPLETED`, `stage=DONE`, `finishedAt`.
- Update project: `lastReviewedSha`, `lastReviewedAt` (non-RECHECK only), `projectMap`.

## 9. RECHECK runs (`src/lib/review/recheck.ts`)

Triggered by "Re-check on latest commit" on a finding (or "Re-check selected" in Risk Center, max 5 findings).

1. Resolve `commitSha` (branch head). If it equals every target finding's `lastSeenSha` → complete immediately: "No new commits since this finding was reviewed."
2. Snapshot at `commitSha`. `baseSha` = target finding's `lastSeenSha` (when multiple findings, compute diff per distinct base; usually one).
3. For each finding: context = its evidence files at the new SHA (if a file was renamed per compare, follow `previous_filename`), the diff for those files, plus one-hop imports, within budget.
4. One `RecheckOutput` call per finding (role `light` if the context fits its budget, else `review`), using the **persona that raised it** (persona brief + recheck task). Output: `result` (`RESOLVED | STILL_PRESENT | PARTIALLY_RESOLVED | UNVERIFIABLE`), `reasoning`, `evidence[]`.
5. Validate evidence like section 7. Rule: `RESOLVED` requires either (a) the cited code is gone/changed in the diff, or (b) valid evidence of the fix at the new SHA; otherwise downgrade to `UNVERIFIABLE`. If all evidence files were deleted and the model can't show the logic moved → `UNVERIFIABLE`.
6. Store `FindingCheck`. Update finding: `RESOLVED` → status `RESOLVED`; `STILL_PRESENT`/`PARTIALLY_RESOLVED` → keep status (if `IN_PROGRESS` stays), update `lastSeenSha`, `evidence`; `UNVERIFIABLE` → no status change.
7. RECHECK does not update `project.lastReviewedSha`.

## 10. RELEASE runs (`src/lib/review/release.ts`)

1. Stages 1–3 as normal (user may choose a branch other than the selected one in Release Gate; default selected branch head).
2. Collect deterministic evidence: `getCiEvidence(sha)`, presence of test files/CI config from ProjectMap, open findings (status OPEN/IN_PROGRESS) with severity and classification, and accepted risks.
3. Personas: always `devops` + `quality`, plus `security` if any open HIGH/CRITICAL security finding exists or the project has auth/payment deps (max 3). Context focus: configs, CI files, migrations, env usage, entry points. They produce normal findings (saved like any run).
4. Synthesis produces `verdict`, `conditions[]` (what must be done for Go), `limitations[]`.
5. **Deterministic verdict caps** (applied after synthesis; code wins):
   - Any open `CRITICAL` finding, or any open `HIGH` `VERIFIED_DEFECT` → at most `NO_GO`.
   - Any open `HIGH` finding, failing CI checks, or no test files at all → at most `CONDITIONAL_GO`.
   - CI evidence unavailable → add limitation "No CI results available for this commit."
6. Save `verdict`, `releaseReport = { conditions, blockingFindingIds, ciEvidence, limitations }`.
7. The UI always shows: "Advisory only. You decide whether to ship."

## 11. Worker (`src/worker/index.ts`)

```ts
loop every 2s while running:
  if activeJobs < WORKER_CONCURRENCY:
    id = claimNextRun()     // raw SQL below
    if id: activeJobs++; runReview(id).finally(() => activeJobs--)
on startup:
  mark RUNNING runs with heartbeatAt < now()-10min as FAILED ("Worker restarted during review")
  delete stale temp snapshot dirs
handle SIGINT/SIGTERM: stop claiming, wait for active jobs (max 60s), exit
```

```sql
UPDATE "ReviewRun" SET status='RUNNING', "startedAt"=now(), "heartbeatAt"=now()
WHERE id = (
  SELECT id FROM "ReviewRun" WHERE status='QUEUED'
  ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED
) RETURNING id;
```

Heartbeat: update `heartbeatAt` at each stage change and every 30s during LLM calls.

Cancellation: `POST /api/runs/:id/cancel` sets `status=CANCELLED` if QUEUED; if RUNNING, the engine checks status between stages and stops (no findings saved).

## 12. Usage accounting

Accumulate prompt/completion tokens (estimated when the provider omits them), call count, retries, and the models actually used into `run.usage`. Display total tokens and wall time in run details (small, muted). `limits.ts` counts runs created by the user in the last 24h (excluding FAILED with no LLM calls) and rejects enqueue beyond `MAX_REVIEWS_PER_USER_PER_DAY` with HTTP 429 and a clear message.
