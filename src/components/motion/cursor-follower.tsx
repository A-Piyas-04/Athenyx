"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";

const INTERACTIVE =
  'a, button, [role="button"], [role="radio"], [role="tab"], [role="menuitem"], [role="option"], summary, label, select, [data-cursor-hover]';
const TEXT = 'input:not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]';

type Mode = "hidden" | "idle" | "hover" | "text";

const SIZE: Record<Mode, { width: number; height: number }> = {
  hidden: { width: 28, height: 28 },
  idle: { width: 28, height: 28 },
  hover: { width: 46, height: 46 },
  text: { width: 3, height: 24 },
};

/**
 * A quiet ring that trails the mouse pointer with spring lag and reacts to
 * what is underneath it: it widens over interactive elements and turns into
 * a caret over text fields. Purely decorative: the native cursor stays, and
 * it is never rendered for touch input or when reduced motion is requested.
 */
export function CursorFollower() {
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<Mode>("hidden");
  const [pressed, setPressed] = useState(false);

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const ringX = useSpring(x, { stiffness: 420, damping: 34, mass: 0.5 });
  const ringY = useSpring(y, { stiffness: 420, damping: 34, mass: 0.5 });

  useEffect(() => {
    const query = window.matchMedia("(pointer: fine) and (prefers-reduced-motion: no-preference)");
    const update = () => setEnabled(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      x.set(event.clientX);
      y.set(event.clientY);
      const target = event.target instanceof Element ? event.target : null;
      const next: Mode = target?.closest(TEXT) ? "text" : target?.closest(INTERACTIVE) ? "hover" : "idle";
      setMode((prev) => (prev === next ? prev : next));
    };
    const leave = () => setMode("hidden");
    const down = () => setPressed(true);
    const up = () => setPressed(false);

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      document.documentElement.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
    };
  }, [enabled, x, y]);

  if (!enabled) return null;

  return (
    <div data-cursor aria-hidden="true" className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      <motion.div
        className="absolute top-0 left-0"
        style={{ x: ringX, y: ringY, translateX: "-50%", translateY: "-50%" }}
      >
        <motion.div
          className="border-[1.5px] border-[color-mix(in_oklab,var(--cursor-ring)_45%,transparent)]"
          initial={false}
          animate={{
            ...SIZE[mode],
            opacity: mode === "hidden" ? 0 : 1,
            scale: pressed ? 0.8 : 1,
            borderRadius: mode === "text" ? 2 : 999,
            borderColor:
              mode === "hover"
                ? "var(--primary)"
                : "color-mix(in oklab, var(--cursor-ring) 45%, transparent)",
          }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
        />
      </motion.div>
      <motion.div
        className="absolute top-0 left-0 size-[5px] rounded-full bg-[var(--cursor-ring)]"
        style={{ x, y, translateX: "-50%", translateY: "-50%" }}
        animate={{ opacity: mode === "idle" ? 0.9 : 0, scale: mode === "idle" ? 1 : 0.2 }}
        transition={{ duration: 0.15 }}
      />
    </div>
  );
}
