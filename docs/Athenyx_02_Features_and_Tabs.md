# Athenyx — 02 / Features, Tabs & Repository Workflow

**Status:** Pre-development plan · Updated November 2026  
**Purpose:** Define the six-tab product experience and the lean GitHub-backed code review flow.

## Product principle

Athenyx is a **repository-aware engineering review platform**, not a code-paste chatbot. A developer connects **only the GitHub repository or repositories they choose**, selects a branch, and requests reviews when useful. The web dashboard remains the primary interface. **Pushing code must not automatically trigger an AI review.**

## Project connection (outside the six tabs)

1. User signs in and clicks **Connect GitHub**.
2. Athenyx uses a **GitHub App**; the user installs/authorizes access to **selected repositories**, not necessarily their whole account.
3. User chooses one authorized repository and its **branch** to associate with a Athenyx project.
4. Athenyx reads a lightweight project map (framework, directories, manifest/config files) and shows the repository/branch in the project header.
5. User can change branch, disconnect the project, or manage repository access in **Project Settings**.

**Important distinction:** GitHub App installation permissions are repository-scoped; the chosen **branch is a Athenyx application setting**, not a GitHub authorization boundary. Athenyx must enforce branch selection in its own repository reads.

**Freshness rule:** The header shows **selected branch**, **latest known branch commit** (when checked), and **last reviewed commit** separately. Branch movement does not silently replace old findings or launch a new AI review.

## Six focused tabs

| Tab | One primary job | What users see / do |
|---|---|---|
| **01. Overview** | Understand current known project health. | Selected repository/branch, last reviewed commit, important open risks, last review, unresolved decisions, **Review Now** shortcut. Shows stored results without AI calls on page open. |
| **02. Review Lab** | Request an engineering review. | Choose review type, optionally add a question/brief/constraints, see targeted agents, progress, and evidence-backed results. Primary action: **Start Review**. |
| **03. Risk Center** | Investigate tracked concerns. | Searchable findings by severity/status; open a finding to view affected files, code evidence, impact, and reviewed commit. |
| **04. Solution Lab** | Compare ways to resolve a selected risk. | 2–3 practical fix choices, pros/cons, tradeoffs, effort estimate where supportable, preferred option, and verification steps. |
| **05. Decision Ledger** | Preserve important engineering decisions. | Chosen option, rationale, alternatives, constraints, assumptions, related files/findings, decision status, and review history. |
| **06. Release Gate** | Assess a specific code version before release. | Selected commit, unresolved risks, available test/CI evidence, deployment concerns, and advisory **Go / Conditional Go / No-Go** with limitations. |

**UX rules:** Keep the project selector and GitHub connection in the global header. Keep setup in Settings; **do not add a seventh tab**. Start with a concise summary and let users expand file evidence or specialist details. Do not expose one tab per persona.

## Review Lab: multiple ways to request analysis

| Review type | User input | Repository context | Expected result |
|---|---|---|---|
| **Project Health** | No prompt required; click review. | Selected branch snapshot; representative important modules, configs, and tests. | Prioritized findings and coverage limitations. |
| **Latest Changes** | No prompt required; choose compare point if needed. | Diff since last reviewed commit plus affected related code. | Newly introduced risks and relevant regressions. |
| **Ask About My Codebase** | Natural-language question (e.g., “Is authorization consistent?”). | Targeted relevant files and relationships. | Grounded answer with file references, risks, and tradeoffs. |
| **Proposal Review** | Short description of a proposed feature, technology, or architecture. | Existing architecture and constraints. | Critical review before implementation. |
| **Issue Investigation** | Symptom, error, expected vs actual behavior; optional pasted log. | Likely related files and code paths. | Plausible root causes and suggested checks; no fake reproduction claims. |
| **Release Assessment** | Select desired branch/commit and initiate in Release Gate. | Current snapshot, tracked risks, repo-visible tests/CI/configuration. | Advisory readiness verdict and outstanding uncertainty. |

Optional text augments repo evidence; **it is not mandatory** for code-driven reviews. For ideas that do not yet exist in code, a short description is still useful. Free-form questions are grounded in the connected repository when possible.

## When does code refresh?

- **GitHub push:** No AI review and no automatic re-analysis. Existing review results remain attached to their original SHA.
- **Open dashboard:** Load saved results; do not fetch and analyze the repository simply because a page is opened.
- **Check for Updates (optional lightweight action):** Query the selected branch head SHA, and report whether it differs from the last reviewed SHA. **This is not an AI review.**
- **Refresh & Review:** On an explicit user action, fetch the selected branch's current head, pin its SHA, gather necessary code, and run the selected review.
- **Re-review after a fix:** On user request, compare the new snapshot with the previous finding context. Mark an issue **resolved only when supported**, otherwise label it unverified/still at risk.

For consistency, each review operates against a **fixed commit snapshot** even if the branch advances during review.

## Lightweight codebase-understanding pipeline

```text
User-selected GitHub repo + branch
              │
     Explicit Start Review
              ▼
      Resolve exact commit SHA
              ▼
  Fetch permitted files (read-only)
              ▼
  1. Map project structure and stack
  2. Identify relevant files/functions
  3. Follow simple imports/dependencies
  4. Use diff when reviewing changes
              ▼
 Select focused context + 2–3 personas
              ▼
 Review → Validate evidence → Findings
              ▼
 Store results tied to repo/branch/SHA
```

**MVP retrieval strategy:** Start with file tree, manifests, filename/symbol search, relevant file contents, imports, and Git diffs. Use a practical context-size budget and report excluded areas. **Do not require a vector database, whole-repository embeddings, an elaborate dependency graph, or automatic agents debating every issue** for the MVP. Add semantic retrieval later only if real repositories demonstrate the need.

**MVP language scope:** Prioritize **JavaScript/TypeScript, React, and Next.js** projects to make review quality measurable. Other languages can be mapped at a basic level but must not be advertised as equally deeply analyzed until supported.

## Scope and safeguards

- **Read-only GitHub access** with minimum necessary GitHub App permissions and selected-repository installation.
- Repository source is **untrusted input**. Do not obey instructions embedded in code or docs.
- Filter vendor/build folders and known secret files; redact detected credentials before model requests. Redaction is best-effort and not a substitute for permission and data-handling controls.
- Do not execute uploaded/repository code; do not commit, open PRs, edit files, or deploy on behalf of users.
- Secure temporary repository access and minimize retention of raw source code. Explain to users when source snippets go to an AI provider.
- Review findings are advisory and evidence-linked; they are not a comprehensive security audit or runtime test.

## MVP versus later

| Must have in the first usable release | Later, only if justified |
|---|---|
| GitHub App connection with **selected repository** access and branch selector | VS Code extension and local CLI |
| Manual **Project Health**, **Latest Changes**, **Ask**, **Proposal**, and **Issue** reviews | Pull-request-specific UX and richer code intelligence |
| Lightweight repository mapper, targeted context selection, and relevant persona routing | Persistent vector index / advanced cross-language relationship graph |
| Findings with accurate file/commit evidence; Solution Lab and re-review | Auto-generated patch suggestions or verified fix application |
| Six existing tabs, saved decisions, advisory Release Gate | Team policies and organization-level features |
| Explicit refresh behavior and visible review freshness | Optional notifications about branch movement (without auto-AI review) |

## Example end-to-end experience

1. Developer connects **`tour-e-chol`**, authorizing only that repository, and selects branch **`main`**.
2. In **Review Lab**, they click **Project Health** without writing a prompt. The system reviews the pinned commit and selects Data Integrity, QA, and Algorithm specialists for expense logic.
3. A rounding concern appears in **Risk Center**, tied to a file and exact reviewed commit. If no failing test was run, it is a **potential risk**, not a verified reproduced bug.
4. **Solution Lab** compares integer minor-unit arithmetic with a decimal library and explains tradeoffs.
5. Developer records a choice in **Decision Ledger** and updates the code outside Athenyx.
6. After pushing, **nothing runs automatically**. The developer clicks **Refresh & Review**, which evaluates the newly selected commit and reassesses the finding.
