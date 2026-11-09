"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { PersonaPortrait } from "@/components/marketing/board/persona-portrait";
import { EASE_OUT } from "@/components/motion/primitives";

/** Only what the grid needs. Prompt briefs never cross to the client. */
export type BoardSeat = { key: string; name: string; focus: string; example: string };

/**
 * The nine specialists as cards you can turn over.
 *
 * Hovering lifts a card toward you on a real perspective — it is translated on
 * Z, not just scaled, so neighbouring cards keep their own vanishing point.
 * Clicking turns it: the face rotates away and the back arrives, its contents
 * settling out of a slight over-scale. Clicking again plays that backwards —
 * the contents shrink first, then the card turns back — so the two directions
 * are not the same animation mirrored, which is what makes it feel physical.
 *
 * Under reduced motion the card still turns over, because the back holds real
 * information, but the lift, the over-scale and the shrink are dropped.
 */

/** How long the contents shrink for before the card turns back. */
const SHRINK_MS = 210;

type Phase = "front" | "back" | "closing";

function Card({ seat, index }: { seat: BoardSeat; index: number }) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("front");
  const [hovered, setHovered] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const turned = phase === "back" || phase === "closing";

  useEffect(() => {
    if (phase !== "closing") return;
    timer.current = setTimeout(() => setPhase("front"), SHRINK_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [phase]);

  function toggle() {
    setPhase((p) => (p === "front" ? "back" : p === "back" ? "closing" : p));
  }

  // The back's contents zoom out to settle, then shrink again on the way out.
  const backScale = reduce ? 1 : phase === "back" ? 1 : phase === "closing" ? 0.85 : 1.15;

  return (
    <motion.li
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.06, 0.4), ease: EASE_OUT }}
      style={{ perspective: 1400 }}
      className="h-[25rem]"
    >
      <motion.button
        type="button"
        onClick={toggle}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        aria-pressed={turned}
        aria-label={
          turned
            ? `${seat.name}. ${seat.focus} For example: ${seat.example} Activate to turn the card back.`
            : `${seat.name}. ${seat.focus} Activate to read what they catch.`
        }
        animate={{
          rotateY: turned ? 180 : 0,
          z: reduce ? 0 : hovered ? 70 : 0,
          rotateX: reduce || !hovered ? 0 : -3,
        }}
        transition={{ type: "spring", stiffness: 190, damping: 24, mass: 0.9 }}
        style={{ transformStyle: "preserve-3d" }}
        className="relative block h-full w-full cursor-pointer rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      >
        {/* Front */}
        <div
          className="absolute inset-0 flex flex-col rounded-lg border border-border bg-card p-6 transition-colors duration-300"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            boxShadow: hovered && !turned ? "var(--depth-shadow)" : undefined,
          }}
        >
          <PersonaPortrait persona={seat.key} size={116} active={hovered && !turned} />
          <h3 className="mt-5 font-display text-lg leading-snug font-semibold tracking-tight">{seat.name}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{seat.focus}</p>
          <span className="mt-auto pt-4 text-xs font-medium text-subtle">Turn the card →</span>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 flex flex-col justify-center rounded-lg border border-border-strong bg-popover p-6"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            boxShadow: hovered && turned ? "var(--depth-shadow)" : undefined,
          }}
        >
          <motion.div
            animate={{ scale: backScale, opacity: phase === "back" ? 1 : reduce ? 1 : 0.4 }}
            transition={
              phase === "closing"
                ? { duration: SHRINK_MS / 1000, ease: "easeIn" }
                : { duration: 0.42, ease: EASE_OUT }
            }
          >
            <p className="text-label">What they catch</p>
            <h3 className="mt-2 font-display text-xl leading-snug font-semibold tracking-tight">{seat.name}</h3>
            <p className="mt-4 text-[0.9375rem] leading-relaxed">{seat.example}</p>
            <p className="mt-5 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">
              {seat.focus}
            </p>
            <span className="mt-6 block text-xs font-medium text-subtle">← Turn it back</span>
          </motion.div>
        </div>
      </motion.button>
    </motion.li>
  );
}

export function BoardGrid({ seats }: { seats: BoardSeat[] }) {
  return (
    <ul className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
      {seats.map((seat, i) => (
        <Card key={seat.key} seat={seat} index={i} />
      ))}
    </ul>
  );
}
