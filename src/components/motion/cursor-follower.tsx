"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform, useVelocity } from "motion/react";

/**
 * A drift of warm fog that follows the pointer.
 *
 * Three layers share one pointer position but chase it at different spring
 * rates, so the fog shears when the mouse is flicked and settles when it
 * rests — that lag difference is the whole effect. The haze also stretches
 * along its direction of travel and squashes across it, keeping its apparent
 * mass constant.
 *
 * Softness is painted, not filtered: every layer is a multi-stop radial
 * gradient (tokens in globals.css), because a `filter: blur()` layer this
 * large would re-rasterise on every frame the pointer moves. Only the 10px
 * core is blurred, which is a bounded and effectively free raster.
 *
 * Purely decorative. The native cursor stays, and it never renders for touch
 * input or when reduced motion is requested.
 */

/** Speed, in px/s, above which the haze reaches its full stretch. */
const MAX_SPEED = 3200;
/** Below this speed the travel angle is noise, so it is held at 0. */
const ANGLE_DEADZONE = 60;

export function CursorFollower() {
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pressed, setPressed] = useState(false);

  const x = useMotionValue(-300);
  const y = useMotionValue(-300);

  // Each layer trails by a different amount; this is what reads as fog
  // rather than as a cursor ornament.
  const hazeX = useSpring(x, { stiffness: 58, damping: 24, mass: 1.35 });
  const hazeY = useSpring(y, { stiffness: 58, damping: 24, mass: 1.35 });
  const midX = useSpring(x, { stiffness: 150, damping: 21, mass: 0.8 });
  const midY = useSpring(y, { stiffness: 150, damping: 21, mass: 0.8 });
  const coreX = useSpring(x, { stiffness: 520, damping: 34, mass: 0.35 });
  const coreY = useSpring(y, { stiffness: 520, damping: 34, mass: 0.35 });

  const vx = useVelocity(x);
  const vy = useVelocity(y);
  const speed = useTransform<number, number>([vx, vy], ([a, b]) => Math.hypot(a, b));
  const smoothSpeed = useSpring(speed, { stiffness: 110, damping: 26 });

  // Area-preserving smear: stretch along travel, squash across it.
  const stretch = useTransform(smoothSpeed, [0, MAX_SPEED], [1, 1.42], { clamp: true });
  const squash = useTransform(stretch, (s) => 1 / Math.sqrt(s));
  const midStretch = useTransform(stretch, (s) => 1 + (s - 1) * 0.4);
  const midSquash = useTransform(midStretch, (s) => 1 / Math.sqrt(s));

  const angle = useTransform<number, number>([vx, vy], ([a, b]) =>
    Math.hypot(a, b) < ANGLE_DEADZONE ? 0 : (Math.atan2(b, a) * 180) / Math.PI,
  );
  const smoothAngle = useSpring(angle, { stiffness: 90, damping: 24 });

  // The fog thickens while moving and nearly clears at rest.
  const hazeOpacity = useTransform(smoothSpeed, [0, 240, 1800], [0.55, 0.9, 1], { clamp: true });

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
      setVisible(true);
    };
    const hide = () => setVisible(false);
    const down = () => setPressed(true);
    const up = () => setPressed(false);

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    document.documentElement.addEventListener("pointerleave", hide);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      document.documentElement.removeEventListener("pointerleave", hide);
      window.removeEventListener("blur", hide);
    };
  }, [enabled, x, y]);

  if (!enabled) return null;

  return (
    <motion.div
      data-cursor
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[100] overflow-hidden"
      style={{ contain: "strict" }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <motion.div
        className="absolute top-0 left-0 rounded-full"
        style={{
          x: hazeX,
          y: hazeY,
          width: "var(--fog-haze-size)",
          height: "var(--fog-haze-size)",
          translateX: "-50%",
          translateY: "-50%",
          rotate: smoothAngle,
          scaleX: stretch,
          scaleY: squash,
          opacity: hazeOpacity,
          background: "var(--fog-haze)",
          mixBlendMode: "var(--fog-blend)" as React.CSSProperties["mixBlendMode"],
          willChange: "transform",
          backfaceVisibility: "hidden",
        }}
      />
      <motion.div
        className="absolute top-0 left-0 rounded-full"
        style={{
          x: midX,
          y: midY,
          width: "var(--fog-mid-size)",
          height: "var(--fog-mid-size)",
          translateX: "-50%",
          translateY: "-50%",
          rotate: smoothAngle,
          scaleX: midStretch,
          scaleY: midSquash,
          background: "var(--fog-mid)",
          mixBlendMode: "var(--fog-blend)" as React.CSSProperties["mixBlendMode"],
          willChange: "transform",
          backfaceVisibility: "hidden",
        }}
        animate={{ scale: pressed ? 0.82 : 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
      />
      <motion.div
        className="absolute top-0 left-0 size-[10px] rounded-full"
        style={{
          x: coreX,
          y: coreY,
          translateX: "-50%",
          translateY: "-50%",
          background: "var(--fog-core)",
          filter: "blur(5px)",
          willChange: "transform",
          backfaceVisibility: "hidden",
        }}
      />
    </motion.div>
  );
}
