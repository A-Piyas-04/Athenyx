import { ADVISORY_NEGATIVES, ADVISORY_QUOTE, COST, GATE_RULES, LIMITS, REVIEW_TYPES } from "@/components/marketing/copy";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/primitives";

/**
 * The page's prose sections. These stay server components: Reveal and Stagger
 * are already client components, so wrapping content in them costs nothing
 * here — the same pattern the sign-in page uses.
 */

/** The product's spine, stated before any feature. */
export function AdvisoryBand() {
  return (
    <section className="border-y border-border">
      <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <Reveal>
          <p className="max-w-[40ch] text-display text-[2.5rem] sm:text-[3.5rem]">{ADVISORY_QUOTE}</p>
        </Reveal>
        <Stagger as="ul" gap={0.07} className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-12">
          {ADVISORY_NEGATIVES.map((item) => (
            <StaggerItem key={item.title} as="li" className="space-y-2">
              <h3 className="text-section">{item.title}</h3>
              <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{item.text}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

/** Why an independent second opinion is worth anything at all. */
export function ProblemSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
      <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
        <Reveal>
          <h2 className="text-title text-3xl sm:text-4xl">
            The expensive mistakes are the ones nobody questioned.
          </h2>
        </Reveal>
        <Reveal delay={0.1} className="space-y-5 text-lg leading-relaxed text-muted-foreground">
          <p>
            Architecture, authorization, data integrity, complexity, test coverage, release readiness — you decide all of
            it while building, usually alone, usually quickly.
          </p>
          <p>
            A weak decision rarely announces itself. It gets more expensive as the project grows around it, and the
            feedback that might have caught it is scattered across tools that only ever saw a snippet.
          </p>
          <p className="text-foreground">
            Athenyx is a second opinion that has read the actual repository, at a commit you chose, and tells you which
            line it is talking about.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/** The six ways in. */
export function ReviewTypesSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
      <div className="max-w-[56ch] space-y-5">
        <p className="text-label">Ways to ask</p>
        <h2 className="text-title text-3xl sm:text-4xl">Six kinds of review. Most need no prompt.</h2>
        <p className="text-lg leading-relaxed text-muted-foreground">
          Press a button for a code-driven review, or describe something in your own words when the code cannot speak for
          itself.
        </p>
      </div>
      <Stagger as="ul" gap={0.05} className="mt-14 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {REVIEW_TYPES.map((type) => (
          <StaggerItem key={type.name} as="li" className="border-t border-border pt-5">
            <h3 className="font-display text-base font-semibold tracking-tight">{type.name}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{type.text}</p>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

/** The advisory verdict, and the rules in code that bound it. */
export function ReleaseGateSection() {
  return (
    <section className="border-y border-border">
      <div className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
          <Reveal className="space-y-5">
            <p className="text-label">Release Gate</p>
            <h2 className="text-title text-3xl sm:text-4xl">An advisory verdict, bounded by rules in code.</h2>
            <p className="text-lg leading-relaxed text-muted-foreground">
              Go, Conditional Go, or No-Go for one commit, combining CI results, whether tests exist, open risks and a
              DevOps and Quality review. The AI does not get the last word on it.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <ul className="space-y-4">
              {GATE_RULES.map((rule) => (
                <li key={rule} className="flex gap-3.5 border-b border-border pb-4 text-[0.9375rem] leading-relaxed">
                  <span aria-hidden="true" className="mt-[7px] size-2 shrink-0 rounded-[2px] bg-gold-700" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/** What it costs, and what a free tier actually means. */
export function CostSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
      <div className="max-w-[56ch] space-y-5">
        <p className="text-label">What it costs</p>
        <h2 className="text-title text-3xl sm:text-4xl">Nothing, and we would rather be honest about why.</h2>
      </div>
      <Stagger as="ul" gap={0.08} className="mt-12 grid gap-10 sm:grid-cols-2 sm:gap-16">
        {COST.map((item) => (
          <StaggerItem key={item.title} as="li" className="space-y-2.5 border-t border-border pt-6">
            <h3 className="text-section">{item.title}</h3>
            <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{item.text}</p>
          </StaggerItem>
        ))}
      </Stagger>
      <Reveal delay={0.1}>
        <p className="mt-14 max-w-[76ch] border-t border-border pt-8 text-sm leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">The limits. </span>
          {LIMITS}
        </p>
      </Reveal>
    </section>
  );
}
