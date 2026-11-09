# Athenyx — 03 / Business Goals & User Value

**Status:** Pre-development plan · Updated November 2026  
**Purpose:** Explain who Athenyx serves, why users would choose it, and how we will judge whether it is useful. This is a product/business document, not a technical specification.

## One-sentence positioning

**Athenyx is an independent AI engineering review board that connects to a developer-selected GitHub repository, helps uncover meaningful risks in real project code, and compares practical fixes—without taking over development.**

## The problem we solve

Developers make many difficult choices while building software: architecture, security, data handling, algorithms, testing, and release readiness. Weak decisions often become expensive only after the project grows. Existing feedback may be scattered across tools, limited to individual code snippets, or generated without understanding the actual project.

**Our opportunity:** Make an independent second opinion available **throughout development**, informed by the real repository rather than only a copied text prompt.

## Who it is for

| Initial audience | Why they would care |
|---|---|
| **Solo developers and students building real products** | Senior-level challenge and explanation when they have no dedicated reviewer. |
| **Small startup teams** | Spot costly design and implementation risks before they spread. |
| **Agency teams reviewing client applications** | Consistent review evidence, clear options, and a record of decisions. |

**Initial focus:** Individuals and small teams. Avoid building the first release around enterprise processes.

## The experience we want to deliver

1. **Connect a project easily:** Sign in with GitHub, authorize **only the chosen repository**, and select the branch to work with.
2. **Stay in control:** Push and develop normally. Athenyx **does not automatically spend time or review credits after every push**.
3. **Review without writing a prompt:** Click **Project Health** or **Latest Changes** when an independent review is valuable.
4. **Ask about the real code:** Ask a question, describe a problem, or explain an upcoming design decision; Athenyx uses repository context instead of giving only generic advice.
5. **Understand what matters:** See prioritized findings, their supporting code locations, likely impact, and uncertainty.
6. **Choose sensibly:** Compare 2–3 realistic fixes with advantages, disadvantages, and a recommended path where appropriate.
7. **Close the loop:** Keep the reason for a decision, push a fix, and **explicitly request** a new review to see whether the concern is addressed.
8. **Decide when to ship:** Get an advisory release readiness view; the developer makes the final call.

## User jobs across the lifecycle

| Moment | What users want to accomplish |
|---|---|
| **Before building** | Challenge a proposed feature, architecture, or technology choice. |
| **While building** | Review the current codebase or recent changes for issues they may not have noticed. |
| **When stuck** | Ask a concrete codebase question or investigate a bug with supporting context. |
| **When a risk is found** | Understand evidence and compare realistic ways forward. |
| **After implementing a fix** | Re-review the updated branch on demand, without losing earlier decisions. |
| **Before release** | Assess important unresolved risks and readiness evidence. |

## What users should value

| Value | Why it matters |
|---|---|
| **Repository-aware feedback** | Recommendations account for the actual project instead of isolated snippets. |
| **Earlier warning signs** | Avoid discovering preventable mistakes late in development. |
| **Clear alternatives** | Understand tradeoffs rather than obeying a single AI instruction. |
| **User-controlled reviews** | No unwanted review runs every time code is pushed. |
| **Evidence and honesty** | Users can inspect supporting code and see what is proven versus suspected. |
| **Continuity** | Decisions and previously reported risks remain understandable across project versions. |
| **Independence** | Works alongside whichever editor, coding assistant, or development process the user prefers. |

## What makes Athenyx different

Athenyx is **not another AI coding assistant**, and it is not a tool whose main purpose is to produce more code. Its job is to **challenge engineering decisions and implementations**, explain why a problem may matter, and suggest practical alternatives. It combines **repository context, multiple focused reviewer perspectives, and a persistent decision/risk history** in a usable web experience.

## MVP business principles

- **Low-friction onboarding:** GitHub connection, selected-repository authorization, branch selection, then an understandable first review.
- **One coherent web experience:** Keep the six focused tabs; do not expose a separate interface for every reviewer.
- **Quality over quantity:** A few accurate, useful findings beat dozens of generic warnings.
- **Predictable control:** Users initiate substantive reviews; new pushes do not automatically trigger them.
- **Respect for private work:** Communicate what repository access permits, how code is handled, and which AI services may receive snippets.
- **Scope discipline:** Start with a narrow set of common web-application stacks and expand only when the review quality is credible.
- **Developer authority:** No automatic code changes or deployment decisions.

## Simple business validation plan

Invite a small number of developers to connect **real in-progress repositories**. Observe the first connection and first review, then ask them to run another review after changing code. Assess whether the resulting advice is concrete enough to affect a decision or prevent wasted effort.

| Measure | What we learn |
|---|---|
| **Successful project connections** | Is onboarding easy and trustworthy? |
| **First-review completion and usefulness** | Does repository-aware review deliver early value? |
| **Actionable, non-duplicate findings per review** | Is review quality high enough? |
| **Fix options considered or selected** | Do recommendations help developers make decisions? |
| **Risks revisited or meaningfully resolved** | Does the product support actual engineering progress? |
| **Repeat review usage across milestones** | Does it remain valuable beyond the first scan? |
| **Review cost and user-perceived wait** | Can we provide value efficiently without unnecessary AI runs? |

## Business model hypothesis — not decided yet

Begin with a limited free experience to validate value. If users repeatedly return to review real changes, consider paid tiers for larger review allowances, history depth, and collaboration. **Do not finalize pricing or enterprise features before validation.**

## Trust boundary

Athenyx may miss defects or raise false alarms. Repository access does **not** mean complete understanding of runtime behavior. Reviews must identify the code version examined, show evidence, acknowledge uncertain conclusions, and avoid promising bug-free, secure, or release-ready software. **The user always decides what to change and when to ship.**
