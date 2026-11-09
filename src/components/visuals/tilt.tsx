"use client";

import { useRef } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";

/**
 * Gives its children real depth: the stage tilts toward the pointer under a
 * perspective, and children positioned with `translateZ` separate into
 * layers. Disabled for reduced motion and touch.
 */
export function Tilt({ children, max = 9, className }: { children: React.ReactNode; max?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 120, damping: 16 });
  const sy = useSpring(py, { stiffness: 120, damping: 16 });
  // At rest the stage sits at a slight angle, so the layers read as depth.
  const rotateY = useTransform(sx, (v) => -8 + v * 2 * max);
  const rotateX = useTransform(sy, (v) => 5 - v * 1.6 * max);

  function move(event: React.PointerEvent<HTMLDivElement>) {
    if (reduce || event.pointerType !== "mouse" || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    px.set((event.clientX - rect.left) / rect.width - 0.5);
    py.set((event.clientY - rect.top) / rect.height - 0.5);
  }

  return (
    <div
      ref={ref}
      onPointerMove={move}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
      }}
      className={className}
      style={{ perspective: 1100 }}
    >
      <motion.div style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}>
        {children}
      </motion.div>
    </div>
  );
}
