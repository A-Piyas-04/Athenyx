# 02 — Data Model (Prisma)

Implement this schema in `prisma/schema.prisma`. Auth.js models follow the official Prisma adapter shape (`@auth/prisma-adapter`). Keep JSON columns for nested, display-only data; use real columns for anything filtered or sorted.

## Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ---------- Auth.js ----------
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  githubLogin   String?
  createdAt     DateTime  @default(now())
  accounts      Account[]
  sessions      Session[]
  projects      Project[]
}

model Account {            // stores GitHub user access + refresh token
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  refresh_token_expires_in Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime
  @@unique([identifier, token])
}

// ---------- Projects ----------
model Project {
  id               String   @id @default(cuid())
  userId           String
  installationId   Int                 // GitHub App installation id
  repoId           Int                 // GitHub numeric repo id
  repoOwner        String
  repoName         String
  defaultBranch    String
  selectedBranch   String
  latestKnownSha   String?             // set by "Check for Updates" or by a run
  latestCheckedAt  DateTime?
  lastReviewedSha  String?             // SHA of last COMPLETED run (any type except RECHECK)
  lastReviewedAt   DateTime?
  projectMap       Json?               // latest ProjectMap (see 04), refreshed per run
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  runs      ReviewRun[]
  findings  Finding[]
  decisions Decision[]

  @@unique([userId, repoId])
}

// ---------- Review runs (also the job queue) ----------
enum ReviewType {
  PROJECT_HEALTH
  LATEST_CHANGES
  ASK
  PROPOSAL
  ISSUE
  RELEASE
  RECHECK          // internal: re-check selected findings; not shown as a Review Lab option
}

enum RunStatus { QUEUED RUNNING COMPLETED FAILED CANCELLED }

enum RunStage {
  QUEUED
  RESOLVING_COMMIT
  FETCHING_SNAPSHOT
  MAPPING_PROJECT
  SELECTING_CONTEXT
  REVIEWING
  VALIDATING
  SUMMARIZING
  SAVING
  DONE
}

enum ReleaseVerdict { GO CONDITIONAL_GO NO_GO }

model ReviewRun {
  id            String     @id @default(cuid())
  projectId     String
  type          ReviewType
  status        RunStatus  @default(QUEUED)
  stage         RunStage   @default(QUEUED)
  branch        String
  commitSha     String?            // pinned at RESOLVING_COMMIT; never changes afterwards
  baseSha       String?            // LATEST_CHANGES / RECHECK compare base
  input         Json?              // { question?, brief?, constraints?, expected?, actual?, log?, targetFindingIds? }
  personas      String[]           // persona keys actually used
  personaStatus Json?              // { [personaKey]: "pending"|"running"|"waiting_rate_limit"|"done"|"failed" }
  coverage      Json?              // { filesIncluded: string[], filesExcluded: {path, reason}[], limitations: string[] }
  summary       String?  @db.Text  // markdown summary from synthesis
  answer        String?  @db.Text  // ASK / PROPOSAL / ISSUE answer (markdown)
  verdict       ReleaseVerdict?    // RELEASE only
  releaseReport Json?              // RELEASE only: { conditions[], blockingFindingIds[], ciEvidence, limitations[] }
  error         String?
  usage         Json?              // { inputTokens, outputTokens, calls, retries, fallbacks, models: string[] }
  degraded      Boolean  @default(false)  // true if any reviewer call used a fallback (tier > 0) model
  heartbeatAt   DateTime?
  createdAt     DateTime   @default(now())
  startedAt     DateTime?
  finishedAt    DateTime?

  project       Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  findingsFirstSeen Finding[] @relation("FirstSeenRun")
  checks        FindingCheck[]

  @@index([status, createdAt])
  @@index([projectId, createdAt])
}

// ---------- Findings ----------
enum Severity { CRITICAL HIGH MEDIUM LOW INFO }
enum Classification { VERIFIED_DEFECT POTENTIAL_RISK DESIGN_CONCERN }
enum Confidence { HIGH MEDIUM LOW }
enum FindingStatus {
  OPEN
  IN_PROGRESS       // user picked a fix / is working on it
  RESOLVED          // ONLY set by a RECHECK result of RESOLVED (or user marks with note, see below)
  ACCEPTED_RISK     // user decision
  DISMISSED         // user says false positive (keep record)
}

model Finding {
  id              String         @id @default(cuid())
  projectId       String
  firstSeenRunId  String
  lastSeenRunId   String
  lastSeenSha     String
  persona         String                 // persona key that raised it
  model           String?                // "provider:model" that produced it (shows fallback use)
  title           String
  observation     String   @db.Text
  impact          String   @db.Text
  classification  Classification
  severity        Severity
  confidence      Confidence
  status          FindingStatus @default(OPEN)
  evidence        Json                   // EvidenceItem[] (validated), see below
  userPremise     String?  @db.Text      // when based on user-stated info
  options         Json                   // FixOption[] (0–3)
  recommendation  Json?                  // { optionIndex: number|null, rationale: string }
  verification    String   @db.Text
  chosenOptionIndex Int?
  statusNote      String?  @db.Text      // reason when user accepts risk / dismisses / marks resolved manually
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  project       Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  firstSeenRun  ReviewRun @relation("FirstSeenRun", fields: [firstSeenRunId], references: [id])
  checks        FindingCheck[]
  decisionLinks DecisionFinding[]

  @@index([projectId, status, severity])
}

enum CheckResult { RESOLVED STILL_PRESENT PARTIALLY_RESOLVED UNVERIFIABLE }

model FindingCheck {         // history of re-checks / re-sightings
  id         String      @id @default(cuid())
  findingId  String
  runId      String
  commitSha  String
  result     CheckResult
  reasoning  String  @db.Text
  evidence   Json?                 // EvidenceItem[] at the new SHA
  createdAt  DateTime @default(now())
  finding    Finding   @relation(fields: [findingId], references: [id], onDelete: Cascade)
  run        ReviewRun @relation(fields: [runId], references: [id], onDelete: Cascade)
}

// ---------- Decisions ----------
enum DecisionStatus { PROPOSED ACCEPTED SUPERSEDED REVERTED }

model Decision {
  id            String         @id @default(cuid())
  projectId     String
  title         String
  context       String   @db.Text           // problem / why a decision was needed
  chosenOption  String   @db.Text
  rationale     String   @db.Text
  alternatives  Json                         // { title, whyNot }[]
  constraints   String?  @db.Text
  assumptions   String?  @db.Text
  relatedFiles  String[]
  status        DecisionStatus @default(ACCEPTED)
  commitSha     String?                      // commit the decision was made against
  supersededById String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  findingLinks  DecisionFinding[]
}

model DecisionFinding {
  decisionId String
  findingId  String
  decision   Decision @relation(fields: [decisionId], references: [id], onDelete: Cascade)
  finding    Finding  @relation(fields: [findingId], references: [id], onDelete: Cascade)
  @@id([decisionId, findingId])
}
```

Run `npx prisma format` and `npx prisma validate` after writing it; fix any syntax details Prisma reports without changing the model's meaning.

## JSON shapes (define as Zod + TS types in `src/lib/review/types.ts`)

```ts
type EvidenceItem = {
  path: string;            // repo-relative, POSIX separators
  startLine: number;       // 1-based, inclusive
  endLine: number;         // inclusive; endLine - startLine <= 29
  symbol: string | null;   // function/class/component name if known
  snippet: string;         // exact lines copied from the snapshot by the validator (NOT model text)
  commitSha: string;
};

type FixOption = {
  title: string;
  description: string;
  pros: string[];
  cons: string[];
  effort: "SMALL" | "MEDIUM" | "LARGE" | null;
};

type Coverage = {
  filesIncluded: string[];
  filesExcluded: { path: string; reason: "budget" | "ignored" | "secret" | "binary" | "too_large" }[];
  limitations: string[];
};
```

## Rules tied to the model

- `ReviewRun.commitSha` is set once and never changed. All findings/evidence from that run carry that SHA.
- `Project.lastReviewedSha` updates only when a non-RECHECK run completes.
- `Finding.status = RESOLVED` is set automatically **only** by a `FindingCheck` with result `RESOLVED`. A user may manually mark resolved, but must give a `statusNote`, and the UI labels it "Marked resolved by user (not verified)". Store that as status `RESOLVED` + `statusNote` starting with `[manual]`.
- Deleting a project cascades everything.
