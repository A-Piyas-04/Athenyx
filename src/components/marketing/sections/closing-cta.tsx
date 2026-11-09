"use client";

import { useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { BrandMark } from "@/components/brand";

/**
 * The last word. The mark swells behind the text as the section arrives —
 * the one purely decorative scroll-link on the page, and it earns its place
 * by closing the loop back to the hero.
 */
export function ClosingCta({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  const scale = useTransform(scrollYProgress, [0, 1], [0.8, 1.15]);
  const opacity = useTransform(scrollYProgress, [0, 0.6, 1], [0, 0.07, 0.11]);

  return (
    <section ref={ref} className="relative overflow-hidden border-t border-border">
      <motion.div
        aria-hidden="true"
        style={{ scale, opacity }}
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      >
        <BrandMark className="size-[26rem]" />
      </motion.div>
      <div className="relative mx-auto w-full max-w-6xl px-5 py-28 sm:px-8 sm:py-36">
        <div className="max-w-[46ch] space-y-8">{children}</div>
      </div>
    </section>
  );
}
