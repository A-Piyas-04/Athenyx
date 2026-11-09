import { PersonaPortrait } from "@/components/marketing/board/persona-portrait";
import { BoardGrid, type BoardSeat } from "@/components/marketing/board/board-grid";
import { SeatingDemo } from "@/components/marketing/board/seating-demo";
import { ARBITER_FOCUS, PERSONA_EXAMPLES } from "@/components/marketing/copy";
import { Reveal } from "@/components/motion/primitives";
import { ROSTER, seatFor } from "@/lib/review/board";

/**
 * The nine specialists — the reason this page exists.
 *
 * Names and focus lines come from ROSTER, the same source the app's review
 * board renders from, so the page cannot drift from the product. This stays a
 * server component on purpose: ROSTER reaches PERSONAS, whose objects carry
 * the full reviewer system prompts, and importing it from a client component
 * would ship every one of those briefs to the browser.
 */
export function BoardSection() {
  const core = ROSTER.filter((seat) => seat.kind === "core");
  const seats: BoardSeat[] = core.map((seat) => ({
    key: seat.key,
    name: seat.name,
    focus: seat.focus,
    example: PERSONA_EXAMPLES[seat.key] ?? "",
  }));

  const aiMl = seatFor("ai_ml");

  return (
    <section id="board" className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
      <div className="max-w-[60ch] space-y-5">
        <p className="text-label">The review board</p>
        <h2 className="text-title text-4xl sm:text-5xl">{core.length} specialists on the bench.</h2>
        <p className="text-lg leading-relaxed text-muted-foreground">
          Each one argues from a single discipline and is told what <em>not</em> to flag, so they disagree in useful ways
          rather than all repeating the same warning. Every review seats the two or three whose expertise the code at hand
          actually calls for — and names who sat.
        </p>
      </div>

      <div className="mt-16">
        <BoardGrid seats={seats} />
      </div>

      <Reveal delay={0.05} className="mt-16">
        <SeatingDemo bench={core.map((seat) => seat.key)} />
      </Reveal>

      {/* The two seats that are not ordinary reviewers. */}
      <Reveal delay={0.1}>
        <ul className="mt-12 grid gap-10 border-t border-border pt-10 sm:grid-cols-2 sm:gap-16">
          <li className="flex gap-5">
            <PersonaPortrait persona="evidence_arbiter" size={56} />
            <div className="space-y-1.5">
              <h3 className="text-section">The Evidence Arbiter</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Not a reviewer — the validator. {ARBITER_FOCUS} It runs on every review, in code.
              </p>
            </div>
          </li>
          <li className="flex gap-5">
            <PersonaPortrait persona="ai_ml" size={56} />
            <div className="space-y-1.5">
              <h3 className="text-section">{aiMl.name}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                A tenth seat, filled only when the project involves AI or ML. {aiMl.focus}
              </p>
            </div>
          </li>
        </ul>
      </Reveal>
    </section>
  );
}
