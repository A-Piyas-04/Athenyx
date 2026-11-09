"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { MotionValue } from "motion/react";
import { SceneBoundary } from "@/components/marketing/hero/scene-boundary";
import { useWebglSupport } from "@/components/marketing/hero/use-webgl-support";

/**
 * The lazy boundary for the 3D hero.
 *
 * This file must never import `three` or `@react-three/fiber` — not even a
 * type — or they land in the main client bundle for every visitor, including
 * the ones who only ever see the poster. Everything WebGL lives behind this
 * dynamic import. (`dynamic(..., { ssr: false })` is also only legal inside a
 * client component, which is the other reason this boundary exists.)
 */
const AssayScene = dynamic(() => import("./assay-scene").then((m) => m.AssayScene), {
  ssr: false,
  loading: () => null,
});

export function AssayCanvas({ scroll }: { scroll: MotionValue<number> }) {
  const supported = useWebglSupport();
  const [armed, setArmed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  // Wait for an idle moment before fetching ~160KB of three.js, so the
  // headline is always the largest contentful paint.
  useEffect(() => {
    if (!supported) return;
    const idle = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idle.requestIdleCallback) {
      const handle = idle.requestIdleCallback(() => setArmed(true), { timeout: 1200 });
      return () => idle.cancelIdleCallback?.(handle);
    }
    const timer = setTimeout(() => setArmed(true), 400);
    return () => clearTimeout(timer);
  }, [supported]);

  if (!supported || failed || !armed) return null;

  return (
    <div
      className="absolute inset-0 transition-opacity duration-700 ease-[var(--ease-out-quint)]"
      style={{ opacity: ready ? 1 : 0 }}
    >
      <SceneBoundary onError={() => setFailed(true)}>
        <AssayScene scroll={scroll} onReady={() => setReady(true)} />
      </SceneBoundary>
    </div>
  );
}
