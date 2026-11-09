import Link from "next/link";
import { REVIEW_TYPES } from "@/lib/review/types";
import type { ReviewType } from "@/generated/prisma/enums";

/** Shown instead of letting the user fill a form that would be rejected with 409. */
export function ActiveRunNotice({ projectId, run }: { projectId: string; run: { id: string; type: ReviewType } }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-accent px-4 py-3 text-sm text-accent-foreground">
      <span className="live-dot" />
      <span>
        <span className="font-semibold">{REVIEW_TYPES[run.type].label}</span> is running. One review runs at a time.
      </span>
      <Link href={`/p/${projectId}/review-lab/${run.id}`} className="link-underline ml-auto font-semibold">
        View progress
      </Link>
    </div>
  );
}
