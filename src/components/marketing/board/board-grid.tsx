"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { PersonaCrest } from "@/components/marketing/board/persona-crest";
import { EASE_OUT } from "@/components/motion/primitives";

/** Only what the grid needs. Prompt briefs never cross to the client. */
export type BoardSeat = { key: string; name: string; focus: string; example: string };

/**
 * The nine specialists. Hovering or focusing one seat lifts its crest and
 * expands its example concern while the rest of the bench quietens — the board
 * turning to look at whoever is speaking.
 *
 * The example text is information, not decoration, so it still expands under
 * reduced motion; only the plate separation and the dimming are dropped.
 */
export function BoardGrid({ seats }: { seats: BoardSeat[] }) {
  const [active, setActive] = useState<string | null>(null);
  const reduce = useReducedMotion();

  return (
    <ul className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
      {seats.map((seat, i) => {
        const on = active === seat.key;
        const dimmed = !reduce && active !== null && !on;
        return (
          <motion.li
            key={seat.key}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay: Math.min(i * 0.06, 0.4), ease: EASE_OUT }}
          >
            <div
              onPointerEnter={() => setActive(seat.key)}
              onPointerLeave={() => setActive((p) => (p === seat.key ? null : p))}
              onFocus={() => setActive(seat.key)}
              onBlur={() => setActive((p) => (p === seat.key ? null : p))}
              tabIndex={0}
              aria-label={`${seat.name}. ${seat.focus} For example: ${seat.example}`}
              className="group h-full rounded-lg border border-border bg-card p-6 outline-none transition-[border-color,transform,box-shadow] duration-300 ease-[var(--ease-out-quint)] hover:-translate-y-1 hover:border-border-strong focus-visible:border-border-strong motion-reduce:hover:translate-y-0"
              style={{
                opacity: dimmed ? 0.45 : 1,
                transitionProperty: "border-color, transform, box-shadow, opacity",
                boxShadow: on ? "var(--depth-shadow)" : undefined,
              }}
            >
              <PersonaCrest persona={seat.key} size={76} lifted={on && !reduce} />
              <h3 className="mt-5 font-display text-lg leading-snug font-semibold tracking-tight">{seat.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{seat.focus}</p>

              {/* grid-template-rows animates; height does not. */}
              <div
                className="grid transition-[grid-template-rows,opacity] duration-400 ease-[var(--ease-out-quint)]"
                style={{ gridTemplateRows: on ? "1fr" : "0fr", opacity: on ? 1 : 0 }}
              >
                <div className="overflow-hidden">
                  <p className="mt-4 border-t border-border pt-4 text-sm leading-relaxed">
                    <span className="font-medium">For example. </span>
                    <span className="text-muted-foreground">{seat.example}</span>
                  </p>
                </div>
              </div>
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}
