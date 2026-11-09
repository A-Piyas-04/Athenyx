import Link from "next/link";
import { BrandMark } from "@/components/brand";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-4 px-5 py-10 sm:px-8">
        <span className="inline-flex items-center gap-2.5">
          <BrandMark className="size-5" />
          <span className="font-display text-sm font-bold tracking-tight">Athenyx</span>
        </span>
        <p className="text-sm text-muted-foreground">
          An independent AI engineering review board. It advises; it does not act.
        </p>
        <Link href="/login" className="link-underline text-sm font-medium">
          Sign in
        </Link>
      </div>
    </footer>
  );
}
