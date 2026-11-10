"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * One reading on a dial: the lit arc colour, the legend marker colour, and the
 * sentence that explains what lands the needle there.
 */
type Band = {
  key: string;
  label: string;
  /** Tailwind `stroke-*` utility for the lit arc. */
  stroke: string;
  /** Tailwind `bg-*` utility for the legend marker. */
  dot: string;
  note: string;
};

/** source: README.md:165 — the caps are enforced in code, not by the model. */
const VERDICT_BANDS: Band[] = [
  {
    key: "NO_GO",
    label: "No-Go",
    stroke: "stroke-bad",
    dot: "bg-bad",
    note: "Any open critical finding pins the needle here.",
  },
  {
    key: "CONDITIONAL_GO",
    label: "Conditional Go",
    stroke: "stroke-warn",
    dot: "bg-warn",
    note: "Open high findings, failing CI, or no tests at all cap it here.",
  },
  {
    key: "GO",
    label: "Go",
    stroke: "stroke-ok",
    dot: "bg-ok",
    note: "No open criticals, CI green, and tests present.",
  },
];

/** The same five severities the Risk Center sorts by, in the same colours. */
const SEVERITY_BANDS: Band[] = [
  {
    key: "CRITICAL",
    label: "Critical",
    stroke: "stroke-sev-critical",
    dot: "bg-sev-critical",
    note: "Exploitable, or data loss in normal use.",
  },
  {
    key: "HIGH",
    label: "High",
    stroke: "stroke-sev-high",
    dot: "bg-sev-high",
    note: "A likely user-visible failure or security gap.",
  },
  {
    key: "MEDIUM",
    label: "Medium",
    stroke: "stroke-sev-medium",
    dot: "bg-sev-medium",
    note: "Real, but bounded in blast radius.",
  },
  {
    key: "LOW",
    label: "Low",
    stroke: "stroke-sev-low",
    dot: "bg-sev-low",
    note: "Worth fixing while the file is open anyway.",
  },
  {
    key: "INFO",
    label: "Info",
    stroke: "stroke-sev-info",
    dot: "bg-sev-info",
    note: "Noted for the record; no action implied.",
  },
];

// Dial geometry. The sweep is a half circle, drawn from 180° (left) to 0°.
const SPAN = 180;
const GAP = 4;
const CX = 100;
const CY = 100;
const R = 84;
const VIEW_W = 200;
const VIEW_H = 112;

/** Round to a fixed precision so the server and client serialize paths identically (avoids hydration drift from sin/cos ULP differences across JS engines). */
const round = (n: number) => Math.round(n * 1000) / 1000;

function polar(r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: round(CX + r * Math.cos(rad)), y: round(CY - r * Math.sin(rad)) };
}

function arc(r: number, from: number, to: number) {
  const a = polar(r, from);
  const b = polar(r, to);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y}`;
}

/** The band's slice of the sweep, inset by half a gap at each end. */
function bandArc(index: number, count: number) {
  const size = SPAN / count;
  return arc(R, SPAN - index * size - GAP / 2, SPAN - (index + 1) * size + GAP / 2);
}

/** Needle rotation, in degrees clockwise from straight up. */
function needleAngle(index: number, count: number) {
  const size = SPAN / count;
  return 90 - (SPAN - index * size - size / 2);
}

/**
 * A large instrument dial. One band is lit at a time and the needle swings to
 * it; the legend beneath is the authoritative list of readings, and selecting
 * one moves the needle, so every colour on the page is reachable and named.
 */
function BigGauge({ caption, bands, initial }: { caption: string; bands: Band[]; initial: number }) {
  const [active, setActive] = useState(initial);
  const reduce = useReducedMotion();
  const current = bands[active];

  return (
    <figure className="space-y-6">
      <figcaption className="space-y-1.5">
        <p className="text-label">{caption}</p>
        <p className="text-title text-2xl sm:text-[1.75rem]">{current.label}</p>
      </figcaption>

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={`${caption} dial, reading ${current.label}. ${current.note}`}
      >
        {/* Ticks give the dial its instrument feel; every third one is longer. */}
        {Array.from({ length: 25 }, (_, i) => {
          const deg = SPAN - i * (SPAN / 24);
          const a = polar(R - 16, deg);
          const b = polar(R - (i % 3 === 0 ? 24 : 20), deg);
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className="stroke-border-strong"
              strokeWidth={i % 3 === 0 ? 1.1 : 0.7}
            />
          );
        })}

        {bands.map((band, i) => {
          const lit = i === active;
          return (
            <motion.path
              key={band.key}
              d={bandArc(i, bands.length)}
              fill="none"
              strokeWidth={lit ? 15 : 9}
              strokeLinecap="butt"
              className={lit ? band.stroke : "stroke-muted"}
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1, strokeWidth: lit ? 15 : 9 }}
              transition={
                reduce
                  ? { duration: 0 }
                  : { pathLength: { duration: 0.7, delay: 0.1 + i * 0.1, ease: [0.22, 1, 0.36, 1] }, strokeWidth: { duration: 0.25 } }
              }
            />
          );
        })}

        <motion.g
          style={{ transformBox: "view-box", originX: `${CX}px`, originY: `${CY}px` }}
          initial={reduce ? false : { rotate: needleAngle(initial, bands.length) }}
          animate={{ rotate: needleAngle(active, bands.length) }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 72, damping: 11 }}
        >
          <path d={`M ${CX - 4} ${CY} L ${CX} ${CY - R + 14} L ${CX + 4} ${CY} Z`} className="fill-foreground" />
        </motion.g>
        <rect x={CX - 8} y={CY - 8} width={16} height={16} rx={3} className="fill-foreground" />
        <rect x={CX - 3.5} y={CY - 3.5} width={7} height={7} rx={1} className="fill-background" />
      </svg>

      {/* The readings themselves. Selecting one swings the needle to it. */}
      <ul className="space-y-0">
        {bands.map((band, i) => {
          const lit = i === active;
          return (
            <li key={band.key} className="border-t border-border last:border-b">
              <button
                type="button"
                onClick={() => setActive(i)}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                aria-pressed={lit}
                className="flex w-full items-baseline gap-3 py-3 text-left"
              >
                <span aria-hidden="true" className={cn("mt-[6px] size-2.5 shrink-0 rounded-[2px]", band.dot)} />
                <span className={cn("w-[7.5rem] shrink-0 text-[0.9375rem]", lit ? "text-foreground" : "text-muted-foreground")}>
                  {band.label}
                </span>
                <span className="text-[0.8125rem] leading-relaxed text-muted-foreground">{band.note}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

/**
 * The pair of dials under the hero: the advisory release verdict, and the
 * severity scale every finding is filed under.
 */
export function HeroGauges({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-14 border-t border-border pt-12 sm:gap-16 lg:grid-cols-2 lg:gap-20", className)}>
      <BigGauge caption="Release verdict" bands={VERDICT_BANDS} initial={1} />
      <BigGauge caption="Finding severity" bands={SEVERITY_BANDS} initial={2} />
    </div>
  );
}
