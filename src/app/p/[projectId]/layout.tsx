import { TriangleAlert } from "lucide-react";
import { FreshnessBar, type FreshnessData } from "@/components/header/freshness-bar";
import { ProjectHeader } from "@/components/header/project-header";
import { ProjectTabs } from "@/components/header/project-tabs";
import { ScrollHeader } from "@/components/motion/scroll-header";
import { requirePageProject } from "@/lib/authz";
import { db } from "@/lib/db";
import { ACCESS_LOST_MESSAGE } from "@/lib/github/errors";
import { installationSettingsUrl } from "@/lib/github/app";
import { lastRunLostAccess } from "@/lib/queries/overview";

export default async function ProjectLayout({ children, params }: LayoutProps<"/p/[projectId]">) {
  const { projectId } = await params;
  const { user, project } = await requirePageProject(projectId);

  const projects = await db.project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, repoOwner: true, repoName: true, selectedBranch: true },
  });

  const accessLost = await lastRunLostAccess(project.id, ACCESS_LOST_MESSAGE);

  const options = projects.map((item) => ({
    id: item.id,
    label: `${item.repoOwner}/${item.repoName}`,
    branch: item.selectedBranch,
  }));

  const current = options.find((item) => item.id === project.id) ?? {
    id: project.id,
    label: `${project.repoOwner}/${project.repoName}`,
    branch: project.selectedBranch,
  };

  const freshness: FreshnessData = {
    projectId: project.id,
    repoOwner: project.repoOwner,
    repoName: project.repoName,
    branch: project.selectedBranch,
    latestKnownSha: project.latestKnownSha,
    latestCheckedAt: project.latestCheckedAt?.toISOString() ?? null,
    lastReviewedSha: project.lastReviewedSha,
    lastReviewedAt: project.lastReviewedAt?.toISOString() ?? null,
  };

  return (
    <>
      <ScrollHeader hideOffset={56} bordered>
        <ProjectHeader user={user} current={current} projects={options} freshness={freshness} />
        <ProjectTabs projectId={project.id} />
      </ScrollHeader>

      {accessLost ? (
        <div role="alert" className="bg-destructive/8 text-destructive">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-sm sm:px-8">
            <TriangleAlert className="size-4 shrink-0" />
            <span className="font-semibold">Athenyx can no longer read this repository.</span>
            <span className="text-foreground/75">The GitHub App was uninstalled or the repository was removed from it.</span>
            <span className="flex gap-4 sm:ml-auto">
              <a href={installationSettingsUrl(project.installationId)} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">
                Manage access
              </a>
              <a href={`/p/${project.id}/settings`} className="font-medium underline underline-offset-4">
                Settings
              </a>
            </span>
          </div>
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-6xl px-5 pt-4 sm:hidden">
        <FreshnessBar data={freshness} />
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-8 pb-24 sm:px-8 sm:pt-12">{children}</main>
    </>
  );
}
