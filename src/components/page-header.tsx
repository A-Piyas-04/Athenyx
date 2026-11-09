import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/** Page heading: one strong title, at most one quiet line under it, actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  back,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      {back ? <BackLink href={back.href} label={back.label} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-title text-[1.75rem] sm:text-[2.125rem]">{title}</h1>
          {description ? <p className="max-w-[60ch] text-[0.9375rem] text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-3.5 transition-transform duration-300 group-hover:-translate-x-0.5" />
      {label}
    </Link>
  );
}

/** A titled block separated by whitespace, not by a box. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="min-w-0 space-y-0.5">
            {title ? <h2 className="text-section">{title}</h2> : null}
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Inline text link with an animated underline. */
export function TextLink({
  href,
  children,
  className,
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  external?: boolean;
}) {
  const classes = cn("link-underline text-sm font-medium text-link", className);
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={classes}>
      {children}
    </a>
  ) : (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}

/** Centered empty state: a sentence and one action. */
export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-4 border-t border-border py-12", className)}>
      <div className="space-y-1.5">
        <h2 className="text-title text-xl">{title}</h2>
        {children ? <p className="max-w-[52ch] text-sm text-muted-foreground">{children}</p> : null}
      </div>
      {action}
    </div>
  );
}
