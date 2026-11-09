# Athenyx

Athenyx is an independent AI engineering review board for your code. You connect only the GitHub repositories you choose, pick a branch, and ask for a review when you want one. Athenyx reads the code read-only at one exact commit, routes it to a few focused AI specialist reviewers, and reports evidence-linked findings with practical fix options.

**It advises; it does not act.** Athenyx never writes, commits, merges or deploys code, never runs your repository's code, and never starts an AI review because you pushed.

Product intent lives in [`docs/`](docs/). The implementation plan lives in [`dev-plan/`](dev-plan/).

**No paid API keys are required.** GitHub access is free, and the AI runs on Google Gemini's free tier with a fallback chain across several free models.

## Build status

| Phase | What it covers | State |
|---|---|---|
| 0 | Project scaffold, database, env validation | ✅ done |
| 1 | Sign-in, GitHub connection, project shell + six tabs | ✅ done |
| 2 | Snapshots, filters, redaction, project map, context bundles | ✅ done |
| 3 | Run queue, worker, Review Lab | ✅ done |
| 4 | Review engine: AI client + fallback chain, planner, reviewers, evidence validation, Project Health + Latest Changes | ✅ done |
| 5 | Ask, Proposal and Issue reviews | ✅ done |
| 6 | Risk Center, Solution Lab, Re-check | ✅ done |
| 7 | Decision Ledger | ✅ done |
| 8 | Release Gate | ✅ done |
| 9 | Overview, empty/loading/error states, access-lost banner, security pass | ✅ done |

All six tabs work: **Overview · Review Lab · Risk Center · Solution Lab · Decision Ledger · Release Gate**. The manual QA checklist in [`dev-plan/09_testing_and_quality.md`](dev-plan/09_testing_and_quality.md) §4 has not been run yet.

## Prerequisites

- Node.js 20+ (developed on 24)
- Docker (for PostgreSQL)
- A GitHub account (free is fine, private repos included)

## Setup

### 1. Install dependencies

```bash
npm install
```

npm may report that install scripts were skipped. Prisma and esbuild need theirs to fetch binaries:

```bash
npm install-scripts approve prisma @prisma/engines esbuild
```

### 2. Start PostgreSQL

```bash
docker compose up -d
```

### 3. Create a GitHub App

Athenyx uses **one GitHub App** for both sign-in and repository reads. Creating and using it is free.

Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App** and set:

| Field | Value |
|---|---|
| GitHub App name | anything unique, e.g. `athenyx-yourname` |
| Homepage URL | `http://localhost:3000` |
| Callback URL | `http://localhost:3000/api/auth/callback/github` |
| Request user authorization (OAuth) during installation | ✅ **checked** |
| Setup URL | `http://localhost:3000/projects/new` |
| Redirect on update | ✅ checked |
| Webhook → Active | ❌ **unchecked** (Athenyx uses no webhooks, so a push can never trigger anything) |

**Repository permissions — all read-only:**

| Permission | Access | Why |
|---|---|---|
| Metadata | Read-only | Required baseline |
| Contents | Read-only | Read code, branches, commit diffs |
| Checks | Read-only | CI evidence for Release Gate (phase 8) |
| Commit statuses | Read-only | CI evidence for Release Gate (phase 8) |

Grant no write permissions and no account permissions.

After creating the app:

1. Note the **App ID** and the app's URL slug (the last part of `https://github.com/apps/<slug>`).
2. Under **Client secrets**, note the **Client ID** and generate a **Client secret**.
3. Under **Private keys**, generate a private key and download the `.pem`.
4. Click **Install App** and choose **Only select repositories**.

### 4. Configure the environment

```bash
cp .env.example .env
openssl rand -base64 32   # paste into AUTH_SECRET
```

Fill in:

- `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` — the app's **Client ID** and **Client secret** (not the App ID)
- `GITHUB_APP_ID` — the numeric App ID
- `GITHUB_APP_SLUG` — the slug from the app's URL
- `GITHUB_APP_PRIVATE_KEY` — the contents of the `.pem`. Both real newlines and the `"-----BEGIN…\n…"` single-line escaped form work.

### 5. Configure the free AI models

Reviews need **one free Google Gemini API key** — nothing paid:

1. Open [Google AI Studio](https://aistudio.google.com/apikey) and create an API key.
2. Put it in `.env` as `GEMINI_API_KEY=…`.
3. Check which free models your key can use:

   ```bash
   npm run ai:check
   ```

   This lists each configured model, whether it exists for your key, and whether a tiny JSON test call works. It also suggests other Gemini models your key can use. Keys are never printed — only their aliases.

**How the model chain works.** `AI_REVIEW_MODELS` (reviewer calls) and `AI_LIGHT_MODELS` (planner and summary calls) are ordered lists, best model first. Each Gemini model has its own free quota. When a model is rate-limited, out of daily quota, or unavailable, Athenyx moves down the list, and goes back to the best model as soon as its cooldown ends. If every model is briefly rate-limited, the review waits instead of failing. A review that used a lower model is marked "fallback models were used". The model IDs in `.env.example` are examples. Replace them with free models that `npm run ai:check` reports.

**Optional: several Gemini keys.** `GEMINI_API_KEYS=main:AIza…,backup:AIza…` gives each key an alias. List entries can then name a key (`gemini@backup:gemini-2.5-flash`), or use `gemini@*:model` to try that model on every key. Keys created in the **same Google Cloud project share one free quota**; only separate projects get separate quotas. **You are responsible for making sure your use of multiple keys or projects complies with Google's Gemini API terms.**

**Optional: other free providers.** Groq (`GROQ_API_KEY`), OpenRouter `:free` models (`OPENROUTER_API_KEY`), a local Ollama (`OLLAMA_BASE_URL`), or any OpenAI-compatible provider with a free tier (`AI_CUSTOM_PROVIDERS`) can be appended to a list as a last resort. They can also be preferred for one specific task with `AI_TASK_ROUTES`, which always falls back to the Gemini chain. Check each provider's free terms and data policy yourself. Paid models are not supported.

**Private code.** Free tiers may allow a provider to use submitted content to improve their products. For private or sensitive code, run a local model with [Ollama](https://ollama.com) and list it, for example `AI_REVIEW_MODELS=ollama:qwen2.5-coder:14b`. Review Lab always names the providers that will receive code before you start a review.

### 6. Create the database schema

```bash
npx prisma migrate dev
```

### 7. Run

```bash
npm run dev      # the web app on http://localhost:3000
npm run worker   # the review worker — reviews run here, so keep it running
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run worker` | Review worker (polls for reviews you start) |
| `npm run ai:check` | Verify the configured free AI models |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types, then `tsc --noEmit` |
| `npm test` | Vitest. Database tests use a separate `athenyx_test` database (created automatically when PostgreSQL is running; skipped otherwise). Override with `TEST_DATABASE_URL`. |
| `npm run db:migrate` | Apply schema migrations |
| `npm run db:studio` | Browse the database |

## How reviews work

1. You pick a review type and press **Start Review**. Nothing runs before that.
2. Athenyx resolves your selected branch to an exact commit SHA and pins the review to it.
3. It downloads that commit into a temporary folder, maps the project, and selects only the relevant files.
4. A small planner call picks two or three relevant AI specialists and the files they need. The specialists then review that context one after another, to respect free-tier rate limits. Their findings are checked **in code** against the real files: anything whose cited lines cannot be matched is dropped, and the stored code snippet is copied from your repository, never from the AI.
5. Findings are stored with the commit they were found at, plus fix options and verification steps. A finding seen again in a later review is linked to the existing one, not duplicated.
6. The temporary copy of your code is deleted.

**After a review:**

- **Risk Center** lists every finding with filters. You can accept a risk, dismiss a false positive, or mark it resolved by hand (always labelled "not verified").
- **Solution Lab** compares a finding's fix options. Choosing one records it and offers a prefilled entry for the **Decision Ledger**.
- **Re-check** re-evaluates a finding on the branch's newest commit, using the specialist who raised it. It is marked resolved only when the cited code changed or the fix is visible in the new code. Otherwise the result is "still present" or "unverifiable".
- **Release Gate** gives an advisory Go / Conditional Go / No-Go for one commit. It combines CI results, whether tests exist, open risks, and a DevOps + Quality (+ Security when relevant) review. Rules in code cap the AI's verdict: any open critical finding means No-Go; open high findings, failing CI or no tests mean at most Conditional Go.
- **Overview** summarises open risks, the last review, unresolved decisions and the latest release verdict.

Opening any page only reads the database: it never calls the AI or downloads code. Pushing to GitHub triggers nothing.

## How your code is handled

- Access is **read-only**. Athenyx never pushes, commits, opens pull requests, or deploys, and never executes your code.
- Your code is downloaded only while a review runs, into a temporary directory that is deleted afterwards. Only short evidence snippets are stored in the database.
- Secret files (`.env`, keys, credentials) are never read, and detected secrets are redacted before anything is sent to an AI provider.
- Logs contain run ids, model names, token counts and error summaries — never prompts, file contents, tokens or API keys (keys appear only by alias).
- AI-written text is rendered as markdown with raw HTML disabled.
- When you start a review, relevant snippets are sent to the configured AI provider. Free AI tiers may allow the provider to use submitted content — for private or sensitive code, point Athenyx at a locally hosted model instead (see [`dev-plan/05_ai_prompts_and_schemas.md`](dev-plan/05_ai_prompts_and_schemas.md) §10).

## Limitations

- Reviews are **advisory**. Athenyx can miss defects and raise false alarms, and it never claims to have run or tested your code.
- Review depth targets **JavaScript/TypeScript, React and Next.js**. Other languages are mapped only at a basic level.
- Free AI models are weaker than paid ones, and free rate limits mean a review can take a few minutes.
- Release verdicts are **advisory**; CI evidence needs the app's Checks and Commit statuses read permissions and is shown as "unavailable" without them.
- You always decide what to change and when to ship.
