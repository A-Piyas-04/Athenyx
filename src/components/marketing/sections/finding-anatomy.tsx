"use client";

import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { FINDING_ANATOMY } from "@/components/marketing/copy";
import { EASE_OUT } from "@/components/motion/primitives";
import { cn } from "@/lib/utils";

/**
 * What you actually receive. The left column sticks while the specimen
 * scrolls, and the label of the part currently in view lights up — scroll
 * position standing in for reading order.
 *
 * The specimen is sample content, not real data, and uses the same example the
 * sign-in illustration does so the two tell one story.
 */

const LINES = [
  { n: 23, code: "  if (!user) return unauthorized();" },
  { n: 24, code: "  const { id } = await params;" },
  { n: 25, code: "  await db.expense.delete({ where: { id } });", hit: true },
  { n: 26, code: "  return new Response(null, { status: 204 });" },
];

export function FindingAnatomySection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.7", "end 0.6"] });
  const [active, setActive] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const next = Math.min(FINDING_ANATOMY.length - 1, Math.floor(p * FINDING_ANATOMY.length));
    setActive((prev) => (prev === next ? prev : next));
  });

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
      <div className="max-w-[56ch] space-y-5">
        <p className="text-label">Anatomy of a finding</p>
        <h2 className="text-title text-3xl sm:text-4xl">Every finding cites the line.</h2>
        <p className="text-lg leading-relaxed text-muted-foreground">
          Not a score, not a paragraph of advice. A specific claim, the code it rests on, and what you could do about it.
        </p>
      </div>

      <div ref={ref} className="mt-16 grid gap-12 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-16">
        <ol className="space-y-3 lg:sticky lg:top-[26vh] lg:self-start">
          {FINDING_ANATOMY.map((part, i) => {
            const on = i === active;
            return (
              <li key={part.label}>
                <div
                  className={cn(
                    "border-l-2 pl-4 transition-all duration-400 ease-[var(--ease-out-quint)]",
                    on ? "border-gold-600" : "border-border",
                  )}
                >
                  <h3
                    className={cn(
                      "font-display text-base font-semibold tracking-tight transition-colors duration-400",
                      on ? "text-foreground" : "text-subtle",
                    )}
                  >
                    {part.label}
                  </h3>
                  <div
                    className="grid transition-[grid-template-rows,opacity] duration-400 ease-[var(--ease-out-quint)]"
                    style={{ gridTemplateRows: on ? "1fr" : "0fr", opacity: on ? 1 : 0 }}
                  >
                    <div className="overflow-hidden">
                      <p className="pt-1 text-sm leading-relaxed text-muted-foreground">{part.text}</p>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {/* The specimen. */}
        <div className="space-y-5">
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5 font-mono text-xs text-muted-foreground">
              <span className="truncate">app/api/expenses/[id]/route.ts</span>
              <span>a1b2c3d</span>
            </div>
            <pre className="overflow-x-auto py-3 font-mono text-[0.8125rem] leading-7">
              {LINES.map((line) => (
                <div key={line.n} className="relative flex">
                  {line.hit ? <span className="absolute inset-0 bg-primary/25" /> : null}
                  <span className="relative w-12 shrink-0 pr-4 text-right text-subtle">{line.n}</span>
                  <span className="relative pr-4 whitespace-pre">{line.code}</span>
                </div>
              ))}
            </pre>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
            className="rounded-lg border border-border-strong bg-popover p-6"
            style={{ boxShadow: "var(--depth-shadow)" }}
          >
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium">
              <span className="size-2 rounded-[2px] bg-sev-high" />
              High
              <span className="text-muted-foreground">Verified defect · raised by the Security Adversary</span>
            </div>
            <h3 className="mt-2.5 font-display text-xl leading-snug font-semibold tracking-tight">
              Delete checks login, not ownership
            </h3>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">
              Any signed-in user can delete any expense by guessing its id. Cited at line 25 of the commit above.
            </p>
            <dl className="mt-5 space-y-3 border-t border-border pt-5 text-sm">
              <div>
                <dt className="font-medium">Option A — scope the query to the owner</dt>
                <dd className="mt-0.5 text-muted-foreground">
                  One line, no new concepts. Does not help the next route that forgets.
                </dd>
              </div>
              <div>
                <dt className="font-medium">Option B — an ownership check every route calls</dt>
                <dd className="mt-0.5 text-muted-foreground">
                  Fixes the class of bug. More to write, and every existing route has to adopt it.
                </dd>
              </div>
            </dl>
            <p className="mt-5 border-t border-border pt-5 text-sm leading-relaxed">
              <span className="font-medium">Verify. </span>
              <span className="text-muted-foreground">
                Sign in as one user and request another user&rsquo;s expense id. Expect 404, not 204.
              </span>
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
