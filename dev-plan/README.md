# Athenyx — Development Plan (Index)

This folder is the **implementation plan for Athenyx**. An AI coding agent builds the project by following these files in order. The product's intent lives in `/docs` (the source of truth for *what* and *why*); this folder defines *how*.

## What Athenyx is (one paragraph)

Athenyx is a web app that acts as an **independent AI engineering review board**. A developer signs in with GitHub, authorizes **only selected repositories** through a GitHub App, picks a branch, and **manually** requests reviews. Athenyx pins the branch to an exact commit SHA, reads the code (read-only), selects focused context, routes it to **2–3 relevant AI specialist personas**, validates their evidence, and stores evidence-linked findings with 2–3 fix options. Users track risks, compare fixes, record decisions, re-check fixes on demand, and get an advisory release verdict. **Athenyx never writes, commits, merges, deploys, or executes repository code, and never runs AI automatically on push.**

**Hard constraint:** Athenyx must run with **free AI providers only** (Google Gemini free tier, Groq free tier, optional OpenRouter `:free` models, optional local Ollama). No paid API keys anywhere.

## Reading order

| # | File | Contents |
|---|---|---|
| 0 | `README.md` | This index, agent working rules, definition of done |
| 1 | `01_architecture_and_stack.md` | Tech stack, folder layout, processes, env vars |
| 2 | `02_data_model.md` | Full Prisma schema and enum meanings |
| 3 | `03_github_integration.md` | GitHub App setup, sign-in, connection, snapshot, diff, CI data |
| 4 | `04_review_engine.md` | The review pipeline step by step (context, routing, validation, storage, re-check, release) |
| 5 | `05_ai_prompts_and_schemas.md` | LLM client config, shared rules, persona briefs, output schemas |
| 6 | `06_ui_tabs_and_ux.md` | Pages, header, six tabs, components, UX rules |
| 7 | `07_api_contract.md` | Route handlers, request/response shapes, authorization |
| 8 | `08_implementation_phases.md` | **The build order** — phases, tasks, acceptance criteria |
| 9 | `09_testing_and_quality.md` | Tests, fixtures, mocked LLM, manual QA checklist |
| 10 | `10_guardrails_and_non_goals.md` | Hard rules and things NOT to build |

Read files 1–7 and 10 once before starting. Then execute **`08_implementation_phases.md` phase by phase**.

## Working rules for the implementing agent

1. **Follow the phases in order.** Do not start a phase until the previous phase's acceptance criteria pass.
2. **Do not over-engineer.** No paid APIs. No microservices, no message broker, no vector DB, no embeddings, no Redis, no GraphQL, no monorepo tooling. One Next.js app + one worker script + PostgreSQL.
3. **Do not invent scope.** If something is not in these files or `/docs`, don't build it. If a detail is missing, choose the simplest reasonable option and leave a short `// NOTE:` comment.
4. **Keep the six tabs exactly**: Overview, Review Lab, Risk Center, Solution Lab, Decision Ledger, Release Gate. Settings is not a tab.
5. **Never add any code path that** commits/pushes to GitHub, opens PRs, edits user repos, executes repository code, or triggers AI reviews from a webhook/push/page load.
6. **Type-safe everywhere** (TypeScript `strict: true`). Validate all external input (HTTP bodies, LLM output, env vars) with Zod.
7. **Small, focused modules.** Put business logic in `src/lib/**`, not in React components or route handlers.
8. **Write tests as you go** for the pure logic listed in `09_testing_and_quality.md`. LLM calls are mocked in tests.
9. After each phase: run `npm run lint`, `npm run typecheck`, `npm test`, and fix all failures before moving on.
10. Keep a running `CHANGELOG.md` at the repo root: one short entry per completed phase.

## Definition of done (MVP)

- A user can sign in with GitHub, install the GitHub App on selected repos, connect one repo + branch as a project.
- Pushing code triggers nothing. Opening pages triggers no AI calls.
- Review Lab can run all six review types: Project Health, Latest Changes, Ask About My Codebase, Proposal Review, Issue Investigation (Release Assessment runs from Release Gate).
- Every review is pinned to a commit SHA displayed in the UI.
- Findings show observation, evidence (path + lines + reviewed SHA, validated against the snapshot), impact, classification, severity, options with pros/cons, recommendation, and verification steps.
- Risk Center lists/filters findings; Solution Lab compares options; Decision Ledger stores decisions; "Re-check" re-evaluates a finding on a newer commit.
- Release Gate produces an advisory Go / Conditional Go / No-Go with limitations.
- Header shows selected branch, latest known commit, and last reviewed commit separately; "Check for Updates" never runs AI.
- All checks (lint, typecheck, tests) pass; the manual QA checklist in `09_testing_and_quality.md` passes.
