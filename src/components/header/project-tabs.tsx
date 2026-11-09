"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * The six product tabs. This list is fixed by design — reviewers are never
 * exposed as tabs, and Settings lives in the header instead.
 */
export const PROJECT_TABS = [
  { slug: "overview", label: "Overview" },
  { slug: "review-lab", label: "Review Lab" },
  { slug: "risks", label: "Risk Center" },
  { slug: "solutions", label: "Solution Lab" },
  { slug: "decisions", label: "Decision Ledger" },
  { slug: "release", label: "Release Gate" },
] as const;

const SPRING = { type: "spring", stiffness: 480, damping: 38 } as const;

/** Tab row: the active underline slides between tabs; a soft highlight follows the pointer. */
export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <nav aria-label="Project sections" onMouseLeave={() => setHovered(null)}>
      <ul className="no-scrollbar mx-auto flex h-11 w-full max-w-6xl items-stretch gap-1 overflow-x-auto px-3 sm:px-6">
        {PROJECT_TABS.map((tab) => {
          const href = `/p/${projectId}/${tab.slug}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={tab.slug} className="relative flex shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                onMouseEnter={() => setHovered(tab.slug)}
                onFocus={() => setHovered(tab.slug)}
                className={cn(
                  "relative flex items-center px-2.5 text-sm transition-colors duration-200 outline-none",
                  active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {hovered === tab.slug ? (
                  <motion.span
                    layoutId="tab-hover"
                    className="absolute inset-x-0 inset-y-1.5 rounded-md bg-muted"
                    transition={SPRING}
                  />
                ) : null}
                <span className="relative">{tab.label}</span>
                {active ? (
                  <motion.span
                    layoutId="tab-underline"
                    className="absolute inset-x-2.5 -bottom-px h-[2px] bg-primary"
                    transition={SPRING}
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
