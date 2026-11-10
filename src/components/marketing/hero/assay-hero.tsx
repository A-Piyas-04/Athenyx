"use client";

import { useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { AssayCanvas } from "@/components/marketing/hero/assay-canvas";
import { AssayPoster } from "@/components/marketing/hero/assay-poster";
import { HeroGauges } from "@/components/marketing/hero/hero-gauges";

/**
 * The hero. The headline column is handed in from the server page so its text
 * is server-rendered; this component exists for the scroll progress, which it
 * both feeds to the 3D scene and uses to let the text recede as you leave.
 *
 * The poster sits permanently beneath the canvas, so there is no empty frame
 * and no layout shift when the scene arrives or fails to.
 */
export function AssayHero({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const textScale = useTransform(scrollYProgress, [0, 1], [1, 0.94]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.85], [1, 0]);

  return (
    <div
      ref={ref}
      className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pt-10 pb-24 sm:px-8 lg:min-h-[86svh] lg:grid-cols-[1.05fr_1fr] lg:gap-x-16 lg:gap-y-20 lg:pt-16"
    >
      <motion.div style={{ scale: textScale, opacity: textOpacity, originX: 0 }} className="space-y-9">
        {children}
      </motion.div>

      <div className="relative isolate mx-auto aspect-square w-full max-w-[34rem]">
        <AssayPoster className="absolute inset-0" />
        <AssayCanvas scroll={scrollYProgress} />
      </div>

      <HeroGauges className="lg:col-span-2" />
    </div>
  );
}
