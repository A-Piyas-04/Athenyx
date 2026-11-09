"use client";

import { motion } from "motion/react";
import { EASE_OUT } from "@/components/motion/primitives";
import { PersonaMark } from "@/components/board/persona-mark";

/**
 * Why the citations can be trusted: a short self-contained timeline where one
 * claim is struck out because its cited lines do not exist in the reviewed
 * commit, and two duplicates collapse into one. Plays once on entry — it is
 * not scroll-linked, because the scroll position has no meaning here.
 */

const CLAIMS = [
  { text: "Delete checks login, not ownership", by: "security", state: "kept" as const },
  { text: "Unbounded query in the expenses list", by: "reliability", state: "merged" as const },
  { text: "Missing index on expenses.userId", by: "data_integrity", state: "merged" as const },
  { text: "Rate limiting absent on line 402", by: "security", state: "dropped" as const },
];

const LABEL = {
  kept: "Citation matched · kept",
  merged: "Duplicate · merged into one finding",
  dropped: "Cited lines not found at this commit · dropped",
};

export function ArbiterSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
        <div className="space-y-5">
          <p className="text-label">Evidence discipline</p>
          <h2 className="text-title text-3xl sm:text-4xl">A claim that cannot be matched never reaches you.</h2>
          <p className="text-lg leading-relaxed text-muted-foreground">
            Before you see anything, every citation is checked in code against the reviewed commit. Claims whose lines
            cannot be found are dropped. Duplicates raised by different specialists are merged. The snippet stored with a
            finding is copied from your repository, never from the model.
          </p>
        </div>

        <ul className="space-y-3">
          {CLAIMS.map((claim, i) => (
            <motion.li
              key={claim.text}
              initial={{ opacity: 0, x: 12 }}
              whileInView={{
                opacity: claim.state === "dropped" ? 0.5 : 1,
                x: 0,
              }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5, delay: 0.15 + i * 0.18, ease: EASE_OUT }}
              className="flex items-start gap-3.5 rounded-lg border border-border bg-card p-4"
            >
              <PersonaMark persona={claim.by} size="sm" tone={claim.state === "dropped" ? "dim" : "active"} />
              <div className="min-w-0 space-y-1">
                <p
                  className={
                    claim.state === "dropped"
                      ? "text-sm font-medium text-muted-foreground line-through decoration-destructive/70"
                      : "text-sm font-medium"
                  }
                >
                  {claim.text}
                </p>
                <p className="text-xs text-muted-foreground">{LABEL[claim.state]}</p>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
