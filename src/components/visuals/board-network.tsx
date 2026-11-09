"use client";

import { motion } from "motion/react";
import type { PersonaRunStatus } from "@/lib/review/types";
import { cn } from "@/lib/utils";

export type BoardNode = {
  key: string;
  label: string;
  status: PersonaRunStatus;
  /** Findings this specialist contributed (completed runs). */
  count?: number;
};

const EDGE_TONE: Record<PersonaRunStatus, string> = {
  pending: "stroke-border-strong",
  running: "stroke-primary",
  waiting_rate_limit: "stroke-warn",
  done: "stroke-foreground/50",
  failed: "stroke-bad",
};

const NODE_TONE: Record<PersonaRunStatus, string> = {
  pending: "fill-card stroke-border-strong",
  running: "fill-primary stroke-primary",
  waiting_rate_limit: "fill-card stroke-warn",
  done: "fill-foreground stroke-foreground",
  failed: "fill-card stroke-bad",
};

/** Splits a persona label onto two lines at the space nearest the middle. */
function twoLines(label: string): [string, string?] {
  const words = label.split(" ");
  if (words.length < 2) return [label];
  let best = 1;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ").length;
    const b = words.slice(i).join(" ").length;
    const bestA = words.slice(0, best).join(" ").length;
    const bestB = words.slice(best).join(" ").length;
    if (Math.abs(a - b) < Math.abs(bestA - bestB)) best = i;
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

/**
 * The review board as a small network: the pinned commit at the centre, each
 * specialist around it. Edges carry live state: a moving dash while a
 * specialist reads, amber while it waits on a rate limit, solid when done.
 * Faint links between neighbours close the web.
 */
export function BoardNetwork({
  commit,
  nodes,
  className,
}: {
  commit: string | null;
  nodes: BoardNode[];
  className?: string;
}) {
  const W = 420;
  const H = 300;
  const cx = W / 2;
  const cy = H / 2 - 6;
  const rx = 150;
  const ry = 100;
  const n = Math.max(nodes.length, 1);
  const points = nodes.map((node, i) => {
    const angle = -Math.PI / 2 + (i / n) * Math.PI * 2 + (n === 2 ? Math.PI / 2 : 0);
    return { ...node, x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn("h-auto w-full max-w-[30rem] overflow-visible", className)} role="img" aria-label="Review board">
      {/* Web: neighbour links. */}
      {points.length > 2
        ? points.map((p, i) => {
            const q = points[(i + 1) % points.length];
            return (
              <motion.line
                key={`web-${p.key}`}
                x1={p.x}
                y1={p.y}
                x2={q.x}
                y2={q.y}
                className="stroke-border"
                strokeWidth={1}
                strokeDasharray="2 4"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.5 + i * 0.05 }}
              />
            );
          })
        : null}

      {/* Spokes: commit → specialist. */}
      {points.map((p, i) => {
        const live = p.status === "running" || p.status === "waiting_rate_limit";
        return (
          <g key={`edge-${p.key}`}>
            <motion.line
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              strokeWidth={p.status === "done" ? 1.5 : 1.25}
              className={cn(EDGE_TONE[p.status], "transition-colors duration-500")}
              strokeDasharray={p.status === "pending" ? "3 5" : undefined}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.6, delay: 0.15 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            />
            {live ? (
              <motion.circle
                r={3}
                className={p.status === "running" ? "fill-primary" : "fill-warn"}
                initial={{ cx, cy, opacity: 0 }}
                animate={{ cx: [cx, p.x], cy: [cy, p.y], opacity: [0, 1, 1, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: i * 0.3 }}
              />
            ) : null}
          </g>
        );
      })}

      {/* Commit node. */}
      <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} style={{ originX: `${cx}px`, originY: `${cy}px` }}>
        <rect x={cx - 38} y={cy - 15} width={76} height={30} rx={4} className="fill-gold-500 stroke-umber-800" strokeWidth={1} />
        <text x={cx} y={cy + 4.5} textAnchor="middle" fontSize={12} fontFamily="var(--font-code)" className="fill-umber-900 font-semibold">
          {commit ? commit.slice(0, 7) : "commit"}
        </text>
      </motion.g>

      {/* Specialist nodes. */}
      {points.map((p, i) => {
        const [l1, l2] = twoLines(p.label);
        const below = p.y >= cy - 4;
        const ty = below ? p.y + 22 : p.y - (l2 ? 30 : 18);
        return (
          <motion.g
            key={`node-${p.key}`}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 22, delay: 0.35 + i * 0.08 }}
            style={{ originX: `${p.x}px`, originY: `${p.y}px` }}
          >
            {p.status === "running" ? (
              <motion.rect
                rx={4}
                fill="none"
                className="stroke-primary"
                strokeWidth={1}
                initial={{ x: p.x - 10, y: p.y - 10, width: 20, height: 20, opacity: 0.9 }}
                animate={{ x: [p.x - 10, p.x - 17], y: [p.y - 10, p.y - 17], width: [20, 34], height: [20, 34], opacity: [0.9, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
              />
            ) : null}
            <rect x={p.x - 8} y={p.y - 8} width={16} height={16} rx={3} strokeWidth={1.5} className={cn(NODE_TONE[p.status], "transition-colors duration-500")} />
            {p.count !== undefined && p.count > 0 ? (
              <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize={9.5} className="fill-background font-semibold">
                {p.count}
              </text>
            ) : null}
            <text x={p.x} y={ty} textAnchor="middle" fontSize={11.5} fontFamily="var(--font-body)" className="fill-foreground font-medium">
              <tspan x={p.x}>{l1}</tspan>
              {l2 ? (
                <tspan x={p.x} dy={13}>
                  {l2}
                </tspan>
              ) : null}
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
}
