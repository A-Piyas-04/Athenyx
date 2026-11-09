import Link from "next/link";
import { Settings } from "lucide-react";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { UserMenu } from "@/components/app-shell/user-menu";
import { Brand } from "@/components/brand";
import { FreshnessBar, type FreshnessData } from "@/components/header/freshness-bar";
import { ProjectSelector, type ProjectOption } from "@/components/header/project-selector";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/actions/auth";
import type { SessionUser } from "@/lib/authz";

export function ProjectHeader({
  user,
  current,
  projects,
  freshness,
}: {
  user: SessionUser;
  current: ProjectOption;
  projects: ProjectOption[];
  freshness: FreshnessData;
}) {
  return (
    <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-5 sm:px-8">
      <Brand compact />
      <span className="mx-1 h-5 w-px rotate-12 bg-border-strong" aria-hidden="true" />
      <ProjectSelector current={current} projects={projects} />
      <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
      <div className="hidden sm:block">
        <FreshnessBar data={freshness} />
      </div>
      <div className="flex-1" />
      <Button variant="ghost" size="icon" asChild>
        <Link href={`/p/${current.id}/settings`} aria-label="Project settings" title="Project settings">
          <Settings className="size-4" />
        </Link>
      </Button>
      <ThemeToggle />
      <UserMenu name={user.name} email={user.email} image={user.image} onSignOut={signOutAction} />
    </div>
  );
}
