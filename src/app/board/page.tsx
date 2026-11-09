import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PersonaCrest } from "@/components/marketing/board/persona-crest";
import { ARBITER_FOCUS, PERSONA_EXAMPLES, SEATING_NOTE } from "@/components/marketing/copy";
import { Reveal } from "@/components/motion/primitives";
import { ROSTER } from "@/lib/review/board";

export const metadata: Metadata = {
  title: "The review board · Athenyx",
  description:
    "The nine specialist reviewers on the Athenyx bench, what each one looks at, and how two or three of them are seated for any one review.",
};

/**
 * Who the nine specialists are, in full.
 *
 * This lives at a top-level route rather than under /p/[projectId] for two
 * reasons: the documented UX rule is not to add a seventh project tab, and the
 * roster is the same for every project, so there is nothing project-specific
 * to scope it to. It is also linkable from the landing page.
 *
 * Everything here derives from ROSTER, the same source the in-app review board
 * renders from.
 */
export default function BoardPage() {
  const core = ROSTER.filter((seat) => seat.kind === "core");
  const others = ROSTER.filter((seat) => seat.kind !== "core");

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back
      </Link>

      <header className="mt-8 max-w-[62ch] space-y-5">
        <h1 className="text-display text-[2.5rem] sm:text-[3.5rem]">The review board.</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          {core.length} specialists, each arguing from one discipline and each told what <em>not</em> to flag, so they
          disagree in useful ways instead of repeating one another.
        </p>
        <p className="leading-relaxed text-muted-foreground">{SEATING_NOTE}</p>
      </header>

      <ul className="mt-14 space-y-10">
        {core.map((seat, i) => (
          <Reveal as="li" key={seat.key} delay={Math.min(i * 0.04, 0.3)}>
            <div className="flex flex-col gap-5 border-t border-border pt-8 sm:flex-row sm:gap-7">
              <PersonaCrest persona={seat.key} size={72} />
              <div className="min-w-0 space-y-2">
                <h2 className="font-display text-xl font-semibold tracking-tight">{seat.name}</h2>
                <p className="max-w-[70ch] leading-relaxed text-muted-foreground">{seat.focus}</p>
                {PERSONA_EXAMPLES[seat.key] ? (
                  <p className="max-w-[70ch] text-sm leading-relaxed">
                    <span className="font-medium">For example. </span>
                    <span className="text-muted-foreground">{PERSONA_EXAMPLES[seat.key]}</span>
                  </p>
                ) : null}
              </div>
            </div>
          </Reveal>
        ))}
      </ul>

      <h2 className="mt-20 text-title text-2xl">The two seats that are not reviewers</h2>
      <ul className="mt-8 space-y-10">
        {others.map((seat) => (
          <li key={seat.key} className="flex flex-col gap-5 border-t border-border pt-8 sm:flex-row sm:gap-7">
            <PersonaCrest persona={seat.key} size={56} />
            <div className="min-w-0 space-y-2">
              <h3 className="font-display text-lg font-semibold tracking-tight">{seat.name}</h3>
              <p className="max-w-[70ch] leading-relaxed text-muted-foreground">
                {seat.key === "evidence_arbiter" ? (
                  <>Not a reviewer &mdash; the validator. {ARBITER_FOCUS} It runs on every review, in code.</>
                ) : (
                  <>A conditional seat, filled only when the project involves AI or ML. {seat.focus}</>
                )}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
