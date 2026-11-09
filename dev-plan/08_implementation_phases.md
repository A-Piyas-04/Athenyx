# 08 — Implementation Phases (Build Order)

Execute phases **in order**. Each phase lists tasks, the files to touch, and acceptance criteria (AC). A phase is done only when all AC pass plus `npm run lint && npm run typecheck && npm test`. Add a `CHANGELOG.md` entry after each phase.

---

## Phase 0 — Project scaffold

**Tasks**
1. Create Next.js app (App Router, TypeScript, ESLint, Tailwind, `src/` dir) at the repo root. Keep `docs/` and `dev-plan/` untouched.
2. Install deps: `prisma @prisma/client zod next-auth@beta @auth/prisma-adapter octokit tar openai react-markdown remark-gfm next-themes lucide-react`; dev: `vitest tsx @types/node`.
3. Init shadcn/ui; add components: button, card, badge, tabs, table, dialog, select, textarea, input, label, checkbox, tooltip, sheet, skeleton, alert, dropdown-menu, separator.
4. `docker-compose.yml` with Postgres 16 (user/pass/db `athenyx`, port 5432, named volume).
5. `src/lib/env.ts` (Zod env, see 01), `src/lib/db.ts` (Prisma singleton), `.env.example`.
6. Prisma schema from `02_data_model.md`; run first migration.
7. npm scripts from 01. `tsconfig` `strict: true`, path alias `@/*` → `src/*`.
8. Root `README.md`: what Athenyx is (2 lines), local setup (docker, env, GitHub App creation per 03 §1, getting free Gemini/Groq keys, optional Ollama, migrate, `npm run ai:check`, `npm run dev` + `npm run worker`). State clearly: no paid API keys required. Explain the Gemini model fallback chain and optional multiple keys (aliases, `@*`), note that keys in the same Google Cloud project share one free quota, and that the operator is responsible for complying with Google's Gemini API terms when using multiple keys/projects.
9. Vitest config + one trivial test.

**AC**
- `docker compose up -d && npx prisma migrate dev` succeeds; `npm run dev` serves a placeholder home page.
- Missing env var produces a readable startup error listing the key.

---

## Phase 1 — Auth, GitHub connection, project shell

**Tasks**
1. Auth.js config (`src/lib/auth.ts`) with GitHub provider + Prisma adapter; store `githubLogin`. `/login` page. Middleware redirecting unauthenticated users to `/login` (except `/login`, `/api/auth/*`).
2. `src/lib/authz.ts` helpers (07).
3. `src/lib/github/app.ts`, `user.ts` (with token refresh), `repo.ts` (`listBranches`, `getBranchHeadSha`).
4. API: `GET /api/github/installations`, branches route, `POST/PATCH/DELETE /api/projects`, `POST check-updates`, `GET branches`.
5. Pages: `/projects`, `/projects/new` (install link, repo picker, branch picker, connect), `/p/[projectId]/layout.tsx` with ProjectHeader (selector, FreshnessBar, settings, user menu) and the six tab links; each tab page shows a placeholder card.
6. Settings page (branch change, manage access link, disconnect).

**AC**
- Sign in with GitHub works; user can install the app on one selected repo and connect it + a branch.
- Attempting `POST /api/projects` with a repoId not in the user's installations returns 403/404.
- Header shows branch, "Latest known: not checked", "Last reviewed: never". Check for Updates fills latest known SHA. No snapshot download or AI call happens anywhere in this phase.
- Another user cannot open `/p/<someone-else's-project>` (404).

---

## Phase 2 — Snapshot, filters, redaction, project map

**Tasks**
1. `src/lib/github/snapshot.ts` (download, size limit, safe extraction, cleanup) — 03 §6.
2. `src/lib/repo/filters.ts`, `redact.ts`, `mapper.ts` — 04 §4.
3. `src/lib/repo/search.ts`, `imports.ts` (one-hop resolution incl. tsconfig paths) — 04 §5b.
4. `src/lib/repo/context.ts`: build ContextBundle with line numbers, budget, exclusions — 04 §5c–5d.
5. Fixture repo `tests/fixtures/sample-next-app/` (see 09) and unit tests for filters, redaction, mapper, imports, context budget.

**AC**
- Unit tests pass: `.env` and `node_modules` never appear in bundles; secrets in fixture are redacted with line count preserved; mapper detects `nextjs, react, typescript, prisma`; `@/lib/x` alias resolves; budget excludes files with reason `budget`.
- Extraction rejects symlinks and path-escape entries (test with a crafted tarball).

---

## Phase 3 — Run queue, worker, Review Lab shell

**Tasks**
1. `POST /api/projects/:id/runs` (validation per type, daily limit, single active run per project, baseline check), `GET /api/runs/:id`, `GET /api/projects/:id/runs`, cancel.
2. `src/worker/index.ts`: poll, claim SQL, concurrency, heartbeat, stale recovery, temp cleanup, graceful shutdown — 04 §11.
3. `src/lib/review/engine.ts` skeleton running stages 1–3 for real (resolve SHA, snapshot, map → save `projectMap`) and a **stub** for stages 4–8 that completes with summary "Stub review" and no findings.
4. Review Lab UI: type picker, per-type forms, data notice + first-time checkbox, Start Review, recent runs. Run page with RunProgress polling and a basic RunResult.

**AC**
- Starting a review creates a QUEUED run; the worker picks it up; the run page shows stages advancing and the pinned SHA; it ends COMPLETED.
- Starting a second run on the same project while one is active → 409 shown in UI.
- Killing the worker mid-run and restarting marks the run FAILED within 10 minutes (or immediately on restart if heartbeat stale); temp dir is removed.
- Exceeding the daily limit returns a clear 429 message.

---

## Phase 4 — Review engine core (Project Health + Latest Changes)

**Tasks**
1. `src/lib/ai/providers.ts`, `ratelimit.ts`, `fallback.ts` (05 §1.6), `routes.ts` (05 §1.7, optional routes), `client.ts` (`callJson`: JSON mode, normalize + Zod validation, one repair call, truncation retry, 429 backoff, fallback chain, usage), `schemas.ts`, and `scripts/ai-check.ts` — 05 §0–1, §5.
2. Prompts: `shared.ts`, `personas.ts` (all 10 briefs, ~8–12 lines each), `planner.ts`, `synthesis.ts` — 05.
3. Engine stages 4–8: planner + post-processing + fallback personas, deterministic expansion, persona calls (sequential, rate-limited, shared ContextBundle), `validate.ts`, `dedupe.ts`, synthesis, `store.ts` (create vs. link existing) — 04 §5–8.
4. `compareCommits` in `repo.ts`; LATEST_CHANGES diff context + importers; "no new commits" short-circuit.
5. RunResult: summary, finding cards, coverage & limitations, specialist details, usage footer.
6. Update `project.lastReviewedSha` on completion; header reflects it.

**AC**
- `npm run ai:check` passes with at least one free provider key configured.
- With `AI_TASK_ROUTES` empty, all calls use the Gemini chains. With a route set, that task tries the route entry first and falls back to the Gemini chain when it fails, is rate-limited, exceeds `max=`, or its key is missing.
- Unit tests for `callJson` with a mocked HTTP client: fenced JSON parsed; invalid JSON → one repair call; 429 with `retry-after` waits then retries; per-minute 429 → short wait or cooldown + fallback; daily-quota 429 → cooldown until Pacific midnight + fallback; 404 model → 24h cooldown; 401 on one key → that key's entries cooled down, other keys still used; `@*` expansion and per-key quota tracking work; keys never appear in logs/errors; all models in short cooldown → waits; all in daily cooldown → `AiUnavailableError`; best available model is chosen again once its cooldown ends; degraded runs flagged and `Finding.model` stored.
- With a mocked LLM (tests): validator drops evidence citing non-included files, re-anchors quotes within ±10 lines, replaces snippets with snapshot lines, drops evidence-less findings, downgrades VERIFIED_DEFECT/CRITICAL as specified; dedupe merges overlapping findings.
- Real run on the fixture repo (pushed to a test GitHub repo) produces ≥ 2 of the seeded issues (09) with correct paths/lines, and the run shows the reviewed SHA.
- Running Project Health twice links repeated issues to the existing finding (no duplicates).
- Latest Changes after a new commit focuses on changed files; with no new commits completes instantly without LLM calls.

---

## Phase 5 — Ask, Proposal, Issue review types

**Tasks**
1. Task texts per type (05 §4), input rendering inside `<developer_input>`, `answer` handling in persona output and synthesis.
2. `userPremise` handling in validation (04 §7.2).
3. RunResult renders the Answer section; Review Lab forms enforce required fields.

**AC**
- Ask "Where is authorization checked for expense routes?" on the fixture returns an answer citing real `path:line` references.
- Proposal review of "add Redis caching for balances" returns DESIGN_CONCERN-style findings using `userPremise` where appropriate, never claiming the code exists.
- Issue investigation returns ranked plausible causes + verification checks and never claims reproduction.

---

## Phase 6 — Risk Center, Solution Lab, Re-check

**Tasks**
1. Risk Center list with searchParams filters, finding detail page, EvidenceBlock with GitHub links, status actions (`PATCH /api/findings/:id`), history timeline.
2. Solution Lab page with finding picker, OptionCompare, Choose option → `chosenOptionIndex` + `IN_PROGRESS`. (Decision creation from this button is wired in Phase 7.)
3. RECHECK run type: `POST /api/findings/recheck`, `src/lib/review/recheck.ts`, `prompts/recheck.ts` — 04 §9. Re-check buttons on detail page and bulk in Risk Center. Show latest check result on the detail page.

**AC**
- Filters and search work; status changes requiring notes enforce them.
- After pushing a real fix to the test repo, Re-check marks the finding RESOLVED with evidence at the new SHA; with no fix pushed, it stays open with STILL_PRESENT; with no new commit, it completes instantly with a message.
- Manual "mark resolved" is visibly labelled "not verified".

---

## Phase 7 — Decision Ledger

**Tasks**
1. Decision APIs (07), list page with status filter, create/edit page, supersede flow, link findings.
2. Wire Solution Lab "Choose this option" to create a decision (prefilled, editable).
3. Finding detail shows linked decisions; Overview shows PROPOSED decisions.

**AC**
- Choosing an option in Solution Lab creates a decision linked to the finding with alternatives prefilled.
- Superseding keeps history (old SUPERSEDED, link to new).
- Linking a finding from another project is rejected.

---

## Phase 8 — Release Gate

**Tasks**
1. `getCiEvidence` in `repo.ts` (handle 403 → unavailable).
2. RELEASE pipeline (`release.ts`): persona selection, deterministic evidence, synthesis verdict, **deterministic caps** — 04 §10.
3. Release Gate page: branch selector, start assessment, VerdictCard, history, "older commit" notice.

**AC**
- Unit tests for verdict caps (open CRITICAL → NO_GO; open HIGH or failing CI or no tests → max CONDITIONAL_GO).
- A real assessment on the fixture repo shows verdict, conditions, CI evidence (or "unavailable"), limitations, and the advisory disclaimer.

---

## Phase 9 — Overview, polish, hardening

**Tasks**
1. Overview tab per 06 §3 (DB only).
2. Empty/loading/error states on every page; mobile layout check; dark mode.
3. Access-lost banner handling (403/404 from GitHub → run error + header banner).
4. Security pass: verify authz on every route (write a test that iterates all project-scoped routes with a foreign user), confirm no prompt logging, confirm temp cleanup, confirm `react-markdown` without raw HTML.
5. Root README final: setup, GitHub App permissions, env vars, how reviews work, data handling statement, limitations ("JS/TS-first", "advisory only").
6. Run the manual QA checklist (09 §4) and fix issues.

**AC**
- Opening any page triggers zero LLM calls and zero snapshot downloads (verify via logs).
- All items in the manual QA checklist pass.

---

## Explicitly later (do NOT build now)

Paid LLM providers, VS Code extension, CLI, PR-specific UX, webhooks/notifications on branch movement, vector index/embeddings, AI arbiter call, auto patch generation, team/org features, billing/pricing, multi-provider LLM support, running tests or code from repositories.
