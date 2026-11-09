"use client";

import { useState } from "react";
import { motion, useMotionValueEvent, useScroll, useSpring } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Sticky header with two scroll behaviours:
 * - scrolling down slides the top row (`hideOffset` px) out of view, leaving
 *   anything below it (e.g. the tab row) pinned; scrolling up brings it back;
 * - a 1px line along the bottom edge fills with reading progress.
 */
export function ScrollHeader({
  children,
  hideOffset = 0,
  bordered = false,
  className,
}: {
  children: React.ReactNode;
  hideOffset?: number;
  /** Always show the bottom hairline (e.g. when tabs sit on it). */
  bordered?: boolean;
  className?: string;
}) {
  const { scrollY, scrollYProgress } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const progress = useSpring(scrollYProgress, { stiffness: 220, damping: 32, restDelta: 0.001 });

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() ?? 0;
    setScrolled(latest > 4);
    if (!hideOffset) return;
    if (latest > previous && latest > 140) setHidden(true);
    else if (latest < previous - 2 || latest < 140) setHidden(false);
  });

  return (
    <motion.header
      className={cn(
        "sticky top-0 z-40 border-b bg-background transition-colors duration-300",
        bordered || scrolled ? "border-border" : "border-transparent",
        className,
      )}
      animate={{ y: hidden ? -hideOffset : 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
      <motion.div
        aria-hidden="true"
        className={cn("absolute inset-x-0 -bottom-px h-px origin-left bg-primary transition-opacity duration-300", scrolled ? "opacity-100" : "opacity-0")}
        style={{ scaleX: progress }}
      />
    </motion.header>
  );
}
