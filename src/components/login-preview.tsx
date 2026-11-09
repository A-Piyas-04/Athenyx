"use client";

import { motion } from "motion/react";

const LINES = [
  { n: 21, code: "export async function DELETE(_req, { params }) {" },
  { n: 22, code: "  const user = await getSessionUser();" },
  { n: 23, code: "  if (!user) return unauthorized();" },
  { n: 24, code: "  const { id } = await params;" },
  { n: 25, code: "  await db.expense.delete({ where: { id } });", hit: true },
  { n: 26, code: "  return new Response(null, { status: 204 });" },
  { n: 27, code: "}" },
];

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Illustration for the sign-in page: a code excerpt is read line by line,
 * the cited line is marked, and the finding it supports settles in beneath.
 * Static sample content; no real data.
 */
export function LoginPreview() {
  return (
    <div aria-hidden="true" className="relative w-full max-w-[34rem] select-none" style={{ transformStyle: "preserve-3d" }}>
      {/* Back layer: a sheet suggesting the rest of the snapshot. */}
      <div
        className="absolute inset-x-6 -top-5 bottom-10 rounded-lg border border-border bg-muted"
        style={{ transform: "translateZ(-50px)" }}
      />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
        className="relative overflow-hidden rounded-lg border border-border bg-card shadow-lg shadow-black/5"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5 font-mono text-xs text-muted-foreground">
          <span>app/api/expenses/[id]/route.ts</span>
          <span>a1b2c3d</span>
        </div>
        <pre className="py-3 font-mono text-[0.8125rem] leading-7">
          {LINES.map((line, i) => (
            <motion.div
              key={line.n}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.5 + i * 0.07, ease: EASE }}
              className="relative flex"
            >
              {line.hit ? (
                <motion.span
                  className="absolute inset-0 origin-left bg-primary/25"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.7, delay: 1.35, ease: [0.76, 0, 0.24, 1] }}
                />
              ) : null}
              <span className="relative w-12 shrink-0 pr-4 text-right text-subtle">{line.n}</span>
              <span className="relative pr-4 whitespace-pre">{line.code}</span>
            </motion.div>
          ))}
        </pre>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 1.9, ease: EASE }}
        className="relative -mt-6 ml-8 rounded-lg border border-border-strong bg-popover p-5 shadow-2xl shadow-black/20 sm:ml-16"
        style={{ z: 70, transformStyle: "preserve-3d" }}
      >
        <div className="flex items-center gap-2 text-xs font-medium">
          <span className="size-2 rounded-[2px] bg-sev-high" />
          High
          <span className="text-muted-foreground">Verified defect</span>
        </div>
        <p className="mt-2 font-display text-lg font-semibold leading-snug tracking-tight">Delete checks login, not ownership</p>
        <p className="mt-1 text-sm text-muted-foreground">Any signed-in user can delete any expense by id. Cited at line 25.</p>
        <motion.div
          initial={{ scale: 1.6, opacity: 0, rotate: -18 }}
          animate={{ scale: 1, opacity: 1, rotate: -8 }}
          transition={{ type: "spring", stiffness: 260, damping: 16, delay: 2.5 }}
          style={{ z: 40 }}
          className="absolute -top-5 -right-4 grid size-16 place-items-center rounded-md border-2 border-umber-800 bg-gold-500 text-center font-display text-[10px] leading-tight font-bold text-umber-900 uppercase"
        >
          Line
          <br />
          checked
        </motion.div>
      </motion.div>
    </div>
  );
}
