# Front-end preview mode

Run `npm run dev:preview` and open <http://localhost:3000>.

This runs the real Next.js pages and components against a sample user, project, review history, findings, decisions, and release assessment. No Docker, PostgreSQL, GitHub App, sign-in, AI key, or worker is needed.

Regular `npm run dev` is unchanged and keeps the normal application behavior: real sign-in, real database, real GitHub and AI calls. The preview flag is set only by `dev:preview`.

## How it works

`scripts/preview-dev.mjs` starts `next dev` with `ATHENYX_PREVIEW=1` and `NEXT_PUBLIC_ATHENYX_PREVIEW=1`. Those two variables are the only switch:

| File | In preview mode |
| --- | --- |
| `src/lib/env.ts` | Supplies placeholder values so env validation passes without a `.env` |
| `src/lib/db.ts` | Returns `previewDb` (`src/lib/preview-db.ts`) instead of a Prisma client |
| `src/lib/api.ts` | Routes every API request through `previewApi` (`src/lib/preview-api.ts`) |
| `src/lib/authz.ts` | Returns a fixed `preview-user` instead of reading the session |
| `src/app/login/page.tsx` | Redirects straight to `/projects` |
| `src/app/projects/new/page.tsx` | Lists one sample installation and repository |
| `src/app/p/[projectId]/review-lab/page.tsx`, `.../release/page.tsx` | Use a sample provider notice instead of reading the AI config |
| `src/components/app-shell/user-menu.tsx` | Hides sign-out |
| `src/components/review/data-notice.tsx` | Shows a preview notice |
| `src/components/review/review-launcher.tsx`, `src/components/release/release-launcher.tsx` | Pre-acknowledge the data notice |

`src/lib/preview-db.ts` is a small in-memory adapter covering the subset of the Prisma API the pages use, backed by a gitignored JSON file at `tmp/athenyx-preview-state.json`. It never opens a database connection, and it does not touch the filesystem unless preview mode is active.

## Using it

Real UI actions work. Starting a review or release assessment immediately creates a sample result. Status changes, option selection, decisions, and branch changes are visible after navigation or refresh.

Run `npm run preview:reset` to restore the initial sample data.

External GitHub links in the sample pages are illustrative and may not resolve.

Use this mode to evaluate navigation, layout, forms, filters, and action flows. It does not inspect code or call external services.
