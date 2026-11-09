# 01 — Architecture & Tech Stack

## Stack (use these; don't swap without reason)

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript (`strict`) | Node.js 20+ LTS |
| Web framework | Next.js (latest stable, App Router) | Server Components for reads, Route Handlers for mutations/polling |
| UI | Tailwind CSS + shadcn/ui | Use shadcn primitives (Button, Card, Tabs, Table, Badge, Dialog, Select, Textarea, Sheet, Tooltip). `lucide-react` icons |
| Database | PostgreSQL 16 | Local via `docker-compose.yml` |
| ORM | Prisma 7 (pinned) | Schema in `prisma/schema.prisma`; datasource URL in `prisma.config.ts`; `@prisma/adapter-pg` driver adapter; client generated to `src/generated/prisma` |
| Auth | Auth.js (NextAuth v5) with GitHub provider | Uses the **GitHub App's** OAuth client ID/secret (see `03_github_integration.md`) |
| GitHub API | `octokit` / `@octokit/app` | App JWT + installation tokens |
| Archive extraction | `tar` (npm) | Extract repo tarball into a temp dir |
| LLM | **Google Gemini free tier (one API key) with a multi-model fallback chain**; optional extra free providers via the same OpenAI-compatible path (Groq, OpenRouter `:free`, local Ollama), using the open-source `openai` npm package as HTTP client | **No paid API keys.** Models configured per role via env; see `05_ai_prompts_and_schemas.md` §0–1 |
| Validation | `zod` | Env, request bodies, LLM structured output |
| Markdown render | `react-markdown` + `remark-gfm` | For AI summaries/answers |
| Code display | Simple `<pre>` with line numbers; optional `shiki` for highlighting | Keep it simple |
| Tests | Vitest | Unit + integration with mocked LLM/GitHub |
| Worker runtime | `tsx` | Runs `src/worker/index.ts` |

Do **not** add: Redis, BullMQ, Kafka, vector DBs, embeddings, tRPC, GraphQL, Turborepo, Docker images for production (later), any analytics SDK.

## Process model

Two processes share one codebase and one database:

```text
┌───────────────────────┐        ┌──────────────────────────┐
│  Next.js web app       │        │  Worker (npm run worker) │
│  - pages / UI          │        │  - polls ReviewRun table │
│  - route handlers      │──DB──▶ │  - runs review pipeline  │
│  - enqueues ReviewRun  │ ◀──DB──│  - writes progress/results│
└───────────────────────┘        └──────────────────────────┘
          │                                 │
          ▼                                 ▼
     GitHub API (user token,         GitHub API (installation token),
     installation token for light    Free LLM APIs (Gemini / Groq /
     calls like "check updates")     OpenRouter free / local Ollama)
```

- **Why a worker:** reviews take 1–5 minutes (several LLM calls). Running them inside an HTTP request is fragile. A DB-polled worker is the simplest robust option.
- **Queue = the `ReviewRun` table.** Status `QUEUED` → worker claims with `FOR UPDATE SKIP LOCKED` → `RUNNING` → `COMPLETED`/`FAILED`.
- **UI progress = polling** `GET /api/runs/:id` every 2 seconds while status is `QUEUED`/`RUNNING`. No websockets.

## Folder layout (app lives at repository root, next to `docs/` and `dev-plan/`)

```text
/
├─ docs/                      # product docs (exists)
├─ dev-plan/                  # this plan (exists)
├─ prisma/
│  └─ schema.prisma
├─ prisma.config.ts            # Prisma 7: datasource URL + migrations path
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx
│  │  ├─ page.tsx                         # redirect: signed in → /projects, else /login
│  │  ├─ login/page.tsx
│  │  ├─ projects/page.tsx                # project list
│  │  ├─ projects/new/page.tsx            # connect repo + branch
│  │  ├─ p/[projectId]/layout.tsx         # global header + 6 tabs
│  │  ├─ p/[projectId]/overview/page.tsx
│  │  ├─ p/[projectId]/review-lab/page.tsx
│  │  ├─ p/[projectId]/review-lab/[runId]/page.tsx
│  │  ├─ p/[projectId]/risks/page.tsx
│  │  ├─ p/[projectId]/risks/[findingId]/page.tsx
│  │  ├─ p/[projectId]/solutions/page.tsx           # ?findingId=
│  │  ├─ p/[projectId]/decisions/page.tsx
│  │  ├─ p/[projectId]/decisions/[decisionId]/page.tsx
│  │  ├─ p/[projectId]/release/page.tsx
│  │  ├─ p/[projectId]/settings/page.tsx
│  │  └─ api/...                          # see 07_api_contract.md
│  ├─ components/
│  │  ├─ ui/                              # shadcn generated
│  │  ├─ header/ (ProjectHeader, ProjectSelector, FreshnessBar)
│  │  ├─ review/ (ReviewTypePicker, ReviewForm, RunProgress, RunResult)
│  │  ├─ findings/ (FindingCard, FindingTable, EvidenceBlock, SeverityBadge, ClassificationBadge)
│  │  ├─ solutions/ (OptionCompare)
│  │  ├─ decisions/ (DecisionForm, DecisionList)
│  │  └─ release/ (VerdictCard)
│  ├─ lib/
│  │  ├─ env.ts                # zod-validated env
│  │  ├─ db.ts                 # Prisma client singleton
│  │  ├─ auth.ts               # Auth.js config
│  │  ├─ authz.ts              # requireUser(), requireProject(projectId)
│  │  ├─ limits.ts             # daily review limit
│  │  ├─ github/
│  │  │  ├─ app.ts             # App instance, getInstallationOctokit()
│  │  │  ├─ user.ts            # list user installations/repos with user token
│  │  │  ├─ repo.ts            # branches, head SHA, compare, check-runs/statuses
│  │  │  └─ snapshot.ts        # download+extract tarball at SHA; cleanup
│  │  ├─ repo/
│  │  │  ├─ filters.ts         # ignore/secret/binary/size rules
│  │  │  ├─ redact.ts          # secret redaction
│  │  │  ├─ mapper.ts          # ProjectMap builder
│  │  │  ├─ search.ts          # keyword/symbol grep over snapshot
│  │  │  ├─ imports.ts         # simple JS/TS import resolution
│  │  │  └─ context.ts         # assemble ContextBundle within token budget
│  │  ├─ ai/
│  │  │  ├─ providers.ts       # parse role → [provider:model] lists from env
│  │  │  ├─ ratelimit.ts       # per-model request spacing
│  │  │  ├─ fallback.ts        # model selection, error classification, per-model cooldowns
│  │  │  ├─ routes.ts          # optional task routes + custom providers (05 §1.7)
│  │  │  ├─ client.ts          # callJson(): JSON mode, validation, repair, fallback chain
│  │  │  ├─ schemas.ts         # zod output schemas
│  │  │  └─ prompts/
│  │  │     ├─ shared.ts       # shared system rules
│  │  │     ├─ personas.ts     # 9 + AI/ML persona briefs
│  │  │     ├─ planner.ts      # context planner / router prompt
│  │  │     ├─ synthesis.ts    # run summary / answer / verdict prompt
│  │  │     └─ recheck.ts      # finding re-check prompt
│  │  └─ review/
│  │     ├─ engine.ts          # runReview(runId): orchestrates stages
│  │     ├─ types.ts           # ReviewType configs, internal types
│  │     ├─ progress.ts        # update run stage/progress
│  │     ├─ validate.ts        # evidence validation + downgrades
│  │     ├─ dedupe.ts          # within-run merge
│  │     ├─ store.ts           # persist findings / link existing
│  │     ├─ recheck.ts         # RECHECK run logic
│  │     └─ release.ts         # release assessment extras + verdict rules
│  └─ worker/
│     └─ index.ts              # poll loop, claim, run, heartbeat, stale recovery
├─ scripts/
│  └─ ai-check.ts              # npm run ai:check — verify configured free models
├─ tests/
│  ├─ fixtures/sample-next-app/   # tiny repo with seeded issues
│  └─ *.test.ts
├─ docker-compose.yml          # postgres only
├─ .env.example
└─ package.json
```

## npm scripts

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "worker": "tsx src/worker/index.ts",
  "worker:dev": "tsx watch src/worker/index.ts",
  "ai:check": "tsx scripts/ai-check.ts",
  "lint": "eslint .",
  "typecheck": "next typegen && tsc --noEmit",
  "test": "vitest run",
  "db:migrate": "prisma migrate dev",
  "db:studio": "prisma studio"
}
```

## Environment variables (`.env.example`)

```bash
# App
APP_URL=http://localhost:3000
DATABASE_URL=postgresql://athenyx:athenyx@localhost:5432/athenyx

# Auth.js
AUTH_SECRET=                      # openssl rand -base64 32
AUTH_GITHUB_ID=                   # GitHub App's Client ID
AUTH_GITHUB_SECRET=               # GitHub App's Client secret

# GitHub App
GITHUB_APP_ID=
GITHUB_APP_SLUG=                  # used for the install URL
GITHUB_APP_PRIVATE_KEY=           # PEM; allow "\n" escaped form and convert

# AI — FREE only. Default: one Gemini key + fallback across several Gemini models.
GEMINI_API_KEY=                   # free key from Google AI Studio (required unless GEMINI_API_KEYS is set)
GEMINI_API_KEYS=                  # optional multiple keys: "alias:key,alias:key" (see 05 §1.1)
GROQ_API_KEY=                     # optional extra fallback
OPENROUTER_API_KEY=               # optional, only ":free" models
OLLAMA_BASE_URL=http://localhost:11434/v1   # optional, local open-source models

# Ordered lists "provider[@keyAlias]:model", BEST FIRST (first = primary, rest = fallbacks).
# Model IDs are EXAMPLES — replace with the free Gemini models `npm run ai:check` reports.
AI_REVIEW_MODELS=gemini:gemini-2.5-flash,gemini:gemini-2.0-flash,gemini:gemini-2.5-flash-lite,gemini:gemini-2.0-flash-lite
AI_LIGHT_MODELS=gemini:gemini-2.5-flash-lite,gemini:gemini-2.0-flash-lite,gemini:gemini-2.0-flash,gemini:gemini-2.5-flash
AI_REVIEW_MAX_INPUT_TOKENS=30000  # keep well under each model's per-minute token limit
AI_LIGHT_MAX_INPUT_TOKENS=5000
AI_DEFAULT_MIN_INTERVAL_MS=6000   # spacing between requests to the same model
AI_MIN_INTERVAL_MS_OVERRIDES=     # e.g. gemini:gemini-2.5-flash=12000

# OPTIONAL: other free providers for specific, infrequent tasks (see 05 §1.7). Leave empty to use Gemini only.
AI_TASK_ROUTES=                   # e.g. persona.algorithms=groq:<model>|max=6000;synthesis@RELEASE=openrouter:<model>:free
AI_CUSTOM_PROVIDERS=              # e.g. cerebras|https://api.cerebras.ai/v1|CEREBRAS_API_KEY

# Limits
MAX_PERSONAS_PER_RUN=3           # router usually picks 2
MAX_REVIEWS_PER_USER_PER_DAY=5   # free tiers allow few requests/day; ~4–5 LLM calls per run
MAX_SNAPSHOT_MB=50
WORKER_CONCURRENCY=1
```

`src/lib/env.ts` parses these with Zod at startup and throws a clear error listing missing keys.

## Key cross-cutting decisions

- **Snapshot handling:** download tarball at exact SHA into `os.tmpdir()/athenyx/<runId>`, use it for the run, **delete it in `finally`**. Raw source is never stored in the DB except short evidence snippets (≤ 30 lines each).
- **Authorization:** every project-scoped query filters by `project.userId === session.user.id`. Helper `requireProject(projectId)` in `authz.ts` is used by every page and route under `/p/[projectId]` and `/api/projects/[projectId]`.
- **No AI on read paths:** page loads only read the DB. The only AI-triggering endpoints are `POST /api/projects/:id/runs` and `POST /api/findings/:id/recheck`.
- **Free-tier friendly:** LLM calls within a run are sequential and rate-limited; a review taking a few minutes is acceptable and the progress UI explains waits ("Waiting for AI rate limit…").
- **Time/IDs:** use `cuid()` IDs, `DateTime @default(now())`. Show times as relative ("3h ago") with absolute on hover.
