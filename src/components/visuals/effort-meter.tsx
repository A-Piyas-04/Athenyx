import type { FixOption } from "@/lib/review/types";
import { cn } from "@/lib/utils";

const LEVEL: Record<NonNullable<FixOption["effort"]>, number> = { SMALL: 1, MEDIUM: 2, LARGE: 3 };
const LABEL: Record<NonNullable<FixOption["effort"]>, string> = { SMALL: "Low effort", MEDIUM: "Medium effort", LARGE: "High effort" };

/** Three rising bars; filled up to the option's effort. */
export function EffortMeter({ effort, className }: { effort: FixOption["effort"]; className?: string }) {
  if (!effort) return null;
  const level = LEVEL[effort];
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs text-muted-foreground", className)}>
      <span className="inline-flex items-end gap-[2px]" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn("w-[4px] rounded-[1px]", i <= level ? "bg-foreground" : "bg-border-strong")} style={{ height: 4 + i * 3 }} />
        ))}
      </span>
      {LABEL[effort]}
    </span>
  );
}
