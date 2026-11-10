"use client";

import { useId } from "react";
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
const R = 46;
const W = 13; // stroke width — a chunky tube reads more three-dimensional
const CIRC = 2 * Math.PI * R;
const GAP = 3; // px of arc length between segments

/**
 * A circular health gauge: open findings drawn as a donut, each severity its
 * own arc, the total open count at the centre. A vertical sheen (light at the
 * top, shaded at the bottom) and a soft drop shadow give the ring a raised,
 * glossy-tube look without making it literally 3D. The worst open severity
 * colours the number, so a glance reads both the amount and the seriousness.
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
  const uid = useId().replace(/[:]/g, "");
  const sheenId = `ring-sheen-${uid}`;
  const depthId = `ring-depth-${uid}`;
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
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} width={size} height={size} role="img" aria-label={`${total} open findings by severity`} className="overflow-visible">
        <defs>
          {/* Top-light, bottom-shade: the gloss that makes the ring read as a rounded tube. */}
          <linearGradient id={sheenId} gradientUnits="userSpaceOnUse" x1={C} y1={C - R - W} x2={C} y2={C + R + W}>
            <stop offset="0%" stopColor="#fff" stopOpacity={0.5} />
            <stop offset="34%" stopColor="#fff" stopOpacity={0.08} />
            <stop offset="50%" stopColor="#fff" stopOpacity={0} />
            <stop offset="66%" stopColor="#000" stopOpacity={0.06} />
            <stop offset="100%" stopColor="#000" stopOpacity={0.38} />
          </linearGradient>
          {/* Soft shadow under the ring to lift it off the surface. */}
          <filter id={depthId} x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow dx="0" dy="2.5" stdDeviation="3" floodColor="#000" floodOpacity={0.45} />
          </filter>
        </defs>

        <g filter={`url(#${depthId})`}>
          {/* Track. */}
          <circle cx={C} cy={C} r={R} fill="none" strokeWidth={W} className="stroke-muted" />

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
                  strokeWidth={W}
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

          {/* Gloss overlay across the whole ring. */}
          <circle cx={C} cy={C} r={R} fill="none" strokeWidth={W} stroke={`url(#${sheenId})`} className="pointer-events-none" />
        </g>
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn(
            "font-semibold tabular-nums leading-none",
            worst ? worst.stroke.replace("stroke-", "text-") : "text-ok",
          )}
          style={{ fontSize: size * 0.2 }}
        >
          {total}
        </span>
        <span className="mt-1.5 uppercase tracking-wide text-muted-foreground" style={{ fontSize: Math.max(10, size * 0.052) }}>
          {total === 1 ? "open risk" : "open risks"}
        </span>
      </div>
    </div>
  );
}
