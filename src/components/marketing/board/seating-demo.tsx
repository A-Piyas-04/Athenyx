"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PersonaMark } from "@/components/board/persona-mark";
import { EASE_OUT } from "@/components/motion/primitives";
import { cn } from "@/lib/utils";

/**
 * The claim "nine on the bench, two or three seated" made visible: the bench
 * sits dim and a different review type lights up the seats it typically calls
 * for. Without this, a 3x3 grid of nine specialists reads as a promise that
 * all nine review every commit, which is not what the product does.
 *
 * The seatings are the product's own deterministic defaults
 * (src/lib/review/plan.ts FALLBACK_PERSONAS), so the illustration cannot drift
 * from the behaviour. Normally a small planner call makes the choice.
 *
 * Idle when off-screen; a single static seating under reduced motion.
 */

const SEATINGS: { type: string; seats: string[] }[] = [
  { type: "Project Health", seats: ["architecture", "security", "quality"] },
  { type: "Latest Changes", seats: ["quality", "security", "code_quality"] },
  { type: "Ask About My Codebase", seats: ["architecture"] },
  { type: "Proposal Review", seats: ["architecture", "product_ux"] },
  { type: "Issue Investigation", seats: ["reliability", "quality"] },
  { type: "Release Assessment", seats: ["devops", "quality"] },
];

const CYCLE_MS = 3200;

export function SeatingDemo({ bench }: { bench: string[] }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.2 });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduce || !onScreen) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % SEATINGS.length), CYCLE_MS);
    return () => clearInterval(id);
  }, [reduce, onScreen]);

  const current = SEATINGS[index];
  const seated = new Set(current.seats);

  return (
    <div ref={ref} className="rounded-lg border border-border bg-card p-6 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h3 className="text-section">Each review seats two or three of them.</h3>
        <p className="text-sm text-muted-foreground">
          Typical seating for{" "}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={current.type}
              initial={{ opacity: 0, y: reduce ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -6 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
              className="inline-block font-medium text-foreground"
            >
              {current.type}
            </motion.span>
          </AnimatePresence>
        </p>
      </div>

      <ul className="mt-6 flex flex-wrap gap-2.5">
        {bench.map((key) => {
          const on = seated.has(key);
          return (
            <li key={key}>
              <motion.span
                animate={{ opacity: on ? 1 : 0.28 }}
                transition={{ duration: 0.45, ease: EASE_OUT }}
                className="inline-flex"
              >
                <PersonaMark persona={key} size="md" tone={on ? "gold" : "dim"} />
              </motion.span>
            </li>
          );
        })}
      </ul>

      <p className={cn("mt-6 max-w-[62ch] text-sm leading-relaxed text-muted-foreground")}>
        Which seats are filled depends on the review type and the code it touches. Not every specialist weighs in on every
        review, by design: a focused panel produces findings worth reading — and the review always names who sat.
      </p>
    </div>
  );
}
