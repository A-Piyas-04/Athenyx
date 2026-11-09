import { UserRound } from "lucide-react";
import { PERSONA_ICONS } from "@/components/board/persona-mark";
import { CrestPattern } from "@/components/marketing/board/crest-pattern";
import { cn } from "@/lib/utils";

/**
 * A specialist's crest: the hallmark language of the brand mark applied to one
 * seat. A square punch in umber, an engraved ground unique to that specialist,
 * two gold plates stepped in tone, and the specialist's own icon struck into
 * the top plate.
 *
 * Pure SVG so it is crisp at any size, correct in both themes and needs no
 * image asset. The `lifted` prop separates the plates — the grid passes it on
 * hover, and withholds it under reduced motion.
 */
export function PersonaCrest({
  persona,
  size = 96,
  lifted = false,
  className,
}: {
  persona: string;
  size?: number;
  lifted?: boolean;
  className?: string;
}) {
  const Icon = PERSONA_ICONS[persona] ?? UserRound;
  const clipId = `crest-clip-${persona}`;

  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="3" y="3" width="90" height="90" rx="5" />
        </clipPath>
      </defs>

      {/* The punch. */}
      <rect x="0" y="0" width="96" height="96" rx="6" fill="#412201" />
      <g clipPath={`url(#${clipId})`}>
        <CrestPattern persona={persona} />
      </g>
      {/* The engraved shoulder. */}
      <rect
        x="3.75"
        y="3.75"
        width="88.5"
        height="88.5"
        rx="4"
        fill="none"
        stroke="#614501"
        strokeWidth="1.5"
        className={cn("transition-colors duration-300 ease-[var(--ease-out-quint)]", lifted && "stroke-gold-800")}
      />

      {/* Two plates stepped in tone, the way the brand mark steps its bars. */}
      <g
        className="transition-transform duration-300 ease-[var(--ease-out-quint)]"
        style={{ transform: lifted ? "translate(1px, 1px)" : "translate(0, 0)" }}
      >
        <rect x="24" y="24" width="50" height="50" rx="4" fill="#806800" />
      </g>
      <g
        className="transition-transform duration-300 ease-[var(--ease-out-quint)]"
        style={{ transform: lifted ? "translate(-1.5px, -1.5px)" : "translate(0, 0)" }}
      >
        <rect x="22" y="22" width="50" height="50" rx="4" fill="#c1ab01" />
        {/* The milled top edge that catches the light. */}
        <rect x="22" y="22" width="50" height="2" rx="1" fill="#e1c802" opacity="0.75" />
        <Icon x={33} y={33} width={28} height={28} stroke="#412201" strokeWidth={1.75} fill="none" />
      </g>
    </svg>
  );
}
