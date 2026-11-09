# 06 — UI: Pages, Header, Six Tabs

Product rules from `/docs/Athenyx_02_Features_and_Tabs.md` apply. Summary-first, details on expand. Clean, neutral dashboard look (shadcn defaults, light + dark via `next-themes`). Responsive down to ~390px wide (tabs become a horizontally scrollable bar).

## 1. Global pages

| Route | Purpose |
|---|---|
| `/login` | "Sign in with GitHub" button + 3-line explanation of what Athenyx does and that access is read-only |
| `/projects` | List of the user's projects (repo, branch, last reviewed, open risk count). "Connect repository" button. Empty state explains the flow |
| `/projects/new` | Installation/repo picker → branch picker → Connect (see `03_github_integration.md` §3) |

## 2. Project layout (`/p/[projectId]/layout.tsx`)

### Global header (always visible inside a project)

```text
[Athenyx]  [Project selector ▼ owner/repo]                      [⚙ Settings] [avatar ▼]
Branch: main   •   Latest known: a1b2c3d (checked 5m ago) [Check for Updates]
               •   Last reviewed: 9f8e7d6 (2h ago)   [New commits since last review] [Refresh & Review]
```

- **FreshnessBar** shows three separate facts: selected branch, latest known commit (or "not checked"), last reviewed commit (or "never reviewed"). Short SHAs link to GitHub commit pages.
- "Check for Updates" → `POST /api/projects/:id/check-updates` → updates bar. Never AI.
- "Refresh & Review" appears only when behind; navigates to Review Lab with `?type=LATEST_CHANGES` (or `PROJECT_HEALTH` if never reviewed). User must still press Start Review.
- Access-lost banner (red) when the last GitHub call failed with 403/404.

### Tabs (exactly six, in this order)

`01 Overview` · `02 Review Lab` · `03 Risk Center` · `04 Solution Lab` · `05 Decision Ledger` · `06 Release Gate`

Implemented as links styled as tabs (each tab is its own route). Do **not** add a tab per persona or a seventh tab.

## 3. Tab specs

### 01 Overview — `/p/[id]/overview`
DB reads only; no AI, no GitHub calls on load.
- **Health strip:** counts of open findings by severity (Critical/High/Medium/Low), accepted risks, resolved.
- **Top open risks:** up to 5 (severity desc) → link to Risk Center detail.
- **Last review card:** type, commit, when, summary (markdown, clamp 6 lines), link to run.
- **Unresolved decisions:** decisions with status PROPOSED (up to 5).
- **Latest release verdict** if any (badge + commit).
- **Review Now** button → Review Lab.
- Empty state (never reviewed): explain + big "Run first Project Health review".

### 02 Review Lab — `/p/[id]/review-lab`
- **ReviewTypePicker:** 5 cards — Project Health, Latest Changes, Ask About My Codebase, Proposal Review, Issue Investigation. (Release Assessment lives in Release Gate; show a small link "Release assessment → Release Gate".)
- **ReviewForm** fields per type:
  - Project Health: optional "Focus (optional)".
  - Latest Changes: compare point select: "Since last reviewed commit (9f8e7d6)" default; disabled with explanation + "Run Project Health instead" if no baseline.
  - Ask: required question textarea, optional constraints.
  - Proposal: required brief textarea, optional constraints.
  - Issue: required symptom; optional expected, actual, log (monospace textarea).
- Above the button: one-line data notice "Relevant code snippets from the selected commit will be sent to <configured provider names, e.g. Google Gemini, Groq> for analysis. Nothing is changed in your repository." Provider names come from the server config — include every provider that could receive code for this review type (role chain **plus** any matching task routes); show a full privacy note via tooltip/link that links each provider's terms and warns that free tiers may allow the provider to use submitted content (05 §10). If only `ollama` is configured, say "Code is analyzed locally and not sent to external AI services." First time per user: a checkbox "I understand" must be ticked (store `localStorage` flag; server does not depend on it).
- **Start Review** → `POST /api/projects/:id/runs` → navigate to `/p/[id]/review-lab/[runId]`.
- **Recent runs** list below (type, status, commit, created, duration).

### Run page — `/p/[id]/review-lab/[runId]`
- **RunProgress** (while QUEUED/RUNNING; poll every 2s): stage stepper (Resolve commit → Fetch code → Map project → Select context → Review → Validate → Summarize → Save), pinned commit SHA as soon as known, persona chips with per-persona status (incl. "Waiting for AI rate limit…"), a note that free AI tiers can make reviews take a few minutes, Cancel button.
- **RunResult** (COMPLETED):
  1. Header: type, branch, **reviewed commit**, finished time.
  2. Summary (markdown).
  3. Answer (ASK/PROPOSAL/ISSUE) (markdown).
  4. Findings list (FindingCard compact: severity, classification, title, persona, first evidence path:line, "Open" → Risk Center detail).
  5. "No significant issues found" state when zero findings.
  6. Collapsible **Coverage & limitations:** files reviewed (count + expandable list), excluded files with reasons, limitations.
  7. Collapsible **Specialist details:** per-persona summary.
  8. Small muted footer: models used, tokens (approx.), duration.
  - If `run.degraded`: amber notice at the top of results: "Some reviewers used fallback AI models because higher-quality free models were rate-limited. Results may be less thorough — you can re-run later." Finding cards from fallback models show a small "fallback model" tag (tooltip = model name).
- FAILED: error message (e.g. "All configured AI models are rate-limited. Try again later.") + "Try again" (re-enqueue same type/input).

### 03 Risk Center — `/p/[id]/risks`
- Table: severity, title, classification, status, persona, primary file, last seen commit, updated.
- Filters: status (default: Open + In progress), severity multi-select, persona, classification; text search over title/observation (simple `ILIKE`).
- Row checkbox → "Re-check selected (max 5)".
- **Finding detail** `/p/[id]/risks/[findingId]`:
  - Title, badges (severity, classification, confidence, status), persona, first seen / last seen commit.
  - Observation, Impact, User premise (if any, labelled "Based on your description, not repository code").
  - **EvidenceBlock** per evidence item: `path:start–end` (link to GitHub at that SHA: `https://github.com/{o}/{r}/blob/{sha}/{path}#L{start}-L{end}`), code with line numbers.
  - Verification steps.
  - Status actions: Mark in progress · Accept risk (note required) · Dismiss as false positive (note required) · Mark resolved manually (note required; labelled unverified) · Reopen.
  - **Re-check on latest commit** button → RECHECK run; show result inline when done.
  - History: FindingChecks timeline (result, commit, reasoning) and linked decisions.
  - "Compare fixes →" Solution Lab.

### 04 Solution Lab — `/p/[id]/solutions?findingId=…`
- Left: finding picker (open findings, searchable). Right: selected finding summary.
- **OptionCompare:** 2–3 option columns (stack on mobile): title, description, pros, cons, effort badge; the recommended option highlighted with rationale.
- Actions per option: **Choose this option** → sets `chosenOptionIndex`, status `IN_PROGRESS`, opens **DecisionForm** prefilled (title = finding title, chosen option, alternatives = other options with their cons as "why not", related files from evidence, linked finding). User can edit and save, or skip the decision.
- Verification steps shown under the options, plus "After you push your fix, use Re-check" hint + button.
- No AI calls on this page in MVP (options come from the review).

### 05 Decision Ledger — `/p/[id]/decisions`
- List: title, status, date, linked findings count, commit. Filter by status.
- "New decision" button (manual decision not tied to a finding is allowed).
- Detail/edit page: context, chosen option, rationale, alternatives (title + why not), constraints, assumptions, related files (free text list), linked findings (multi-select from project findings), status; "Supersede" creates a new decision pre-filled and sets old one SUPERSEDED with `supersededById`.

### 06 Release Gate — `/p/[id]/release`
- Branch selector (defaults to selected branch) + "Assess release readiness" button → RELEASE run (same data notice).
- Latest assessment card: **VerdictCard** — large verdict badge (Go = green, Conditional Go = amber, No-Go = red), commit assessed, conditions list, blocking findings (links), CI evidence (checks list with conclusion), tests present yes/no, limitations, and the fixed disclaimer "Advisory only. Athenyx may miss defects. You decide whether to ship."
- If the latest assessment's commit ≠ current latest known commit → note "Assessment is for an older commit."
- History of past assessments (verdict, commit, date).

### Settings — `/p/[id]/settings` (not a tab; via header gear)
- Repository info, branch selector (see 03 §8), "Manage repository access on GitHub" link, Disconnect project (confirm dialog; deletes project and all its data), data-handling explanation text.

## 4. Shared component rules

- **SeverityBadge** colors: Critical red-700, High red-500, Medium amber-500, Low blue-500, Info gray.
- **ClassificationBadge** labels: "Verified defect", "Potential risk", "Design concern".
- Always show the reviewed **short SHA** next to any finding/result.
- Loading: skeletons. Errors: inline alert with message from API.
- Markdown from AI rendered with `react-markdown` (no raw HTML: do not enable `rehype-raw`).
- No auto-refresh anywhere except run progress polling.
