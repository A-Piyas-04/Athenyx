"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Error boundary for project pages: an inline message, never internals. */
export default function ProjectError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="max-w-xl space-y-5 py-10">
      <h1 className="text-title text-2xl">This page didn&apos;t load</h1>
      <p className="text-sm text-muted-foreground">Reading this project&apos;s data failed. Your repository and findings are unaffected.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
