-- CreateEnum
CREATE TYPE "ReviewType" AS ENUM ('PROJECT_HEALTH', 'LATEST_CHANGES', 'ASK', 'PROPOSAL', 'ISSUE', 'RELEASE', 'RECHECK');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RunStage" AS ENUM ('QUEUED', 'RESOLVING_COMMIT', 'FETCHING_SNAPSHOT', 'MAPPING_PROJECT', 'SELECTING_CONTEXT', 'REVIEWING', 'VALIDATING', 'SUMMARIZING', 'SAVING', 'DONE');

-- CreateEnum
CREATE TYPE "ReleaseVerdict" AS ENUM ('GO', 'CONDITIONAL_GO', 'NO_GO');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "Classification" AS ENUM ('VERIFIED_DEFECT', 'POTENTIAL_RISK', 'DESIGN_CONCERN');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'ACCEPTED_RISK', 'DISMISSED');

-- CreateEnum
CREATE TYPE "CheckResult" AS ENUM ('RESOLVED', 'STILL_PRESENT', 'PARTIALLY_RESOLVED', 'UNVERIFIABLE');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'SUPERSEDED', 'REVERTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "githubLogin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "refresh_token_expires_in" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "installationId" INTEGER NOT NULL,
    "repoId" INTEGER NOT NULL,
    "repoOwner" TEXT NOT NULL,
    "repoName" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL,
    "selectedBranch" TEXT NOT NULL,
    "latestKnownSha" TEXT,
    "latestCheckedAt" TIMESTAMP(3),
    "lastReviewedSha" TEXT,
    "lastReviewedAt" TIMESTAMP(3),
    "projectMap" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "ReviewType" NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "stage" "RunStage" NOT NULL DEFAULT 'QUEUED',
    "branch" TEXT NOT NULL,
    "commitSha" TEXT,
    "baseSha" TEXT,
    "input" JSONB,
    "personas" TEXT[],
    "personaStatus" JSONB,
    "coverage" JSONB,
    "summary" TEXT,
    "answer" TEXT,
    "verdict" "ReleaseVerdict",
    "releaseReport" JSONB,
    "error" TEXT,
    "usage" JSONB,
    "degraded" BOOLEAN NOT NULL DEFAULT false,
    "heartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "firstSeenRunId" TEXT NOT NULL,
    "lastSeenRunId" TEXT NOT NULL,
    "lastSeenSha" TEXT NOT NULL,
    "persona" TEXT NOT NULL,
    "model" TEXT,
    "title" TEXT NOT NULL,
    "observation" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "classification" "Classification" NOT NULL,
    "severity" "Severity" NOT NULL,
    "confidence" "Confidence" NOT NULL,
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "evidence" JSONB NOT NULL,
    "userPremise" TEXT,
    "options" JSONB NOT NULL,
    "recommendation" JSONB,
    "verification" TEXT NOT NULL,
    "chosenOptionIndex" INTEGER,
    "statusNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingCheck" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "result" "CheckResult" NOT NULL,
    "reasoning" TEXT NOT NULL,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FindingCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "chosenOption" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "alternatives" JSONB NOT NULL,
    "constraints" TEXT,
    "assumptions" TEXT,
    "relatedFiles" TEXT[],
    "status" "DecisionStatus" NOT NULL DEFAULT 'ACCEPTED',
    "commitSha" TEXT,
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionFinding" (
    "decisionId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,

    CONSTRAINT "DecisionFinding_pkey" PRIMARY KEY ("decisionId","findingId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Project_userId_repoId_key" ON "Project"("userId", "repoId");

-- CreateIndex
CREATE INDEX "ReviewRun_status_createdAt_idx" ON "ReviewRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewRun_projectId_createdAt_idx" ON "ReviewRun"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Finding_projectId_status_severity_idx" ON "Finding"("projectId", "status", "severity");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRun" ADD CONSTRAINT "ReviewRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_firstSeenRunId_fkey" FOREIGN KEY ("firstSeenRunId") REFERENCES "ReviewRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingCheck" ADD CONSTRAINT "FindingCheck_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingCheck" ADD CONSTRAINT "FindingCheck_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ReviewRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionFinding" ADD CONSTRAINT "DecisionFinding_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionFinding" ADD CONSTRAINT "DecisionFinding_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
