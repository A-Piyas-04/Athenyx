import { PersonaMark } from "@/components/board/persona-mark";
import type { Severity } from "@/generated/prisma/enums";
import { deriveStance, seatFor, STANCE_LABEL, STANCE_TONE } from "@/lib/review/board";
import type { SpecialistReport } from "@/lib/review/types";
import { cn } from "@/lib/utils";

/** Each seated specialist with its stance and statement, side by side. */
export function BoardStances({
  specialists,
  findings,
}: {
  specialists: SpecialistReport[];
  findings: { persona: string; severity: Severity }[];
}) {
  return (
    <ul className="grid gap-x-10 gap-y-8 md:grid-cols-2 xl:grid-cols-3">
      {specialists.map((s) => {
        const stance = deriveStance(s.status, findings.filter((f) => f.persona === s.persona));
        return (
          <li key={s.persona} className="space-y-3">
            <div className="flex items-center gap-3">
              <PersonaMark persona={s.persona} size="md" tone={stance === "serious" ? "gold" : s.status === "failed" ? "dim" : "active"} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{seatFor(s.persona).name}</div>
                <div className={cn("text-xs font-semibold", STANCE_TONE[stance])}>{STANCE_LABEL[stance]}</div>
              </div>
            </div>
            {s.summary ? <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground">&ldquo;{s.summary}&rdquo;</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
