# Changelog

One entry per completed phase of `dev-plan/08_implementation_phases.md`.

## The review board, made visible

Users can now see the full board (nine core specialists, the conditional AI/ML Auditor and the Evidence Arbiter) and what each one concluded.

- **Engine records the board's work** in `ReviewRun.coverage.board` (JSON, no migration): the planner's selection reason (previously discarded; RELEASE runs get a fixed explanation), whether a default selection was used, the Evidence Arbiter's tally (proposed, removed for unmatched citations, weak citations dropped, duplicates merged, cut by cap, kept), and where specialists independently raised the same issue. Each specialist report also carries `raised`, `unsupported` and `citationsDropped`. Older runs simply lack these fields and the UI degrades gracefully.
- **Review page**: a "Review board" section with a flow from each specialist through the Evidence Arbiter to the kept findings. Selecting a seat shows its statement in its own words, its stance, its numbers, the findings it raised (linked to their evidence), the model used, and agreements with other specialists. Members not seated for this review are listed too.
- **Stances** ("Flags serious issues", "Has concerns", "Signs off") are derived from each specialist's findings that passed evidence checks; specialists do not vote, and the UI says so.
- **Live review**: each seated specialist shows its identity mark, focus and live state; the rest of the board is shown as not seated.
- **Overview**: "The board" strip with every seat and its open-finding count. **Release Gate**: "Assessed by" with each specialist's stance and statement. Findings show their specialist's mark wherever they are attributed.
- Engine test asserts the board tally is consistent with the per-specialist counts.

## Frontend rebuild — gold/umber design system

The previous indigo "console" design was replaced from scratch. Data access, API calls and behaviour are unchanged.

- **Design rules**: no glass/blur, no glows or coloured shadows, no accent stripes on containers, radius ≤ 6px (every radius token is capped). Separation comes from whitespace and type weight; boxes are rare.
- **Tokens**: brand swatch `#E1C802 → #412201`; near-white/umber light theme and deep-umber dark theme, toggled with a circular View Transition reveal. Type: Bricolage Grotesque (display), Instrument Sans (body), JetBrains Mono (code and SHAs only).
- **Calmer views**: header folds branch freshness into one popover; Risk Center filters live in one popover with removable chips and status tabs; status changes are one menu; decisions open as a read view with inline Edit; optional form fields sit behind "More detail".
- **Motion** (`src/components/motion/`, `motion` package): route transitions, scroll reveals, sliding tab/segment indicators, animated disclosures, count-ups, a header that hides its top row on scroll with a reading-progress line, and a cursor-following ring. All respect `prefers-reduced-motion`; the cursor ring is off for touch.
- **Visuals** (`src/components/visuals/`): release verdict gauge, review-board network (live per-specialist state while running; finding counts after), review pipeline flow, finding lifecycle flow, Overview file hotspots (`riskHotspots` query), fix effort meter, and a 3D tilt on the sign-in illustration.
- Fixed while verifying: the Risk Center page called a client-module function from the server (`riskHref` now lives in `src/lib/risk-href.ts`).

## Final review pass — logic audit, prompt review, frontend redesign

An independent logic audit and prompt review were run over the finished prototype. Every confirmed issue was fixed.

**Logic fixes**
- Re-check could record RESOLVED without proof when the cited code contained a redacted secret: the stored snippet is redacted but was compared against the raw file. It now compares against the redacted file.
- `diffTouchesRange` misread changed lines starting with `--`/`++` (e.g. SQL comments, `++i`). It now treats every line inside a hunk as content.
- `lastSeenSha` now moves only together with fresh evidence (re-check and repeat sightings), so stored line numbers always belong to the stored commit.
- Reopening a RESOLVED finding re-reads its status inside the save transaction, so a status the user sets mid-review is never overwritten.
- Each persona's findings are validated against the context bundle that persona actually saw, so a mid-run context shrink no longer discards earlier valid evidence. Coverage lists the union of the files seen.
- Linking to earlier findings considers up to 500 prior findings instead of 50, so older issues are linked or reopened rather than duplicated.
- A provider error on the JSON repair call now applies its cooldown and falls back, instead of counting as invalid output.
- Enqueue also takes a per-user advisory lock, so parallel requests can't exceed the daily limit.
- The recommendation index is remapped when empty-titled options are dropped.
- The project map is written in the SAVING transaction, and only by non-RECHECK runs on the selected branch.
- Switching branches clears the old branch's `lastReviewedSha`, which was not a valid Latest Changes baseline for the new branch.

**Prompt and accuracy improvements**
- Validator: un-escapes `<\/` (JSX closing tags shown escaped to the model), accepts quotes copied from the diff (strips `+`/`-` markers), and outside ±10 lines anchors a quote that occurs exactly once in the file. NOTE: this goes beyond the plan's ±10.
- Planner: partial paths ("route.ts") resolve to a unique full path, and the prompt explains how to read the indented tree.
- Shared rules:
  - Precise quoting rule: 1–3 lines copied exactly, no "...", don't cite diff lines.
  - Severity and confidence scale.
  - `<developer_input>` is described as the question to answer, not as instructions.
- A closing evidence reminder is added to every reviewer and re-check prompt.
- Schema field descriptions (path, lines, quote, 0-based optionIndex, userPremise); `evidence` now comes before `observation`.
- Task texts: ISSUE reports causes as findings with checks, ASK doesn't turn answers into findings, RELEASE doesn't give its own verdict, and synthesis only adds new limitations.
- Context size:
  - Reviewers get a 150-line tree (was 400), leaving more budget for code.
  - Re-checks get no tree, so they fit the light model.
  - Old evidence in re-checks is shown without citable line prefixes.

**Frontend redesign**
- New design system: dark-first indigo/violet "engineering console" theme with light mode. Glass surfaces, a soft brand glow with a dot grid, gradient accents, and `surface` / `edge-glow` / `live-dot` / `eyebrow` utilities.
- Fixed a pre-existing bug where the Geist font never applied: `--font-sans` pointed at itself, so the app rendered in a serif fallback.
- New brand mark. A sticky translucent project header holds the freshness chips and icon tabs with a gradient active indicator.
- A consistent `PageHeader` (eyebrow · icon · title · description · actions) on every tab and on Settings.
- Sign-in page rebuilt as a hero with an illustrative review-board preview. The projects page has richer cards and a guided empty state.
- Overview health panel: severity distribution bar and accent-striped stat tiles. Last review excludes release checks.
- Review Lab: type cards with an active glow; finding cards with a severity accent stripe; live progress stepper with a pulsing indicator; VerdictCard with a No-Go → Go meter.
- Review Lab and Release Gate show "a review is running — view progress" and disable Start, instead of failing with 409.
- Default theme is now dark (toggle in the header).

## Phase 9 — Overview, polish, hardening

- **Overview** (DB reads only): health strip (open Critical/High/Medium/Low, accepted risks, resolved — each links into a filtered Risk Center), top 5 open risks, last review card (type, commit, time, summary clamped to 6 lines), unresolved (PROPOSED) decisions, latest release verdict, and a "Review now" button. The never-reviewed empty state offers "Run first Project Health review".
- **States**: `loading.tsx` (skeletons), `error.tsx` (inline alert + Try again) and `not-found.tsx` for every project page. The `PhasePlaceholder` component is gone.
- **Access-lost banner**: a red banner under the project header when the most recent finished run failed with the GitHub access-lost message, with links to manage access on GitHub and to Settings.
- **Security pass** (code review):
  - Every API route calls `requireUser()` plus an owner-scoped `requireProject/Run/Finding/Decision` (or the user's own GitHub token).
  - Every `/p/[projectId]` page uses `requirePageProject`, and child lookups are project-scoped.
  - Snapshot cleanup runs in `finally` and at worker startup.
  - Markdown uses `skipHtml` with no `rehype-raw`.
- **Fix from the security pass**: unexpected errors (engine, worker, API routes) are now logged through `describeError()` — name, the first line of the message, and stack frames. Previously they were logged in full, and some error types (e.g. Prisma validation errors) echo their arguments, which could contain repository snippets.
- README finalised: build status, what happens after a review, data handling (what is and isn't logged), and limitations.

**Choices where the plan left room (please review):**

- The access-lost banner is derived from the latest run's error rather than a new database column, so it clears after the next successful run. Check for Updates still shows its own 403 inline.

**Deferred (per your "prototype first, test later" request):**

- The planned authz test that iterates every project-scoped route as a foreign user (09 §2) was not written; the routes were checked by reading the code instead.
- The manual QA checklist (09 §4) and the real-repo quality checks (09 §3, `tests/fixtures/RESULTS.md`) are still to do. They need `GEMINI_API_KEY` in `.env` and a test GitHub repo.

## Phase 8 — Release Gate

- `getCiEvidence(ref, sha)` in `src/lib/github/repo.ts`: check runs plus legacy commit statuses, combined into success / failure / pending / none. On 403/404 it returns `{ unavailable: true }` and never fails the run. If the call errors in any other way, the engine treats CI as unavailable too.
- `src/lib/review/release.ts`:
  - Personas: always DevOps + Quality, plus Security when an open high/critical security finding exists or the stack uses auth or payments (NextAuth/Auth.js, Clerk, Stripe, Supabase, Firebase). Capped by `MAX_PERSONAS_PER_RUN`.
  - Deterministic context focus: CI files, config files, the 10 newest migrations, entry points, and `process.env` usage.
  - `<release_evidence>` text for synthesis.
  - **Verdict caps, applied after synthesis (code wins):** open CRITICAL or open HIGH verified defect → No-Go; open HIGH, failing CI or no test files → at most Conditional Go. No AI verdict defaults to Conditional Go. No CI results add the "No CI results available for this commit." limitation. Code-generated conditions name failing checks, missing tests and each blocking finding.
- Engine: RELEASE uses the normal pipeline, with no planner call (its routing is fixed). It saves findings like any review. The caps are applied inside the SAVING transaction against the open findings after this run's findings are stored, and `verdict` plus `releaseReport` (conditions, blocking finding ids, CI evidence, tests present, accepted risks, limitations) are written.
- Enqueue: RELEASE may name a branch other than the selected one; the branch is verified on GitHub first. Other review types always use the selected branch.
- UI:
  - Release Gate page: branch selector, the same data notice / "I understand" as Review Lab (now a shared `data-notice.tsx`), and "Assess release readiness".
  - Latest-assessment **VerdictCard**: large Go / Conditional Go / No-Go, commit, conditions, blocking findings linked to the Risk Center, CI checks with conclusions or "unavailable", tests present, accepted risks, limitations, and the fixed advisory disclaimer. An "Assessment is for an older commit" note appears when it no longer matches the latest known commit.
  - A history table on the Release Gate page.
  - Release run pages show the VerdictCard above the normal result, link back to Release Gate, and "Try again" keeps the assessed branch.
- No new automated tests in this phase (prototype-first, per your request). The existing engine test's dependency stub got the new `getCiEvidence` field.

**Choices where the plan left room (please review):**

- Release assessments skip the planner LLM call, which saves free quota, because their specialists and focus files are fixed by the plan.
- A release check of a branch other than the selected one doesn't change the header's "last reviewed" commit.
- Conditions = the code's conditions first, then the AI's (deduplicated, max 10 from the AI).

## Phase 7 — Decision Ledger

- Decision APIs: `POST /api/projects/:id/decisions`, `PATCH` / `DELETE /api/decisions/:id`, `POST /api/decisions/:id/supersede`. All owner-scoped (404 otherwise) and Zod-validated (`src/lib/decisions/service.ts`). Linked findings from another project are rejected with 400.
- Supersede runs in one transaction: it creates the replacement and sets the old decision to SUPERSEDED with `supersededById`. Superseded decisions are read-only and link both ways ("Replaced by …" / "Supersedes …").
- Pages: the ledger list with a status filter, `/decisions/new` (blank, `?findingId=` prefill, or `?supersede=<id>`), and a detail/edit page with linked findings, Supersede and Delete.
- DecisionForm covers title, context, chosen option, rationale, alternatives (title + why not), constraints, assumptions, related files, a linked-findings picker, status and commit.
- Solution Lab "Choose this option" opens the prefilled DecisionForm (`src/lib/decisions/draft.ts`). Prefill: title = finding title; alternatives = the other options with their cons as "why not"; related files from the evidence; the finding linked; commit = the finding's last-seen SHA. The user can edit and save, or skip.
- The finding detail page lists linked decisions. Overview now shows PROPOSED decisions; the rest of Overview is still phase 9.
- No new automated tests in this phase (prototype-first, per your request).

## Phase 6 — Risk Center, Solution Lab, Re-check

- Risk Center: filters live in the URL searchParams (status (default Open + In progress), severity multi-select, persona, classification, text search over title/observation, case-insensitive). The filter form is a plain GET form. The table has row checkboxes and "Re-check selected (max 5)", and links each row to the finding.
- Finding detail: badges, persona, first/last seen commits (linked to GitHub), observation, impact, a labelled user premise, evidence blocks linked to GitHub at the SHA, options, verification steps, status actions, Re-check, the latest check result, and a history timeline of checks and linked decisions. Also "Compare fixes →".
- `PATCH /api/findings/:id` (`src/lib/findings/status.ts`): accepting a risk, dismissing, and manual resolve all require a note. Manual resolve is stored as `[manual] …` and always shown as "Resolved by you (not verified)". Choosing an option is validated against the finding's options.
- Solution Lab: a searchable picker of open findings; option columns (pros/cons/effort, recommended one highlighted with rationale, chosen marker); "Choose this option" sets `chosenOptionIndex` and IN_PROGRESS; verification steps with a Re-check button. No AI on this page.
- RECHECK (`src/lib/review/recheck.ts`, `prompts/recheck.ts`, `POST /api/findings/recheck`): same 409/429 rules as reviews. Steps:
  1. Pin the head SHA, and finish instantly with "No new commits since this finding was reviewed." if nothing changed.
  2. Download a snapshot and compare per distinct base.
  3. For each finding, follow renames and deletions, then build context from the cited files at the new SHA, their diff, one-hop imports, and a symbol search (to find moved logic).
  4. Make one call per finding with the persona that raised it: role `light` if the cited files fit whole, else `review`.
  5. Validate the evidence like any review.
- Deterministic re-check rules: RESOLVED needs the cited code to be changed or gone (from the diff hunks, or the old snippet missing from the new file) or valid evidence of the fix; otherwise it becomes UNVERIFIABLE with an explanatory note. If every cited file was deleted and nothing shows the logic moved, the result is UNVERIFIABLE. Premise-only findings are UNVERIFIABLE without an AI call.
- Saving: a FindingCheck for each result. RESOLVED sets status RESOLVED. STILL_PRESENT and PARTIALLY_RESOLVED update `lastSeenSha` and the evidence and keep the status. RECHECK never touches `lastReviewedSha`.
- Re-check buttons poll the run and refresh the page when it is done, so the result shows inline. The bulk re-check goes to the run page, which now has a re-check result view, and "Try again" works for failed re-checks.
- The run page's finding cards link to the Risk Center detail ("Open in Risk Center").
- No new automated tests in this phase (prototype-first, per your request).

**Choices where the plan left room (please review):**

- A finding you marked resolved by hand that a re-check finds STILL_PRESENT is reopened (OPEN). Findings with other statuses keep their status.
- A re-check doesn't change `lastSeenRunId` (that stays "the last review that reported it"); it updates `lastSeenSha` when the issue is still present.
- In a multi-finding re-check, a finding already reviewed at the head commit is skipped, with a limitation, rather than getting a check.
- Manual decisions default to ACCEPTED. REVERTED can only be set when editing; SUPERSEDED only through Supersede.
- Deleting a decision clears `supersededById` on decisions that pointed to it; they stay SUPERSEDED.

## Phase 5 — Ask, Proposal, Issue review types

- Task texts for every review type (`src/lib/ai/prompts/tasks.ts`). Developer input is rendered as labelled plain text inside `<developer_input>` (escaped), and never placed in the system message.
- Personas return an `answer` for ASK / PROPOSAL / ISSUE. Synthesis merges them into one answer. If synthesis fails, the persona answers are shown instead.
- `userPremise` validation: for PROPOSAL and ISSUE, a finding without valid evidence is kept only when it has a premise. Its confidence is capped at MEDIUM and VERIFIED_DEFECT is downgraded (to DESIGN_CONCERN for proposals, POTENTIAL_RISK for issues). Other review types drop such findings.
- `path:line` references in an answer are checked against the files the review saw. Unknown ones add a visible limitation; the answer text itself is not changed.
- RunResult shows the Answer / Assessment / Investigation section, with a "plausible causes, not a reproduction" note for issues. Review Lab marks required fields and disables Start until they are filled; the server enforces the same rules with plain-language errors.

## Phase 4 — Review engine core (Project Health + Latest Changes)

- **AI client** (`src/lib/ai/`): `providers.ts` parses `provider[@alias]:model[|nosys|nojson|max=N]` lists, `GEMINI_API_KEYS` aliases and `@*` expansion. `routes.ts` handles `AI_TASK_ROUTES` / `AI_CUSTOM_PROVIDERS`. `ratelimit.ts` spaces requests per (key, model). `fallback.ts` covers the 05 §1.6 error table, cooldowns, and the US-Pacific-midnight quota reset (DST-safe). `client.ts` provides `callJson`: JSON mode, fence stripping, schema-driven `normalize()`, one repair call, truncation retry, a retry without `response_format`, 429 back-off, waiting when every model is briefly limited, per-key 401 cooldown, a budget guard, and usage plus model/tier/degraded reporting. `transport.ts` is the only file that touches the `openai` package (used purely as an HTTP client, with its own retries disabled).
- Keys never reach logs, errors, the UI or the DB. Logs and `usage.models` show `provider[@alias]:model` only.
- **Prompts**: shared rules, all 10 persona briefs, planner (shrinks the tree 150 → 80 → 40 → none to fit the light budget), synthesis (drops persona answers, then low-severity findings, to fit).
- **Engine stages 4–8** (`src/lib/review/engine.ts`): planner with deterministic post-processing (`plan.ts`) and per-type fallback personas; context expansion and one bundle shared by every persona; sequential persona calls with live persona status ("Waiting for AI rate limit…"); one 30% context shrink on "too large"; deterministic evidence validation (`validate.ts`); within-run dedupe, sort and 15-finding cap (`dedupe.ts`); synthesis; and one SAVING transaction (`store.ts`) that links repeats to existing findings and reopens RESOLVED ones with a STILL_PRESENT check.
- `compareCommits` in `repo.ts`. LATEST_CHANGES reviews the diff (changed files first, then importers) and completes instantly, with no LLM calls or download, when there are no new commits.
- `project.lastReviewedSha` / `lastReviewedAt` update on completion, so the header shows them after the run page refreshes.
- RunResult: degraded-run notice, summary, findings (expandable cards with evidence linked to GitHub at the reviewed SHA, options with pros/cons, the recommendation, and verification steps), "no significant issues" state, coverage and limitations, specialist details, and a usage footer.
- `npm run ai:check` checks each provider/key (model list), each entry (a direct JSON ping) and routes, and suggests unlisted Gemini models.
- Tests: 125 new (278 total). Unit tests cover providers, routes, rate limiter, fallback (sample Gemini per-minute and per-day bodies, DST), `callJson` (every case in the phase 4 acceptance list), validator, dedupe, planner post-processing, prompt budgets and input schemas. DB-backed engine tests run against a separate `athenyx_test` database with a mocked LLM and GitHub and a real fixture snapshot.

## Phase 3 — Run queue, worker, Review Lab

Phase 3 had not been implemented, and phases 4–5 depend on it, so it was built first.

- `POST /api/projects/:id/runs`: validates input per type, returns 409 when a run is already active (made race-free with a per-project advisory lock), 409 for LATEST_CHANGES with no baseline, and 429 at the daily limit. Also `GET /api/projects/:id/runs`, `GET /api/runs/:id` and `POST /api/runs/:id/cancel`, all owner-scoped (404 otherwise). `requireRun` added to `authz.ts`.
- Worker (`src/worker/index.ts`): 2-second poll, `FOR UPDATE SKIP LOCKED` claim, `WORKER_CONCURRENCY`, and stale-run recovery at startup and every minute (heartbeat older than 10 minutes → FAILED, "Worker restarted during review"). It also cleans leftover snapshots at startup and shuts down gracefully on SIGINT/SIGTERM, waiting up to 60s.
- Cancellation is checked between stages and before saving. A cancelled run saves nothing.
- Review Lab: five review-type cards, a form per type, a data notice that names the configured providers (role chains plus matching routes) with terms links, a first-time "I understand" checkbox, Start Review, and recent runs. Run page: live progress (stage stepper, pinned SHA, persona chips, Cancel), Try again for failed runs, and a cancelled state.

**Choices where the plan left room (please review):**

- `package.json` now has `"type": "module"`. Without it, `tsx` loads the worker as CommonJS, and Octokit's ESM-only dependencies fail to load. The worker could not start at all before this change. `next build`, lint, typecheck and tests all pass with it.
- The daily limit counts only active runs and runs that made at least one LLM call. So, beyond the plan's "FAILED with no LLM calls", early cancellations and "no new commits" runs don't use up a review either.
- Deterministic link safety net: when a free model forgets `existingFindingId`, a new finding is still linked to a prior finding that has overlapping primary evidence and a similar title. This prevents duplicates across runs.
- `<prior_findings>` lists prior findings of every status (with the status shown), not only open ones. This lets dismissed or resolved issues be recognised as repeats.
- Title similarity for dedupe uses shared words ÷ the shorter title's word count.
- Per-persona summaries are stored in `ReviewRun.coverage.specialists`, because the schema has no other column for them.
- If synthesis fails, the run still completes with the specialists' own summaries and answers (plus a limitation), rather than losing validated findings.
- RELEASE can't be enqueued yet (400, "not available yet"); it arrives with Release Gate in phase 8. Finding cards expand inline, and the "Open → Risk Center" link arrives with the finding detail page in phase 6.

**Needs you (not doable without your accounts):**

- Add a free Gemini key (`GEMINI_API_KEY`) to `.env`. `npm run ai:check` currently stops with "GEMINI_API_KEY or GEMINI_API_KEYS is not set".
- The real-repo acceptance checks need the fixture pushed to a private test GitHub repo, then a Project Health run, a second commit that fixes `lib/split.ts`, and a Latest Changes run, with results recorded in `tests/fixtures/RESULTS.md` (09 §3). These are: ≥ 2 seeded issues found with correct lines; no duplicates on a second run; and the Ask / Proposal / Issue answers.

## Phase 2 — Snapshot, filters, redaction, project map

- `src/lib/github/snapshot.ts`: downloads the tarball at an exact SHA into `${os.tmpdir()}/athenyx/<runId>`, aborts above `MAX_SNAPSHOT_MB`, extracts safely, and always cleans up. During extraction, only regular files and directories are written. Symlinks, hardlinks, devices and entries that resolve outside the target are refused and counted as a limitation. Ignored, secret and >200KB files are never written to disk. A bound on total extracted bytes guards against archives with huge file counts. Also includes `cleanupStaleSnapshots()` for worker startup (phase 3).
- `src/lib/repo/filters.ts`: ignored dirs/files, secret files (`.env.example` / `.env.sample` allowed), binary detection, 200KB size limit, test-path convention.
- `src/lib/repo/files.ts`: walks an extracted snapshot, applies the filters, and merges exclusions recorded during extraction (one entry per ignored directory). Loads readable text once for the later stages.
- `src/lib/repo/redact.ts`: AWS, GitHub, `sk-…`, Slack, Stripe, private-key blocks, JWTs, and generic `password/secret/api_key/token = "…"` assignments (the key name is kept). Line count is always preserved, and only counts are reported.
- `src/lib/repo/mapper.ts`: deterministic ProjectMap (stack lookup, languages, manifests, config/test/CI/entry-point detection, `usesAI`, `primarySupported`), plus a compact prompt rendering with the tree capped at 400 lines. Deep directories collapse to `dir/ (N files)`.
- `src/lib/repo/search.ts` and `imports.ts`: literal keyword search (max 3 files per keyword, non-test files first), test-file lookup, one-hop import resolution (relative paths, extensions, `index.*`, `.js`→`.ts`, root tsconfig/jsconfig `paths` with JSONC parsing), and confirmed importers of changed files.
- `src/lib/repo/context.ts`: candidate expansion in budget priority order (changed → planner → always-include → imports → importers → keywords → tests). Builds the ContextBundle with `N| ` line prefixes, `</` escaping in every data block, attribute escaping, a 25% large-file truncation with a marker, a diff capped at 30% of the budget, `budget` exclusions, prior findings filtered to included files, and redacted lines kept for the phase 4 validator.
- Fixture repository `tests/fixtures/sample-next-app/` (24 files) with the seeded issues from 09 §3. It is excluded from the root tsc, ESLint and Vitest runs, and its fake `.env` is un-ignored in `.gitignore`.
- Tests: 131 new (153 total). They cover filters, redaction, mapper, imports, search, context budget and rendering, and snapshot extraction against a hand-built hostile tarball. An end-to-end fixture pipeline test runs tarball → extraction → map → bundle.

**Choices where the plan left room:**

- Keywords from the planner are matched as literal substrings, never compiled as regexes, to avoid ReDoS from model output.
- `tsconfig` `extends` chains are not followed. Only root-level `paths` are read.
- The generic secret rule requires a quoted value of ≥ 8 characters with no whitespace. This avoids redacting UI strings such as `"Enter your password"`.
- The `<excluded_files>` block shows at most 200 entries to the model. Coverage still keeps the full list.

## Phase 1 — Auth, GitHub connection, project shell

- GitHub sign-in with Auth.js v5 (database sessions) using the GitHub App's OAuth credentials; `githubLogin` saved on the user, and account tokens refreshed on every sign-in.
- GitHub library: app/installation/user clients, user access-token refresh (`GithubReauthRequired`), installation + repository listing, branch listing, branch head SHA, and `GithubAccessLost` mapping for 401/403/404.
- Authorization helpers: `requireUser` / `requirePageUser` and `requireProject` / `requirePageProject`. Projects owned by another user return 404, never 403, so ids are not disclosed.
- API routes: list installations; list a repository's branches; create / update / delete a project; check for updates; list a project's branches. Shared `route()` wrapper gives consistent JSON errors and hides internals on 500.
- Pages: `/login`, `/projects` (with empty state), `/projects/new` (install prompt, repository picker with filter, branch picker), the project shell at `/p/[projectId]` (header with project selector, freshness bar, six tabs), the six tab placeholders, and `/p/[projectId]/settings` (branch switch, manage access link, disconnect with confirmation, data-handling notes).
- The freshness bar shows selected branch, latest known commit and last reviewed commit as three separate facts. "Check for Updates" is one GitHub call and never runs AI.
- Connecting a project re-verifies repository access with the user's own token, so a crafted request cannot attach a repository the user cannot see.
- Tests: GitHub token expiry logic and project request schemas (22 tests total with phase 0).

**Deviations from the plan, caused by current library versions:**

- `middleware.ts` is `proxy.ts` in Next 16. Rather than add a proxy, pages and routes gate access with `requirePageUser()` / `requireUser()` — this suits database sessions and keeps authorization next to the data access.
- Auth.js v5 needs `trustHost: true` when self-hosted, or it rejects every request as `UntrustedHost`.

## Phase 0 — Project scaffold

- Next.js 16 (App Router, TypeScript strict, Tailwind 4) at the repository root, beside the existing `docs/` and `dev-plan/`.
- shadcn/ui initialised with 17 primitives; `lucide-react` icons; dark mode via `next-themes`.
- PostgreSQL 16 through `docker-compose.yml`.
- Full Prisma schema from `dev-plan/02_data_model.md` (Auth.js models, Project, ReviewRun, Finding, FindingCheck, Decision, DecisionFinding and all enums), plus the `init` migration.
- `src/lib/env.ts`: Zod-validated environment that reports every missing key in one error, treats empty values as absent, and accepts both newline forms of the GitHub private key. Parsing is lazy so builds and unit tests do not need a full configuration.
- `src/lib/db.ts`: lazily constructed Prisma singleton using the `@prisma/adapter-pg` driver adapter, cached across hot reloads.
- `.env.example`, `README.md` (including GitHub App setup), npm scripts, and Vitest.
- Placeholder entry points for `npm run worker` (phase 3) and `npm run ai:check` (phase 4).

**Deviations from the plan, caused by current library versions:**

- Prisma 7 moves the datasource URL out of `schema.prisma` into `prisma.config.ts` and requires a driver adapter; the generator is `prisma-client` with output `src/generated/prisma`. Pinned to Prisma 7 — `prisma@latest` currently resolves to an 8.0 release candidate.
- `next lint` was removed in Next 16, so `npm run lint` runs `eslint .` directly.
- `npm run typecheck` runs `next typegen` first, because Next 16's generated `PageProps` / `LayoutProps` types are needed by `tsc`.
- `cacheComponents` was removed from the generated `next.config.ts`: every page here renders per-user data, and leaving it on would require cache annotations on each database read.
- `@types/node` is pinned to ^24 (Vitest 5 requires ≥22) and the Vitest config uses the `.mts` extension.
