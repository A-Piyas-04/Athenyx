"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { BrandMark } from "@/components/brand";

/**
 * The landing page header. A hairline and a background appear once the hero
 * starts to leave, so the header is invisible over the hero and legible over
 * everything after it.
 */
const LINKS = [
  { href: "#board", label: "The board" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#surfaces", label: "The product" },
  { href: "/board", label: "All nine" },
];

export function MarketingHeader({ signedIn }: { signedIn: boolean }) {
  const { scrollY } = useScroll();
  const border = useTransform(scrollY, [0, 120], [0, 1]);

  return (
    <header className="sticky top-0 z-50">
      <motion.div
        aria-hidden="true"
        style={{ opacity: border }}
        className="absolute inset-0 border-b border-border bg-background/95"
      />
      <div className="relative mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-5 sm:px-8">
        <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Athenyx home">
          <BrandMark />
          <span className="font-display text-[17px] font-bold tracking-tight">Athenyx</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Page sections">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className="link-underline text-sm text-muted-foreground hover:text-foreground">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href={signedIn ? "/projects" : "/login"}
            className="link-underline hidden text-sm font-medium sm:inline"
          >
            {signedIn ? "Dashboard" : "Sign in"}
          </Link>
        </div>
      </div>
    </header>
  );
}
