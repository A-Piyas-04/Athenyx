import { notFound, redirect } from "next/navigation";
import type { Decision, Finding, Project, ReviewRun } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFoundError, unauthorized } from "@/lib/api";

export type SessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

/** Returns the signed-in user, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
  };
}

/** Route handlers: throws 401 when not signed in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  return user;
}

/** Pages: redirects to /login when not signed in. */
export async function requirePageUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Route handlers: loads a project owned by `userId`.
 *
 * A project belonging to someone else is reported as 404 rather than 403, so
 * the response does not reveal that the id exists.
 */
export async function requireProject(
  projectId: string,
  userId: string,
): Promise<Project> {
  const project = await db.project.findFirst({
    where: { id: projectId, userId },
  });
  if (!project) throw notFoundError("Project");
  return project;
}

/** Pages: loads the current user's project or renders the 404 page. */
export async function requirePageProject(projectId: string): Promise<{
  user: SessionUser;
  project: Project;
}> {
  const user = await requirePageUser();
  const project = await db.project.findFirst({
    where: { id: projectId, userId: user.id },
  });
  if (!project) notFound();
  return { user, project };
}

/** Route handlers: loads a run whose project is owned by `userId` (404 otherwise). */
export async function requireRun(
  runId: string,
  userId: string,
): Promise<ReviewRun & { project: Project }> {
  const run = await db.reviewRun.findFirst({
    where: { id: runId, project: { userId } },
    include: { project: true },
  });
  if (!run) throw notFoundError("Run");
  return run;
}

/** Route handlers: loads a finding whose project is owned by `userId` (404 otherwise). */
export async function requireFinding(
  findingId: string,
  userId: string,
): Promise<Finding & { project: Project }> {
  const finding = await db.finding.findFirst({
    where: { id: findingId, project: { userId } },
    include: { project: true },
  });
  if (!finding) throw notFoundError("Finding");
  return finding;
}

/** Route handlers: loads a decision whose project is owned by `userId` (404 otherwise). */
export async function requireDecision(
  decisionId: string,
  userId: string,
): Promise<Decision & { project: Project }> {
  const decision = await db.decision.findFirst({
    where: { id: decisionId, project: { userId } },
    include: { project: true },
  });
  if (!decision) throw notFoundError("Decision");
  return decision;
}
