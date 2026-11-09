"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

export type ProviderNotice = { name: string; label: string; termsUrl: string | null; local: boolean };

/** localStorage flag for the first-time "I understand" checkbox (the server does not depend on it). */
export const ACK_KEY = "athenyx:data-notice-ack";

/**
 * The pre-review data notice (06, 05 §10): names every provider that could
 * receive code; the full privacy note (terms links, free-tier warning) opens
 * on demand so the form stays calm.
 */
export function DataNotice({ providers, allLocal }: { providers: ProviderNotice[]; allLocal: boolean }) {
  const [open, setOpen] = useState(false);
  if (allLocal) {
    return <p className="text-sm text-muted-foreground">Code is analyzed locally and not sent to external AI services. Nothing is changed in your repository.</p>;
  }
  const names = providers.map((p) => p.label).join(", ");
  return (
    <div className="text-sm text-muted-foreground">
      <p>
        Relevant code snippets from this commit go to <span className="font-medium text-foreground">{names}</span> for analysis. Your
        repository is never changed.{" "}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="link-underline font-medium text-link"
        >
          {open ? "Hide privacy note" : "Privacy note"}
        </button>
      </p>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2 text-xs leading-relaxed">
              <p className="max-w-[64ch]">
                Free AI tiers may allow the provider to use submitted content to improve their products. Secret files are never read
                and detected secrets are redacted before anything is sent. For private or sensitive code, configure a local Ollama
                model instead.
              </p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {providers.map((p) => (
                  <li key={p.name}>
                    {p.termsUrl ? (
                      <a href={p.termsUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">
                        {p.label} terms
                      </a>
                    ) : (
                      <span>
                        {p.label}
                        {p.local ? " (runs locally)" : ": check this provider's terms"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
