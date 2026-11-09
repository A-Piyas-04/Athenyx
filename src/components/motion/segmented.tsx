"use client";

import { useId } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const PILL_SPRING = { type: "spring", stiffness: 500, damping: 40 } as const;

/** A radio-style segmented control; the selection slides between options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const layoutId = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("no-scrollbar inline-flex max-w-full gap-0.5 overflow-x-auto rounded-md bg-muted p-1", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative shrink-0 rounded-[3px] px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-[3px] border border-border-strong bg-card shadow-sm shadow-black/5 dark:bg-background"
                transition={PILL_SPRING}
              />
            ) : null}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The same control for URL-driven filters: each option is a link. */
export function SegmentedLinks({
  items,
  label,
  className,
}: {
  items: { href: string; label: string; active: boolean; count?: number }[];
  label: string;
  className?: string;
}) {
  const layoutId = useId();
  return (
    <nav aria-label={label} className={cn("no-scrollbar inline-flex max-w-full gap-0.5 overflow-x-auto rounded-md bg-muted p-1", className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          scroll={false}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "relative shrink-0 rounded-[3px] px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-200",
            item.active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.active ? (
            <motion.span
              layoutId={layoutId}
              className="absolute inset-0 rounded-[3px] border border-border-strong bg-card shadow-sm shadow-black/5 dark:bg-background"
              transition={PILL_SPRING}
            />
          ) : null}
          <span className="relative inline-flex items-center gap-1.5">
            {item.label}
            {item.count !== undefined ? <span className="text-xs text-muted-foreground tabular-nums">{item.count}</span> : null}
          </span>
        </Link>
      ))}
    </nav>
  );
}
