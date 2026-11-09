"use client";

import { useEffect, useState } from "react";

/**
 * Decides whether this visitor gets the WebGL scene or the static poster.
 *
 * It runs in an effect rather than during render, so the server and the first
 * client pass always agree on the poster and hydration stays clean. It runs
 * *before* the scene module is imported, which is the point: a reduced-motion
 * or mobile visitor never downloads three.js at all.
 */

function capable(): boolean {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  // Touch devices and narrow viewports get the poster: the scene is a desktop
  // composition and not worth ~160KB on a phone.
  if (window.matchMedia("(pointer: coarse)").matches) return false;
  if (window.matchMedia("(max-width: 1023px)").matches) return false;

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  if ((navigator.hardwareConcurrency ?? 8) < 4) return false;
  if ((nav.deviceMemory ?? 8) < 4) return false;
  if (nav.connection?.saveData) return false;

  // Finally, does a context actually exist? Release it immediately.
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) return false;
  const lose = gl.getExtension("WEBGL_lose_context");
  lose?.loseContext();
  return true;
}

export function useWebglSupport(): boolean {
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const width = window.matchMedia("(max-width: 1023px)");
    const update = () => setSupported(capable());
    update();
    motion.addEventListener("change", update);
    width.addEventListener("change", update);
    return () => {
      motion.removeEventListener("change", update);
      width.removeEventListener("change", update);
    };
  }, []);

  return supported;
}
