"use client";

import { motion, useReducedMotion } from "motion/react";
import type { Severity } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

/** Severity order and the stroke colour each ring segment uses. */
const RING: { severity: Severity; stroke: string }[] = [
  { severity: "CRITICAL", stroke: "stroke-sev-critical" },
  { severity: "HIGH", stroke: "stroke-sev-high" },
  { severity: "MEDIUM", stroke: "stroke-sev-medium" },
  { severity: "LOW", stroke: "stroke-sev-low" },
  { severity: "INFO", stroke: "stroke-sev-info" },
];

const VIEW = 120;
const C = 60;
const R = 50;
const CIRC = 2 * Math.PI * R;
const GAP = 3; // px of arc length between segments

/**
 * A circular health gauge: open findings drawn as a donut, each severity its
 * own arc, the total open count at the centre. The worst severity colours the
 * number, so a glance reads both the amount and the seriousness.
 */
export function SeverityRing({
  counts,
  total,
  size = 168,
  className,
}: {
  counts: Partial<Record<Severity, number>>;
  total: number;
  size?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const worst = RING.find((r) => (counts[r.severity] ?? 0) > 0);

  // Walk the ring clockwise from 12 o'clock, laying each segment after the last.
  const segments = RING.reduce<
    { list: { severity: Severity; stroke: string; count: number; len: number; offset: number }[]; cursor: number }
  >(
    (acc, { severity, stroke }) => {
      const count = counts[severity] ?? 0;
      const frac = total > 0 ? count / total : 0;
      const len = Math.max(0, frac * CIRC - (count > 0 ? GAP : 0));
      acc.list.push({ severity, stroke, count, len, offset: acc.cursor });
      return { list: acc.list, cursor: acc.cursor + frac * CIRC };
    },
    { list: [], cursor: 0 },
  ).list;

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} width={size} height={size} role="img" aria-label={`${total} open findings by severity`}>
        {/* Track. */}
        <circle cx={C} cy={C} r={R} fill="none" strokeWidth={10} className="stroke-muted" />

        {/* Segments, drawn clockwise from the top (−90° via the group rotate). */}
        <g transform={`rotate(-90 ${C} ${C})`}>
          {segments.map((s) =>
            s.count > 0 ? (
              <motion.circle
                key={s.severity}
                cx={C}
                cy={C}
                r={R}
                fill="none"
                strokeWidth={10}
                strokeLinecap="butt"
                className={s.stroke}
                strokeDasharray={`${s.len} ${CIRC}`}
                strokeDashoffset={-s.offset}
                initial={reduce ? false : { strokeDasharray: `0 ${CIRC}` }}
                animate={{ strokeDasharray: `${s.len} ${CIRC}` }}
                transition={reduce ? { duration: 0 } : { duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              />
            ) : null,
          )}
        </g>
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-3xl font-semibold tabular-nums leading-none", worst ? worst.stroke.replace("stroke-", "text-") : "text-ok")}>
          {total}
        </span>
        <span className="mt-1 text-[0.6875rem] uppercase tracking-wide text-muted-foreground">
          {total === 1 ? "open risk" : "open risks"}
        </span>
      </div>
    </div>
  );
}
