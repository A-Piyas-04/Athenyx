import { Skeleton } from "@/components/ui/skeleton";

/** Shown while a project tab's server data loads: the page's shape, quietly. */
export default function Loading() {
  return (
    <div className="space-y-12" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <Skeleton className="h-10 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="space-y-0 border-t border-border">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border py-5">
            <Skeleton className="size-2" />
            <Skeleton className="h-4 flex-1" style={{ maxWidth: `${60 - i * 6}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
