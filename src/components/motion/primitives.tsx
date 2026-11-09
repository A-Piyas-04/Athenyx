"use client";

import { useLayoutEffect, useRef } from "react";
import { animate, motion, MotionConfig, type Variants } from "motion/react";
import { cn } from "@/lib/utils";

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Respects the OS "reduce motion" setting for every motion component. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Route-level entrance: content settles into place after navigation. */
export function PageTransition({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

const TAGS = {
  div: motion.div,
  section: motion.section,
  ul: motion.ul,
  ol: motion.ol,
  li: motion.li,
  header: motion.header,
  aside: motion.aside,
} as const;

type Tag = keyof typeof TAGS;

/** Fades and lifts its content in the first time it scrolls into view. */
export function Reveal({
  children,
  as = "div",
  delay = 0,
  y = 16,
  className,
}: {
  children: React.ReactNode;
  as?: Tag;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const Component = TAGS[as];
  return (
    <Component
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.6, delay, ease: EASE_OUT }}
    >
      {children}
    </Component>
  );
}

const container: Variants = {
  hidden: {},
  show: (gap: number) => ({ transition: { staggerChildren: gap, delayChildren: 0.04 } }),
};

const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
};

/** A list whose items cascade in, one after another, when it enters view. */
export function Stagger({
  children,
  as = "ul",
  gap = 0.045,
  className,
}: {
  children: React.ReactNode;
  as?: Tag;
  gap?: number;
  className?: string;
}) {
  const Component = TAGS[as];
  return (
    <Component
      className={className}
      variants={container}
      custom={gap}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.05 }}
    >
      {children}
    </Component>
  );
}

export function StaggerItem({
  children,
  as = "li",
  className,
}: {
  children: React.ReactNode;
  as?: Tag;
  className?: string;
}) {
  const Component = TAGS[as];
  return (
    <Component className={className} variants={item}>
      {children}
    </Component>
  );
}

/** Counts up to `value` once on mount. Server markup shows the final value. */
export function CountUp({ value, duration = 1, className }: { value: number; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || value === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    node.textContent = "0";
    const controls = animate(0, value, {
      duration,
      ease: EASE_OUT,
      onUpdate: (latest) => {
        node.textContent = Math.round(latest).toLocaleString("en-US");
      },
    });
    return () => controls.stop();
  }, [value, duration]);
  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {value.toLocaleString("en-US")}
    </span>
  );
}

/** A bar segment that grows to its width on mount. */
export function GrowBar({ width, className, delay = 0 }: { width: string; className?: string; delay?: number }) {
  return (
    <motion.span
      className={cn("block h-full", className)}
      initial={{ width: 0 }}
      animate={{ width }}
      transition={{ duration: 0.9, delay, ease: EASE_OUT }}
    />
  );
}
