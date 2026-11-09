"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { SURFACES } from "@/components/marketing/copy";

/**
 * The six tabs. On wide screens the row drifts sideways as the section passes,
 * which shows there is more to the right without a scrollbar; below lg it is a
 * plain grid, because horizontal drift on a phone just hides content.
 */
export function SurfacesSection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const x = useTransform(scrollYProgress, [0, 1], ["2%", "-12%"]);

  return (
    <section id="surfaces" ref={ref} className="w-full overflow-hidden py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="max-w-[56ch] space-y-5">
          <p className="text-label">The product</p>
          <h2 className="text-title text-3xl sm:text-4xl">Six places to work, and nothing else to learn.</h2>
          <p className="text-lg leading-relaxed text-muted-foreground">
            One coherent dashboard. There is no tab per specialist — the board shows up where its findings do.
          </p>
        </div>
      </div>

      <motion.ul
        style={{ x }}
        className="mx-auto mt-14 grid max-w-6xl gap-5 px-5 sm:grid-cols-2 sm:px-8 lg:grid-cols-6 lg:gap-4 lg:px-8 motion-reduce:translate-x-0"
      >
        {SURFACES.map((surface, i) => (
          <li
            key={surface.name}
            className="group rounded-lg border border-border bg-card p-5 transition-[border-color,transform] duration-300 ease-[var(--ease-out-quint)] hover:-translate-y-1 hover:border-border-strong motion-reduce:hover:translate-y-0"
          >
            <span className="font-mono text-xs text-subtle">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="mt-2 font-display text-base font-semibold tracking-tight">{surface.name}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{surface.text}</p>
          </li>
        ))}
      </motion.ul>
    </section>
  );
}
