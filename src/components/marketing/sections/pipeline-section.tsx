"use client";

import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import { PIPELINE } from "@/components/marketing/copy";
import { cn } from "@/lib/utils";

/**
 * What actually happens when you press Start Review, as a rail the scroll
 * fills. This is one of the few places a scroll-linked effect earns its cost:
 * the scroll position means something here — it is progress through the
 * pipeline — so the rail is the illustration rather than an ornament.
 */
export function PipelineSection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.8", "end 0.55"] });
  const fill = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const [reached, setReached] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const next = Math.round(p * PIPELINE.length);
    setReached((prev) => (prev === next ? prev : next));
  });

  return (
    <section id="how-it-works" className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
      <div className="max-w-[56ch] space-y-5">
        <p className="text-label">How a review runs</p>
        <h2 className="text-title text-3xl sm:text-4xl">Ten steps, and you start all of them.</h2>
        <p className="text-lg leading-relaxed text-muted-foreground">
          Every review is pinned to one commit and nothing happens until you ask. Here is the whole of it.
        </p>
      </div>

      <div ref={ref} className="relative mt-16 pl-10 sm:pl-14">
        {/* The rail: a hairline the scroll fills. */}
        <div className="absolute top-2 bottom-2 left-[9px] w-px bg-border sm:left-[17px]" aria-hidden="true" />
        <motion.div
          className="absolute top-2 left-[9px] w-px origin-top bg-gold-700 sm:left-[17px]"
          style={{ scaleY: fill, bottom: 8 }}
          aria-hidden="true"
        />

        <ol className="space-y-10">
          {PIPELINE.map((stage, i) => {
            const on = i < reached;
            return (
              <li key={stage.step} className="relative">
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-1.5 -left-10 size-[11px] rounded-[3px] border transition-colors duration-500 sm:-left-14",
                    on ? "border-gold-700 bg-gold-500" : "border-border-strong bg-background",
                  )}
                />
                <h3
                  className={cn(
                    "font-display text-lg font-semibold tracking-tight transition-colors duration-500",
                    on ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {stage.step}
                </h3>
                <p className="mt-1.5 max-w-[62ch] text-[0.9375rem] leading-relaxed text-muted-foreground">{stage.text}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
