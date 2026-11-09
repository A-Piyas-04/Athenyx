import Link from "next/link";
import { PersonaMark } from "@/components/board/persona-mark";
import { ROSTER } from "@/lib/review/board";
import { cn } from "@/lib/utils";

/**
 * The whole board at a glance: every specialist seat, with how many open
 * findings each one raised. Seats with nothing open stay quiet.
 */
export function BoardStrip({ projectId, counts }: { projectId: string; counts: Record<string, { total: number; serious: number }> }) {
  const seats = ROSTER.filter((s) => s.kind === "core" || (s.kind === "conditional" && (counts[s.key]?.total ?? 0) > 0));
  return (
    <ul className="grid grid-cols-3 gap-x-2 gap-y-1">
      {seats.map((seat) => {
        const c = counts[seat.key];
        const n = c?.total ?? 0;
        return (
          <li key={seat.key}>
            <Link
              href={`/p/${projectId}/risks?persona=${seat.key}`}
              title={`${seat.name}: ${seat.focus}`}
              className="group -mx-1 flex items-center gap-2.5 rounded-md px-1 py-1.5 transition-colors duration-200 hover:bg-muted"
            >
              <PersonaMark persona={seat.key} size="sm" tone={n > 0 ? (c!.serious > 0 ? "gold" : "active") : "dim"} />
              <span className="min-w-0">
                <span className={cn("block truncate text-xs", n > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>{seat.short}</span>
                <span className={cn("block text-xs tabular-nums", n > 0 ? "text-muted-foreground" : "text-subtle")}>{n > 0 ? `${n} open` : "clear"}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
