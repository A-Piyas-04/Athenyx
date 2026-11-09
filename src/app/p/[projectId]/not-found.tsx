import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Shown for missing items inside a project, and for projects that aren't yours. */
export default function NotFound() {
  return (
    <div className="max-w-xl space-y-5 py-10">
      <h1 className="text-title text-2xl">Not found</h1>
      <p className="text-sm text-muted-foreground">This item doesn&apos;t exist, or it belongs to someone else.</p>
      <Button asChild variant="outline">
        <Link href="/projects">Back to projects</Link>
      </Button>
    </div>
  );
}
