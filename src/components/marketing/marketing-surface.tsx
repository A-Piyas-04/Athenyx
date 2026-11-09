"use client";

import { useEffect } from "react";

/**
 * Opts the landing page into the relaxed visual rules (globals.css: fog, depth
 * and glow) by marking <html>. It is set here rather than on the page element
 * because the cursor fog lives in the root layout and needs the tokens above
 * it. The cleanup matters: it is what stops the exception leaking into /p/**
 * when the user navigates into the app.
 */
export function MarketingSurface() {
  useEffect(() => {
    document.documentElement.dataset.surface = "marketing";
    return () => {
      delete document.documentElement.dataset.surface;
    };
  }, []);
  return null;
}
