# 10 — Guardrails & Non-Goals

These rules come from `/docs` and are **non-negotiable**. If a task seems to require breaking one, stop and leave a `// NOTE:` instead.

## Hard rules (product)

1. **Advisory only.** Athenyx never writes to, commits to, opens PRs on, merges, or deploys user repositories. GitHub App permissions stay read-only.
2. **No automatic AI.** No AI call or snapshot download on push, on page load, on a timer, or on connect. Only explicit user actions: Start Review, Re-check, Assess release readiness.
3. **Pinned commits.** Every run is tied to one exact SHA, shown in the UI. Results are never silently moved to a newer commit.
4. **Evidence or nothing.** Findings must cite validated repository evidence or be clearly marked as based on the developer's premise. The validator, not the model, decides what evidence is shown.
5. **Honest classification.** No claims of reproduction or runtime testing. "Resolved" only via a supported re-check or an explicitly labelled manual mark.
6. **Human decides.** Release verdicts are labelled advisory; the user decides what to change and when to ship.
7. **Six tabs exactly.** No per-persona tabs, no seventh tab. Settings lives behind the header.
8. **2–3 personas per run** by default (max from env), chosen by relevance. Never all nine by default.

## Hard rules (security & data)

1. Repository content and user input are **untrusted data**; wrapped in tags; never placed in `system`; never followed as instructions.
2. **Do not execute repository code** (no `npm install`, no scripts, no tests from the repo, no `eval`).
3. Never read secret files; redact detected secrets before any LLM request.
4. Raw source lives only in a per-run temp dir and is deleted afterwards. The DB stores only short evidence snippets.
5. Never log prompt contents, file contents, tokens, or keys (AI keys are referred to only by alias).
6. Every DB query for project data is scoped to the signed-in user.
7. Safe tar extraction (no symlinks, no path escape, size limit).
8. Render AI markdown without raw HTML.
9. Tell the user, before running a review, which AI provider(s) receive relevant snippets, and that free tiers may let providers use submitted content. Recommend local Ollama for sensitive code.
10. **No paid services required.** Everything must run with free API tiers or local open-source software.

## Non-goals for the MVP (do NOT build)

- VS Code extension, CLI, browser extension
- GitHub webhooks, push-triggered anything, branch-movement notifications
- Pull-request comments or PR-specific UX
- Vector database, embeddings, semantic index, full dependency graph, AST-based multi-language parsing
- Agents debating each other; AI arbiter call; multi-round reviewer conversations
- Auto-generated patches, "apply fix" buttons, code editing
- Running tests, builds, linters, or containers against user code
- Teams, organizations, roles, sharing, comments
- Billing, payments, pricing tiers (only a simple daily review limit)
- Paid LLM APIs of any kind; model pickers in the UI (providers/models are configured only via env)
- Deep support claims for non-JS/TS languages (basic mapping only, with a visible limitation)
- Redis/queues/microservices/Kubernetes; production Docker deploy setup

## Simplicity checklist (apply to every PR-sized change)

- Could this be a plain function instead of a class/abstraction? Make it a function.
- Is a new dependency necessary? Prefer the standard library or an existing dep.
- Is this configurable "just in case"? Hard-code it (or put it in `env.ts` only if listed in 01).
- Does this add a new page, tab, or model not in the plan? Don't.
