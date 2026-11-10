"use client";

import { motion } from "motion/react";
import type { ReleaseVerdict } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const SEGMENTS: { verdict: ReleaseVerdict; from: number; to: number; tone: string }[] = [
  { verdict: "NO_GO", from: 180, to: 122, tone: "stroke-bad" },
  { verdict: "CONDITIONAL_GO", from: 118, to: 62, tone: "stroke-warn" },
  { verdict: "GO", from: 58, to: 0, tone: "stroke-ok" },
];

/** Needle angle (degrees from pointing straight up). */
const NEEDLE: Record<ReleaseVerdict, number> = { NO_GO: -60, CONDITIONAL_GO: 0, GO: 60 };

/** Round so server and client serialize identical path strings (sin/cos differ by a ULP across JS engines, which trips React hydration). */
const round = (n: number) => Math.round(n * 1000) / 1000;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: round(cx + r * Math.cos(rad)), y: round(cy - r * Math.sin(rad)) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y}`;
}

/**
 * A half-dial from No-Go to Go. The verdict's segment lights up and the
 * needle swings to it. The verdict is the only input; there is no score.
 */
export function VerdictGauge({
  verdict,
  size = 220,
  labels = true,
  className,
}: {
  verdict: ReleaseVerdict;
  size?: number;
  labels?: boolean;
  className?: string;
}) {
  const w = 200;
  const h = labels ? 122 : 108;
  const cx = 100;
  const cy = 100;
  const r = 82;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={(size * h) / w}
      role="img"
      aria-label={`Release verdict gauge: ${verdict.replace("_", " ").toLowerCase()}`}
      className={cn("overflow-visible", className)}
    >
      {/* Tick marks give the dial its instrument feel. */}
      {Array.from({ length: 19 }, (_, i) => {
        const deg = 180 - i * 10;
        const a = polar(cx, cy, r - 15, deg);
        const b = polar(cx, cy, r - (i % 3 === 0 ? 22 : 19), deg);
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-border-strong" strokeWidth={1} />;
      })}

      {SEGMENTS.map((s, i) => {
        const active = s.verdict === verdict;
        return (
          <motion.path
            key={s.verdict}
            d={arc(cx, cy, r, s.from, s.to)}
            fill="none"
            strokeWidth={active ? 12 : 8}
            strokeLinecap="butt"
            className={active ? s.tone : "stroke-muted"}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, delay: 0.1 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
          />
        );
      })}

      <motion.g
        style={{ transformBox: "view-box", originX: `${cx}px`, originY: `${cy}px` }}
        initial={{ rotate: -90 }}
        animate={{ rotate: NEEDLE[verdict] }}
        transition={{ type: "spring", stiffness: 70, damping: 9, delay: 0.45 }}
      >
        <path d={`M ${cx - 3.5} ${cy} L ${cx} ${cy - r + 12} L ${cx + 3.5} ${cy} Z`} className="fill-foreground" />
      </motion.g>
      <rect x={cx - 7} y={cy - 7} width={14} height={14} rx={3} className="fill-foreground" />
      <rect x={cx - 3} y={cy - 3} width={6} height={6} rx={1} className="fill-background" />

      {labels ? (
        <g className="fill-muted-foreground" fontSize={9.5} fontFamily="var(--font-body)">
          <text x={cx - r} y={h - 2} textAnchor="middle">
            No-Go
          </text>
          <text x={cx + r} y={h - 2} textAnchor="middle">
            Go
          </text>
        </g>
      ) : null}
    </svg>
  );
}
