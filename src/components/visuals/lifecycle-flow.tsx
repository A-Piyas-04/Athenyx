import type { FindingStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

type Node = { status: FindingStatus; label: string; x: number; y: number };

const NODES: Node[] = [
  { status: "OPEN", label: "Open", x: 26, y: 34 },
  { status: "IN_PROGRESS", label: "In progress", x: 128, y: 34 },
  { status: "RESOLVED", label: "Resolved", x: 230, y: 34 },
  { status: "ACCEPTED_RISK", label: "Accepted", x: 77, y: 100 },
  { status: "DISMISSED", label: "Dismissed", x: 179, y: 100 },
];

const EDGES: [FindingStatus, FindingStatus][] = [
  ["OPEN", "IN_PROGRESS"],
  ["IN_PROGRESS", "RESOLVED"],
  ["OPEN", "ACCEPTED_RISK"],
  ["IN_PROGRESS", "ACCEPTED_RISK"],
  ["IN_PROGRESS", "DISMISSED"],
  ["OPEN", "DISMISSED"],
];

/** Where a finding sits in its lifecycle; paths out of the current state are drawn solid. */
export function LifecycleFlow({ status, className }: { status: FindingStatus; className?: string }) {
  const at = (s: FindingStatus) => NODES.find((n) => n.status === s)!;
  return (
    <svg viewBox="0 0 256 132" className={cn("h-auto w-full", className)} role="img" aria-label={`Lifecycle: currently ${status.toLowerCase().replace("_", " ")}`}>
      <defs>
        <marker id="lf-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 L6 3 L0 6 Z" className="fill-border-strong" />
        </marker>
        <marker id="lf-arrow-on" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 L6 3 L0 6 Z" className="fill-foreground" />
        </marker>
      </defs>
      {EDGES.map(([from, to]) => {
        const a = at(from);
        const b = at(to);
        const out = from === status;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        const pad = 9;
        return (
          <line
            key={`${from}-${to}`}
            x1={a.x + (dx / len) * pad}
            y1={a.y + (dy / len) * pad}
            x2={b.x - (dx / len) * (pad + 2)}
            y2={b.y - (dy / len) * (pad + 2)}
            strokeWidth={out ? 1.4 : 1}
            strokeDasharray={out ? undefined : "2 3"}
            className={out ? "stroke-foreground" : "stroke-border-strong"}
            markerEnd={`url(#${out ? "lf-arrow-on" : "lf-arrow"})`}
          />
        );
      })}
      {NODES.map((n) => {
        const current = n.status === status;
        return (
          <g key={n.status}>
            {current ? <rect x={n.x - 10} y={n.y - 10} width={20} height={20} rx={4} className="fill-primary/25" /> : null}
            <rect
              x={n.x - 6}
              y={n.y - 6}
              width={12}
              height={12}
              rx={2.5}
              strokeWidth={1.5}
              className={current ? "fill-primary stroke-umber-800" : "fill-background stroke-border-strong"}
            />
            <text
              x={n.x}
              y={n.y < 60 ? n.y - 14 : n.y + 23}
              textAnchor="middle"
              fontSize={10}
              fontFamily="var(--font-body)"
              className={current ? "fill-foreground font-semibold" : "fill-muted-foreground"}
            >
              {n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
