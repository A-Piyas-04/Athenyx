"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * A driver fault or shader throw inside the WebGL scene must never blank the
 * landing page. On any error we fall back to the poster, which is already
 * painted underneath.
 */
export class SceneBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("Hero scene failed; showing the poster instead.", error, info.componentStack);
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
