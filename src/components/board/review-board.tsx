"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import type { Severity } from "@/generated/prisma/enums";
import { PersonaMark } from "@/components/board/persona-mark";
import { SeverityDot } from "@/components/findings/badges";
import { Markdown } from "@/components/markdown";
import { Disclosure } from "@/components/motion/disclosure";
import { ARBITER, deriveStance, ROSTER, seatFor, STANCE_LABEL, STANCE_TONE, type Stance } from "@/lib/review/board";
import type { BoardReport, SpecialistReport } from "@/lib/review/types";
import { cn } from "@/lib/utils";

export type BoardFinding = { id: string; title: string; severity: Severity; location: string | null };

const ROW = 72;
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The review board on a finished review: who sat on it and why, what each
 * specialist concluded (with the findings that back it), and how the
 * Evidence Arbiter filtered their claims down to what you see.
 */
export function ReviewBoard({
  projectId,
  specialists,
  board,
  findings,
  showAnswers,
}: {
  projectId: string;
  specialists: SpecialistReport[];
  board: BoardReport | null;
  /** Kept findings of this run, keyed by the specialist that raised them. */
  findings: Record<string, BoardFinding[]>;
  showAnswers: boolean;
}) {
  const stances = new Map<string, Stance>(specialists.map((s) => [s.persona, deriveStance(s.status, findings[s.persona] ?? [])]));
  const initial = specialists.find((s) => (findings[s.persona] ?? []).length > 0)?.persona ?? specialists[0]?.persona ?? ARBITER;
  const [selected, setSelected] = useState<string>(initial);

  const kept = board?.arbiter.kept ?? specialists.reduce((sum, s) => sum + s.findingCount, 0);
  const raised = board?.arbiter.raised ?? null;
  const serving = new Set(specialists.map((s) => s.persona));
  const absent = ROSTER.filter((seat) => seat.kind !== "support" && !serving.has(seat.key));
  const H = Math.max(specialists.length, 1) * ROW;

  return (
    <section className="space-y-10" aria-labelledby="board-heading">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="space-y-1.5">
          <h2 id="board-heading" className="text-title text-2xl">
            Review board
          </h2>
          <p className="text-sm text-muted-foreground">
            {specialists.length} specialist{specialists.length === 1 ? "" : "s"} and the Evidence Arbiter worked on this review. Select
            anyone to see what they concluded.
          </p>
        </div>
      </div>

      {board?.selectionReason ? (
        <p className="max-w-[72ch] text-[0.9375rem] leading-relaxed">
          <span className="font-semibold">Why these specialists: </span>
          <span className="text-muted-foreground">{board.selectionReason}</span>
          {board.defaultSelection ? <span className="text-muted-foreground"> (default selection; the planner was unavailable)</span> : null}
        </p>
      ) : null}

      {/* Flow: specialists → Evidence Arbiter → what you see. */}
      <div className="grid gap-y-6 md:grid-cols-[minmax(0,18rem)_minmax(2.5rem,1fr)_minmax(0,13rem)_minmax(1.5rem,4rem)_minmax(0,9rem)] md:items-center">
        <ul className="space-y-0" role="list">
          {specialists.map((s, i) => {
            const stance = stances.get(s.persona)!;
            const active = selected === s.persona;
            return (
              <motion.li
                key={s.persona}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: i * 0.08, ease: EASE }}
                style={{ height: ROW }}
                className="flex items-center"
              >
                <button
                  type="button"
                  onClick={() => setSelected(s.persona)}
                  aria-pressed={active}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors duration-200",
                    active ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <PersonaMark persona={s.persona} size="md" tone={active ? "gold" : s.status === "failed" ? "dim" : "active"} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{seatFor(s.persona).name}</span>
                    <span className={cn("block text-xs font-medium", STANCE_TONE[stance])}>
                      {STANCE_LABEL[stance]}
                      {s.raised !== undefined ? <span className="font-normal text-muted-foreground">, {s.raised} proposed</span> : null}
                    </span>
                  </span>
                </button>
              </motion.li>
            );
          })}
        </ul>

        <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="hidden h-full w-full md:block" style={{ height: H }} aria-hidden="true">
          {specialists.map((s, i) => {
            const y = i * ROW + ROW / 2;
            const yc = H / 2;
            const width = 1.25 + Math.min(s.raised ?? s.findingCount, 8) * 0.45;
            const active = selected === s.persona;
            if (s.status === "failed") {
              return <path key={s.persona} d={`M0 ${y} C 50 ${y}, 50 ${yc}, 100 ${yc}`} fill="none" strokeDasharray="2 5" className="stroke-border-strong" vectorEffect="non-scaling-stroke" />;
            }
            return (
              <g key={s.persona}>
                <path
                  d={`M0 ${y} C 50 ${y}, 50 ${yc}, 100 ${yc}`}
                  fill="none"
                  strokeWidth={width}
                  className={cn("transition-colors duration-300", active ? "stroke-foreground/70" : "stroke-border-strong")}
                  vectorEffect="non-scaling-stroke"
                />
                <motion.path
                  d={`M0 ${y} C 50 ${y}, 50 ${yc}, 100 ${yc}`}
                  fill="none"
                  strokeWidth={Math.max(1.5, width - 0.5)}
                  strokeDasharray="3 9"
                  className={active ? "stroke-primary" : "stroke-subtle/60"}
                  vectorEffect="non-scaling-stroke"
                  animate={{ strokeDashoffset: [0, -24] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                />
              </g>
            );
          })}
        </svg>

        <motion.button
          type="button"
          onClick={() => setSelected(ARBITER)}
          aria-pressed={selected === ARBITER}
          initial={{ opacity: 0, scale: 0.94 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3, ease: EASE }}
          className={cn(
            "flex flex-col items-start gap-3 rounded-lg border p-4 text-left transition-colors duration-200",
            selected === ARBITER ? "border-foreground bg-muted" : "border-border-strong hover:border-foreground/50",
          )}
        >
          <span className="flex items-center gap-2.5">
            <PersonaMark persona={ARBITER} size="md" tone={selected === ARBITER ? "gold" : "idle"} />
            <span className="text-sm font-semibold leading-tight">Evidence Arbiter</span>
          </span>
          <span className="text-xs leading-relaxed text-muted-foreground">
            {raised !== null ? (
              <>
                Checked <span className="font-semibold text-foreground">{raised}</span> proposed finding{raised === 1 ? "" : "s"} against the
                code.
              </>
            ) : (
              "Checked every citation against the code."
            )}
          </span>
          {board ? (
            <span className="space-y-0.5 text-xs text-muted-foreground">
              {board.arbiter.unsupported > 0 ? <span className="block">{board.arbiter.unsupported} removed, citation not found</span> : null}
              {board.arbiter.merged > 0 ? <span className="block">{board.arbiter.merged} merged as duplicates</span> : null}
              {board.arbiter.omitted > 0 ? <span className="block">{board.arbiter.omitted} cut as lower priority</span> : null}
            </span>
          ) : null}
        </motion.button>

        <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="hidden h-3 w-full md:block" aria-hidden="true">
          <line x1="0" y1="5" x2="100" y2="5" className="stroke-foreground/60" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <motion.line
            x1="0"
            y1="5"
            x2="100"
            y2="5"
            className="stroke-primary"
            strokeWidth={2}
            strokeDasharray="3 9"
            vectorEffect="non-scaling-stroke"
            animate={{ strokeDashoffset: [0, -24] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          />
        </svg>

        <div className="space-y-1">
          <div className="font-display text-5xl font-bold tracking-tight tabular-nums">{kept}</div>
          <div className="text-sm text-muted-foreground">finding{kept === 1 ? "" : "s"} you can act on, each citing real lines</div>
        </div>
      </div>

      {/* Detail for the selected seat. */}
      <div className="border-t border-border pt-10">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={selected}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            {selected === ARBITER ? (
              <ArbiterDetail board={board} specialists={specialists} kept={kept} />
            ) : (
              <SpecialistDetail
                projectId={projectId}
                report={specialists.find((s) => s.persona === selected)!}
                stance={stances.get(selected) ?? "clear"}
                findings={findings[selected] ?? []}
                agreements={(board?.agreements ?? []).filter((a) => a.personas.includes(selected))}
                showAnswer={showAnswers}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {absent.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Not consulted on this review</h3>
          <ul className="flex flex-wrap gap-x-5 gap-y-3">
            {absent.map((seat) => (
              <li key={seat.key} className="flex items-center gap-2 text-sm text-muted-foreground" title={seat.focus}>
                <PersonaMark persona={seat.key} size="xs" tone="dim" />
                {seat.name}
                {seat.kind === "conditional" ? <span className="text-xs text-subtle">(AI/ML projects only)</span> : null}
              </li>
            ))}
          </ul>
          <p className="max-w-[72ch] text-xs text-muted-foreground">
            The planner seats the specialists that fit the request and your stack, two or three at a time. These seats were
            never asked, so their silence is not a sign-off &mdash; nothing here has been cleared by them.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function SpecialistDetail({
  projectId,
  report,
  stance,
  findings,
  agreements,
  showAnswer,
}: {
  projectId: string;
  report: SpecialistReport;
  stance: Stance;
  findings: BoardFinding[];
  agreements: { title: string; personas: string[] }[];
  showAnswer: boolean;
}) {
  const seat = seatFor(report.persona);
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-16">
      <div className="min-w-0 space-y-8">
        <div className="flex items-start gap-4">
          <PersonaMark persona={report.persona} size="lg" tone="gold" />
          <div className="space-y-1">
            <h3 className="text-title text-xl">{seat.name}</h3>
            <p className="max-w-[60ch] text-sm text-muted-foreground">{seat.focus}</p>
          </div>
        </div>

        {report.summary ? (
          <figure className="relative max-w-[68ch] pl-8">
            <span aria-hidden="true" className="absolute top-[-0.35rem] left-0 font-display text-4xl leading-none text-gold-600">
              &ldquo;
            </span>
            <blockquote className="text-lg leading-relaxed">{report.summary}</blockquote>
            <figcaption className="mt-2 text-xs text-muted-foreground">{seat.name}, in its own words</figcaption>
          </figure>
        ) : report.status === "failed" ? (
          <p className="text-sm text-muted-foreground">This specialist could not finish, so it left no statement. Its seat did not affect the result.</p>
        ) : null}

        {showAnswer && report.answer ? (
          <Disclosure chevron="start" summary={<span className="text-sm font-semibold">Its answer to your question</span>} contentClassName="pt-3">
            <Markdown>{report.answer}</Markdown>
          </Disclosure>
        ) : null}

        <div className="space-y-3">
          <h4 className="text-sm font-semibold">
            Findings it raised that passed evidence checks <span className="font-normal text-muted-foreground">({findings.length})</span>
          </h4>
          {findings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {report.status === "failed" ? "None." : "None. It found nothing that met the evidence bar in the code it read."}
            </p>
          ) : (
            <ul className="border-t border-border">
              {findings.map((f) => (
                <li key={f.id} className="border-b border-border">
                  <Link
                    href={`/p/${projectId}/risks/${f.id}`}
                    className="group -mx-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 rounded-md px-3 py-3 row-hover"
                  >
                    <SeverityDot severity={f.severity} className="mt-1.5" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{f.title}</span>
                      {f.location ? <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">{f.location}</span> : null}
                    </span>
                    <ArrowRight className="mt-1 size-3.5 -translate-x-1 text-muted-foreground opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {agreements.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Independent agreement</h4>
            <ul className="space-y-2 text-sm">
              {agreements.map((a) => (
                <li key={a.title} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="flex -space-x-1">
                    {a.personas.map((p) => (
                      <PersonaMark key={p} persona={p} size="xs" tone="active" className="ring-2 ring-background" />
                    ))}
                  </span>
                  <span className="text-muted-foreground">
                    {a.personas
                      .filter((p) => p !== report.persona)
                      .map((p) => seatFor(p).name)
                      .join(", ")}{" "}
                    also raised
                  </span>
                  <span className="font-medium">&ldquo;{a.title}&rdquo;</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <dl className="space-y-5 text-sm lg:border-l lg:border-border lg:pl-8">
        <Fact label="Stance">
          <span className={cn("font-semibold", STANCE_TONE[stance])}>{STANCE_LABEL[stance]}</span>
          <span className="mt-1 block text-xs text-muted-foreground">Based on its findings that passed evidence checks.</span>
        </Fact>
        {report.raised !== undefined ? (
          <Fact label="Its work">
            <span className="block">{report.raised} proposed</span>
            <span className="block">{report.findingCount} passed evidence checks</span>
            {report.unsupported ? <span className="block text-muted-foreground">{report.unsupported} removed, citation not found</span> : null}
            {report.citationsDropped ? <span className="block text-muted-foreground">{report.citationsDropped} weak citations dropped</span> : null}
          </Fact>
        ) : (
          <Fact label="Its work">{report.findingCount} findings passed evidence checks</Fact>
        )}
        {report.model ? (
          <Fact label="Model">
            <span className="font-mono text-xs">{report.model}</span>
            {report.degraded ? <span className="mt-0.5 block text-xs text-warn">Fallback model (higher tiers were rate-limited)</span> : null}
          </Fact>
        ) : null}
      </dl>
    </div>
  );
}

function ArbiterDetail({ board, specialists, kept }: { board: BoardReport | null; specialists: SpecialistReport[]; kept: number }) {
  const seat = seatFor(ARBITER);
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-16">
      <div className="min-w-0 space-y-8">
        <div className="flex items-start gap-4">
          <PersonaMark persona={ARBITER} size="lg" tone="gold" />
          <div className="space-y-1">
            <h3 className="text-title text-xl">{seat.name}</h3>
            <p className="max-w-[60ch] text-sm text-muted-foreground">{seat.focus}</p>
          </div>
        </div>
        <p className="max-w-[68ch] text-[0.9375rem] leading-relaxed">
          The arbiter is not a model. It is a deterministic check that runs on every review: each quote a specialist cites must exist at
          those lines in the commit you reviewed. Anything that fails is removed before you see it, so no finding here rests on an invented
          line.
        </p>
        {board && board.agreements.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Where specialists independently agreed</h4>
            <ul className="space-y-2 text-sm">
              {board.agreements.map((a) => (
                <li key={a.title} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="flex -space-x-1">
                    {a.personas.map((p) => (
                      <PersonaMark key={p} persona={p} size="xs" tone="active" className="ring-2 ring-background" />
                    ))}
                  </span>
                  <span className="font-medium">&ldquo;{a.title}&rdquo;</span>
                  <span className="text-muted-foreground">merged into one finding</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {!board ? <p className="text-xs text-muted-foreground">A detailed tally is recorded for reviews run after the board update.</p> : null}
      </div>
      <dl className="space-y-5 text-sm lg:border-l lg:border-border lg:pl-8">
        {board ? (
          <>
            <Fact label="Proposed by specialists">{board.arbiter.raised}</Fact>
            <Fact label="Removed, citation not found">{board.arbiter.unsupported}</Fact>
            <Fact label="Weak citations dropped">{board.arbiter.citationsDropped}</Fact>
            <Fact label="Duplicates merged">{board.arbiter.merged}</Fact>
            {board.arbiter.omitted > 0 ? <Fact label="Cut as lower priority">{board.arbiter.omitted}</Fact> : null}
          </>
        ) : null}
        <Fact label="Kept">
          {kept} from {specialists.length} specialist{specialists.length === 1 ? "" : "s"}
        </Fact>
      </dl>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
