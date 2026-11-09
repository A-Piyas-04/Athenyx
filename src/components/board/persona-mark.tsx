import {
  BrainCircuit,
  Braces,
  Building2,
  Database,
  FlaskConical,
  Gauge,
  MousePointerClick,
  Scale,
  ServerCog,
  ShieldHalf,
  Sigma,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  architecture: Building2,
  security: ShieldHalf,
  data_integrity: Database,
  reliability: Gauge,
  quality: FlaskConical,
  product_ux: MousePointerClick,
  devops: ServerCog,
  algorithms: Sigma,
  code_quality: Braces,
  ai_ml: BrainCircuit,
  evidence_arbiter: Scale,
};

const SIZES = {
  "2xs": "size-4 [&_svg]:size-2.5",
  xs: "size-5 [&_svg]:size-3",
  sm: "size-7 [&_svg]:size-3.5",
  md: "size-9 [&_svg]:size-4",
  lg: "size-12 [&_svg]:size-5",
} as const;

/**
 * A specialist's identity mark: their icon in a small square. `active` seats
 * are filled; `idle` are outlined; `dim` sit quietly for absent members.
 */
export function PersonaMark({
  persona,
  size = "sm",
  tone = "active",
  className,
}: {
  persona: string;
  size?: keyof typeof SIZES;
  tone?: "active" | "idle" | "dim" | "gold";
  className?: string;
}) {
  const Icon = ICONS[persona] ?? UserRound;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-[4px] border transition-colors duration-300",
        SIZES[size],
        tone === "active" && "border-foreground bg-foreground text-background",
        tone === "gold" && "border-umber-800 bg-gold-500 text-umber-900",
        tone === "idle" && "border-border-strong bg-card text-foreground",
        tone === "dim" && "border-border bg-transparent text-subtle",
        className,
      )}
    >
      <Icon strokeWidth={2} />
    </span>
  );
}
