"use client";

import { motion, useReducedMotion } from "motion/react";
import { CrestPattern } from "@/components/marketing/board/crest-pattern";
import { PersonaAvatar } from "@/components/marketing/board/persona-avatar";
import { cn } from "@/lib/utils";

/**
 * A specialist's portrait plate: the hallmark crest with the person struck
 * into it.
 *
 * The crest language from the rest of the brand stays exactly as it was — the
 * umber punch, the engraved ground unique to each seat, the stepped gold
 * plates and the milled top edge — and the bust sits in a window cut through
 * the plate, the way a head sits on a coin.
 *
 * `active` is passed down from the card: the plates separate, the frame
 * brightens, and the person looks up.
 */
export function PersonaPortrait({
  persona,
  size = 124,
  active = false,
  className,
}: {
  persona: string;
  size?: number;
  active?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const lifted = active && !reduce;
  const windowId = `portrait-window-${persona}`;
  const groundId = `portrait-ground-${persona}`;

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden="true"
      className={cn("shrink-0 overflow-visible", className)}
    >
      <defs>
        <clipPath id={groundId}>
          <rect x="3" y="3" width="114" height="114" rx="5" />
        </clipPath>
        {/* The bust is cut to the plate window, so it reads as struck into it. */}
        <clipPath id={windowId}>
          <rect x="22" y="20" width="76" height="90" rx="5" />
        </clipPath>
      </defs>

      {/* The punch and its engraved ground. */}
      <rect x="0" y="0" width="120" height="120" rx="6" fill="#412201" />
      <g clipPath={`url(#${groundId})`} transform="translate(0 0)">
        <CrestPattern persona={persona} />
      </g>

      <motion.rect
        x="3.75"
        y="3.75"
        width="112.5"
        height="112.5"
        rx="4"
        fill="none"
        strokeWidth="1.5"
        animate={{ stroke: lifted ? "#a28900" : "#614501" }}
        transition={{ duration: 0.3 }}
      />

      {/* The under-plate, offset so the stack reads as two layers of metal.
          Motion applies x/y as a transform, so these animate the delta only —
          the resting position lives in the rect's own attributes. */}
      <motion.rect
        x="26"
        y="24"
        width="76"
        height="90"
        rx="5"
        fill="#806800"
        animate={{ x: lifted ? 1.5 : 0, y: lifted ? 1.5 : 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
      />

      {/* The portrait plate itself, with the bust inside it. */}
      <motion.g
        animate={{ x: lifted ? -1.5 : 0, y: lifted ? -1.5 : 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
      >
        <rect x="22" y="20" width="76" height="90" rx="5" fill="#c1ab01" />
        <g clipPath={`url(#${windowId})`}>
          {/* "slice" fills the window and crops the bust, rather than
              letterboxing a square portrait into a tall opening. */}
          <PersonaAvatar
            persona={persona}
            active={active}
            x={22}
            y={20}
            width={76}
            height={90}
            preserveAspectRatio="xMidYMax slice"
          />
        </g>
        {/* The milled top edge that catches the light. */}
        <rect x="22" y="20" width="76" height="2.5" rx="1.25" fill="#e1c802" opacity="0.8" />
      </motion.g>
    </svg>
  );
}
