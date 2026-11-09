# Real app preview on the `test1` branch

Run `npm run dev:preview` and open <http://localhost:3000>.

This runs the existing Next.js pages and components with a sample user, project, review history, findings, decisions, and release assessment. No Docker, PostgreSQL, GitHub App, sign-in, AI key, or worker is needed. The preview flag is set only by `dev:preview`; regular `npm run dev` retains the normal application behavior.

The real UI actions use an ignored JSON sample file at `tmp/athenyx-preview-state.json`. Starting a review or release assessment immediately creates a sample result. Status changes, option selection, decisions, and branch changes are visible after navigation or refresh. Run `npm run preview:reset` to restore the initial sample data. External GitHub links in the sample pages are illustrative and may not resolve.

Use this mode to evaluate navigation, layout, forms, filters, and action flows. It does not inspect code or call external services.
