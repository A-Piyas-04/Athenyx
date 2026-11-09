import { NextResponse } from "next/server";
import { previewDb, previewReset, previewRun } from "@/lib/preview-db";

const send = (data: unknown, status = 200) => NextResponse.json(data, { status });
const missing = () => send({ error: "not_found", message: "No sample data for this action." }, 404);

/** All app API calls stay within the sample store in preview mode. */
export async function previewApi(request: Request): Promise<NextResponse> {
  const { pathname } = new URL(request.url);
  const method = request.method;
  const parts = pathname.split("/").filter(Boolean);
  const body = method === "POST" || method === "PATCH" ? await request.json().catch(() => ({})) : {};

  if (pathname === "/api/projects" && method === "GET") return send({ projects: await previewDb.project.findMany() });
  if (pathname === "/api/projects" && method === "POST") {
    if (!(await previewDb.project.findFirst())) previewReset();
    const project = await previewDb.project.update({ where: { id: "preview-project" }, data: { selectedBranch: body.branch || "main" } });
    return send({ project }, 201);
  }
  if (parts[1] === "github" && parts[2] === "installations" && parts[3] && parts[4] === "repos" && parts[6] === "branches") return send({ branches: [{ name: "main", sha: "9f8e7d6a38a2df04b195a09d9cf8f71234567890" }, { name: "develop", sha: "31a2b89a38a2df04b195a09d9cf8f71234567890" }], truncated: false });
  if (parts[1] === "projects" && parts[3] === "branches" && method === "GET") return send({ branches: [{ name: "main" }, { name: "develop" }, { name: "release/v1" }] });
  if (parts[1] === "projects" && parts[3] === "check-updates" && method === "POST") return send({ latestKnownSha: "9f8e7d6a38a2df04b195a09d9cf8f71234567890" });
  if (parts[1] === "projects" && parts[3] === "runs" && method === "POST") {
    const run = previewRun(body.type || "PROJECT_HEALTH", body.branch || "main", body.input || {});
    return send({ runId: run.id }, 201);
  }
  if (parts[1] === "runs" && parts[2] && method === "GET") {
    const run = await previewDb.reviewRun.findFirst({ where: { id: parts[2] } });
    return run ? send(run) : missing();
  }
  if (pathname === "/api/findings/recheck" && method === "POST") {
    const run = previewRun("RECHECK", "main", { targetFindingIds: body.findingIds || [] });
    return send({ runId: run.id }, 201);
  }
  if (parts[1] === "findings" && parts[2] && method === "PATCH") {
    const finding = await previewDb.finding.update({ where: { id: parts[2] }, data: body });
    return send({ finding });
  }
  if (parts[1] === "decisions" && parts[2] && parts[3] === "supersede" && method === "POST") {
    const decision = await previewDb.decision.create({ data: { ...body, projectId: "preview-project", findingLinks: { create: (body.findingIds || []).map((findingId: string) => ({ findingId })) } } });
    await previewDb.decision.update({ where: { id: parts[2] }, data: { status: "SUPERSEDED", supersededById: decision.id } });
    return send({ decision }, 201);
  }
  if (parts[1] === "decisions" && parts[2] && method === "PATCH") {
    const { findingIds, ...data } = body;
    if (Array.isArray(findingIds)) {
      await previewDb.decisionFinding.deleteMany({ where: { decisionId: parts[2] } });
      await previewDb.decisionFinding.createMany({ data: findingIds.map((findingId: string) => ({ decisionId: parts[2], findingId })) });
    }
    const decision = await previewDb.decision.update({ where: { id: parts[2] }, data });
    return send({ decision });
  }
  if (parts[1] === "decisions" && parts[2] && method === "DELETE") {
    await previewDb.decisionFinding.deleteMany({ where: { decisionId: parts[2] } });
    await previewDb.decision.delete({ where: { id: parts[2] } });
    return new NextResponse(null, { status: 204 });
  }
  if (parts[1] === "projects" && parts[3] === "decisions" && method === "POST") {
    const decision = await previewDb.decision.create({ data: { ...body, projectId: parts[2], findingLinks: { create: (body.findingIds || []).map((findingId: string) => ({ findingId })) } } });
    return send({ decision }, 201);
  }
  if (parts[1] === "projects" && parts[2] && method === "PATCH") {
    const project = await previewDb.project.update({ where: { id: parts[2] }, data: body });
    return send({ project });
  }
  if (parts[1] === "projects" && parts[2] && method === "DELETE") {
    await previewDb.project.delete({ where: { id: parts[2] } });
    return new NextResponse(null, { status: 204 });
  }
  if (parts[1] === "github" && parts[2] === "installations") return send({ installations: [] });
  return missing();
}
