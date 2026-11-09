import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The Athenyx mark: a hallmark stamp. Three gold bars step down in tone
 * (the brand swatch) inside a square punch, the way an assay office marks
 * metal it has tested.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true" className={cn("size-7", className)}>
      <rect x="1" y="1" width="26" height="26" rx="4" fill="#412201" className="dark:stroke-[#614501]" strokeWidth="1" />
      <rect x="6" y="7" width="16" height="3.4" rx="0.8" fill="#E1C802" />
      <rect x="6" y="12.3" width="11.5" height="3.4" rx="0.8" fill="#A28900" />
      <rect x="6" y="17.6" width="7" height="3.4" rx="0.8" fill="#806800" />
    </svg>
  );
}

export function Brand({ href = "/projects", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5" aria-label="Athenyx home">
      <BrandMark className="transition-transform duration-500 ease-[var(--ease-out-quint)] group-hover:-rotate-6" />
      {compact ? null : <span className="font-display text-[17px] font-bold tracking-tight">Athenyx</span>}
    </Link>
  );
}
