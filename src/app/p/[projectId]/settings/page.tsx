import { ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { BranchSwitcher } from "@/components/projects/branch-switcher";
import { DisconnectProject } from "@/components/projects/disconnect-project";
import { requirePageProject } from "@/lib/authz";
import { installationSettingsUrl } from "@/lib/github/app";

export const metadata = { title: "Settings · Athenyx" };

export default async function SettingsPage({ params }: PageProps<"/p/[projectId]/settings">) {
  const { projectId } = await params;
  const { project } = await requirePageProject(projectId);
  const repoLabel = `${project.repoOwner}/${project.repoName}`;

  return (
    <div className="max-w-4xl space-y-12">
      <PageHeader title="Settings" description="Repository access, the branch Athenyx reviews, and how your code is handled." />

      <div className="divide-y divide-border border-y border-border">
        <Row title="Repository" description={`Connected through GitHub App installation #${project.installationId}.`}>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-3 text-sm">
            <dt className="text-muted-foreground">Repository</dt>
            <dd>
              <a href={`https://github.com/${repoLabel}`} target="_blank" rel="noreferrer" className="group inline-flex items-center gap-1 font-medium">
                <span className="link-underline">{repoLabel}</span>
                <ArrowUpRight className="size-3.5 text-muted-foreground transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </dd>
            <dt className="text-muted-foreground">Default branch</dt>
            <dd>{project.defaultBranch}</dd>
          </dl>
          <a
            href={installationSettingsUrl(project.installationId)}
            target="_blank"
            rel="noreferrer"
            className="group mt-5 inline-flex items-center gap-1 text-sm font-medium text-link"
          >
            <span className="link-underline">Manage repository access on GitHub</span>
            <ArrowUpRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </Row>

        <Row
          title="Branch"
          description="Reviews read the branch selected here. GitHub grants access per repository, so Athenyx enforces this choice itself."
        >
          <BranchSwitcher
            projectId={project.id}
            currentBranch={project.selectedBranch}
            defaultBranch={project.defaultBranch}
            lastReviewedSha={project.lastReviewedSha}
          />
        </Row>

        <Row title="Your code" description="What Athenyx does, and never does, with it.">
          <ul className="space-y-3 text-sm leading-relaxed text-foreground/85">
            <li>Read-only access. It never writes, commits, deploys, or runs your code.</li>
            <li>Code is downloaded only while a review runs, into a temporary folder deleted afterwards. Only short evidence snippets are stored.</li>
            <li>Starting a review sends relevant snippets to the configured AI provider. Review Lab names it before each run.</li>
            <li>Pushing code never starts a review.</li>
          </ul>
        </Row>

        <Row title="Disconnect" description="Remove this project and everything Athenyx stored about it.">
          <DisconnectProject projectId={project.id} repoLabel={repoLabel} />
        </Row>
      </div>
    </div>
  );
}

function Row({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-5 py-10 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-12">
      <div className="space-y-1">
        <h2 className="text-section">{title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}
