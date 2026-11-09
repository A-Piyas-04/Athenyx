# 07 — API Contract (Route Handlers)

All routes live in `src/app/api/**/route.ts`. Pages read data directly via Prisma in Server Components (through small query functions in `src/lib/queries/*.ts`); these API routes are for client mutations, polling, and pickers.

## Conventions

- Auth: every route calls `requireUser()`; project-scoped routes call `requireProject(projectId)` which returns 404 if the project isn't owned by the user (do not leak existence).
- Body validation with Zod; on failure return `400 { error: "validation_error", details }`.
- Error shape: `{ error: string, message: string }`. Status codes: 400, 401, 403, 404, 409, 429, 500.
- JSON only. No route triggers AI except **Create run** and **Re-check**.

## Endpoints

### GitHub / projects

| Method & path | Body / query | Response | Notes |
|---|---|---|---|
| `GET /api/github/installations` | — | `{ installations: { id, account: {login, type}, repos: { id, fullName, defaultBranch, private }[] }[] , installUrl }` | User token |
| `GET /api/github/installations/:installationId/repos/:repoId/branches` | `?q=` | `{ branches: { name, sha }[] }` | Installation token; verify user can access repo first |
| `POST /api/projects` | `{ installationId: number, repoId: number, branch: string }` | `{ project }` | Re-verify access; idempotent per user+repo |
| `PATCH /api/projects/:projectId` | `{ selectedBranch?: string }` | `{ project }` | Branch must exist |
| `DELETE /api/projects/:projectId` | — | `204` | Cascade delete |
| `POST /api/projects/:projectId/check-updates` | — | `{ latestKnownSha, latestCheckedAt, lastReviewedSha, isBehind }` | No AI |
| `GET /api/projects/:projectId/branches` | `?q=` | `{ branches }` | For settings / release gate |

### Runs

| Method & path | Body | Response | Notes |
|---|---|---|---|
| `POST /api/projects/:projectId/runs` | `{ type: "PROJECT_HEALTH"\|"LATEST_CHANGES"\|"ASK"\|"PROPOSAL"\|"ISSUE"\|"RELEASE", branch?: string, input?: {...} }` | `201 { runId }` | Validates input per type (04 §2); checks daily limit (429); rejects if this project already has a QUEUED/RUNNING run (409 "A review is already running for this project"); LATEST_CHANGES without baseline → 409 |
| `GET /api/runs/:runId` | — | `{ id, type, status, stage, commitSha, branch, personas, personaStatus, error, createdAt, startedAt, finishedAt }` | Polling; owner check via run.project |
| `GET /api/projects/:projectId/runs` | `?type=&limit=20` | `{ runs: [...] }` | Recent runs |
| `POST /api/runs/:runId/cancel` | — | `{ status }` | |

The full run result is rendered server-side on the run page (no API needed).

### Findings

| Method & path | Body | Response | Notes |
|---|---|---|---|
| `PATCH /api/findings/:findingId` | `{ status?: FindingStatus, statusNote?: string, chosenOptionIndex?: number\|null }` | `{ finding }` | ACCEPTED_RISK, DISMISSED, manual RESOLVED require `statusNote` (manual RESOLVED → prefix `[manual] `) |
| `POST /api/findings/recheck` | `{ projectId: string, findingIds: string[] }` (1–5) | `201 { runId }` | Creates RECHECK run; same limit/409 rules |

### Decisions

| Method & path | Body | Response |
|---|---|---|
| `POST /api/projects/:projectId/decisions` | `{ title, context, chosenOption, rationale, alternatives: {title, whyNot}[], constraints?, assumptions?, relatedFiles: string[], findingIds: string[], status?, commitSha? }` | `201 { decision }` |
| `PATCH /api/decisions/:decisionId` | partial of the above | `{ decision }` |
| `POST /api/decisions/:decisionId/supersede` | same body as create | `201 { decision }` (old → SUPERSEDED) |
| `DELETE /api/decisions/:decisionId` | — | `204` |

Risk Center filtering is done in the Server Component via URL `searchParams` (`?status=&severity=&persona=&classification=&q=`) — no findings list API.

Linked `findingIds` must belong to the same project (else 400).

## Authorization helpers (`src/lib/authz.ts`)

```ts
export async function requireUser(): Promise<{ id: string; githubLogin: string }>   // 401 if none
export async function requireProject(projectId: string, userId: string): Promise<Project> // 404 if not owner
export async function requireRun(runId: string, userId: string): Promise<ReviewRun & { project: Project }>
export async function requireFinding(findingId: string, userId: string): Promise<Finding & { project: Project }>
export async function requireDecision(decisionId: string, userId: string)
```

Pages under `/p/[projectId]` call the same helpers and use `notFound()` on failure; unauthenticated users are redirected to `/login` by middleware.
