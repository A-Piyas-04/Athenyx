import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { TopBar } from "@/components/app-shell/top-bar";
import { PageTransition, Stagger, StaggerItem } from "@/components/motion/primitives";
import { PageHeader } from "@/components/page-header";
import { RelativeTime } from "@/components/relative-time";
import { Button } from "@/components/ui/button";
import { requirePageUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { shortSha } from "@/lib/github/repo";

export const metadata = { title: "Projects · Athenyx" };

const STEPS = [
  { title: "Install the GitHub App", text: "On only the repositories you choose. Access is read-only." },
  { title: "Pick a repository and branch", text: "Connecting reads nothing yet." },
  { title: "Start a review", text: "Whenever you want one. Pushing code never starts it." },
];

export default async function ProjectsPage() {
  const user = await requirePageUser();

  const projects = await db.project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      repoOwner: true,
      repoName: true,
      selectedBranch: true,
      lastReviewedSha: true,
      lastReviewedAt: true,
      _count: { select: { findings: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } } } },
    },
  });

  const connect = (
    <Button asChild>
      <Link href="/projects/new">
        <Plus />
        Connect repository
      </Link>
    </Button>
  );

  return (
    <>
      <TopBar user={user} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-12 pb-24 sm:px-8 sm:pt-16">
        <PageTransition className="space-y-12">
          {projects.length === 0 ? (
            <div className="max-w-3xl space-y-12">
              <h1 className="text-display text-[2.75rem] sm:text-[4rem]">Connect your first repository.</h1>
              {/* A real sequence, so it is numbered. */}
              <ol className="grid gap-8 border-t border-border pt-8 sm:grid-cols-3">
                {STEPS.map((step, i) => (
                  <li key={step.title} className="space-y-2">
                    <span className="font-display text-2xl font-bold text-muted-foreground tabular-nums">{i + 1}</span>
                    <h2 className="text-section">{step.title}</h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">{step.text}</p>
                  </li>
                ))}
              </ol>
              {connect}
            </div>
          ) : (
            <>
              <PageHeader title="Projects" description="Each project is one repository and branch." actions={connect} />
              <Stagger className="border-t border-border">
                {projects.map((project) => {
                  const open = project._count.findings;
                  return (
                    <StaggerItem key={project.id} className="border-b border-border">
                      <Link
                        href={`/p/${project.id}/overview`}
                        className="group -mx-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 rounded-md px-4 py-6 row-hover sm:grid-cols-[minmax(0,1fr)_9rem_12rem_auto]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-display text-xl font-semibold tracking-tight">
                            <span className="font-normal text-muted-foreground">{project.repoOwner}/</span>
                            {project.repoName}
                          </span>
                          <span className="mt-1 block text-sm text-muted-foreground">{project.selectedBranch}</span>
                        </span>
                        <span className="hidden text-sm sm:block">
                          {open > 0 ? (
                            <>
                              <span className="font-semibold tabular-nums">{open}</span>{" "}
                              <span className="text-muted-foreground">open risk{open === 1 ? "" : "s"}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">No open risks</span>
                          )}
                        </span>
                        <span className="hidden text-sm text-muted-foreground sm:block">
                          {project.lastReviewedAt ? (
                            <>
                              Reviewed <RelativeTime date={project.lastReviewedAt} />
                              {project.lastReviewedSha ? <span className="ml-2 font-mono text-xs">{shortSha(project.lastReviewedSha)}</span> : null}
                            </>
                          ) : (
                            "Never reviewed"
                          )}
                        </span>
                        <ArrowRight className="size-4 -translate-x-1 text-muted-foreground opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                      </Link>
                    </StaggerItem>
                  );
                })}
              </Stagger>
            </>
          )}
        </PageTransition>
      </main>
    </>
  );
}
