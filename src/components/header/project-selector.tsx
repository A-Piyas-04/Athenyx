"use client";

import Link from "next/link";
import { Check, ChevronsUpDown, FolderGit2, Plus, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ProjectOption = {
  id: string;
  label: string;
  branch: string;
};

export function ProjectSelector({ current, projects }: { current: ProjectOption; projects: ProjectOption[] }) {
  const [owner, repo] = current.label.split("/");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group -ml-1.5 flex max-w-[16rem] min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-muted sm:max-w-[22rem]">
        <span className="min-w-0 truncate text-sm">
          <span className="hidden text-muted-foreground sm:inline">{owner}/</span>
          <span className="font-semibold">{repo}</span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Switch project</DropdownMenuLabel>
        {projects.map((project) => (
          <DropdownMenuItem key={project.id} asChild>
            <Link href={`/p/${project.id}/overview`} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">
                {project.label}
                <span className="text-muted-foreground"> on {project.branch}</span>
              </span>
              {project.id === current.id ? <Check className="size-3.5 shrink-0" /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/p/${current.id}/settings`}>
            <Settings className="size-3.5" />
            Project settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/projects">
            <FolderGit2 className="size-3.5" />
            All projects
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/projects/new">
            <Plus className="size-3.5" />
            Connect repository
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
