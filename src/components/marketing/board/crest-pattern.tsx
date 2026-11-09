/**
 * The engraved ground of a specialist's crest: a different geometric hallmark
 * for each seat, drawn in the umber ramp at low contrast so it reads as
 * tooling marks on the punch rather than as decoration competing with the
 * icon. Keyed by persona so a seat always gets the same mark.
 *
 * Pure SVG, no client JS. Rendered inside a 96x96 crest, clipped to the frame.
 */

function Hatch() {
  return (
    <g>
      {Array.from({ length: 11 }, (_, i) => (
        <line key={i} x1={-20 + i * 12} y1={100} x2={40 + i * 12} y2={-4} />
      ))}
    </g>
  );
}

function SquareRings() {
  return (
    <g>
      {[8, 20, 32, 44].map((inset) => (
        <rect key={inset} x={inset} y={inset} width={96 - inset * 2} height={96 - inset * 2} rx={3} fill="none" />
      ))}
    </g>
  );
}

function SteppedBars() {
  return (
    <g>
      {Array.from({ length: 6 }, (_, i) => (
        <line key={i} x1={10 + i * 5} y1={14 + i * 13} x2={86} y2={14 + i * 13} />
      ))}
    </g>
  );
}

function RadialTicks() {
  return (
    <g>
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={48 + Math.cos(a) * 30}
            y1={48 + Math.sin(a) * 30}
            x2={48 + Math.cos(a) * 44}
            y2={48 + Math.sin(a) * 44}
          />
        );
      })}
    </g>
  );
}

function DotLattice() {
  return (
    <g>
      {Array.from({ length: 7 }, (_, r) =>
        Array.from({ length: 7 }, (_, c) => (
          <circle key={`${r}-${c}`} cx={10 + c * 12.5} cy={10 + r * 12.5} r={1.4} strokeWidth={0} fill="currentColor" />
        )),
      )}
    </g>
  );
}

function Chevrons() {
  return (
    <g>
      {Array.from({ length: 6 }, (_, i) => (
        <polyline key={i} points={`6,${10 + i * 16} 48,${22 + i * 16} 90,${10 + i * 16}`} fill="none" />
      ))}
    </g>
  );
}

function Brackets() {
  return (
    <g>
      {[0, 1, 2, 3].map((i) => {
        const o = 10 + i * 10;
        return (
          <g key={i}>
            <polyline points={`${o + 14},${o} ${o},${o} ${o},${96 - o} ${o + 14},${96 - o}`} fill="none" />
            <polyline points={`${96 - o - 14},${o} ${96 - o},${o} ${96 - o},${96 - o} ${96 - o - 14},${96 - o}`} fill="none" />
          </g>
        );
      })}
    </g>
  );
}

function Arcs() {
  return (
    <g>
      {[14, 26, 38, 50].map((r) => (
        <path key={r} d={`M ${48 - r} 48 A ${r} ${r} 0 0 1 48 ${48 - r}`} fill="none" />
      ))}
      {[20, 32, 44].map((r) => (
        <path key={`b${r}`} d={`M ${48 + r} 48 A ${r} ${r} 0 0 1 48 ${48 + r}`} fill="none" />
      ))}
    </g>
  );
}

function Interlock() {
  return (
    <g>
      {[0, 1, 2, 3].map((i) => (
        <polyline key={i} points={`${8 + i * 22},8 ${8 + i * 22},${40 + i * 6} ${40 + i * 14},${40 + i * 6}`} fill="none" />
      ))}
      {[0, 1, 2].map((i) => (
        <polyline key={`r${i}`} points={`${88 - i * 22},88 ${88 - i * 22},${56 - i * 6} ${56 - i * 14},${56 - i * 6}`} fill="none" />
      ))}
    </g>
  );
}

function Circles() {
  return (
    <g>
      {[12, 22, 32, 42].map((r) => (
        <circle key={r} cx={48} cy={48} r={r} fill="none" />
      ))}
    </g>
  );
}

function Balance() {
  return (
    <g>
      <line x1={48} y1={10} x2={48} y2={86} />
      <line x1={14} y1={30} x2={82} y2={30} />
      {[22, 74].map((x) => (
        <path key={x} d={`M ${x - 12} 30 A 12 12 0 0 0 ${x + 12} 30`} fill="none" />
      ))}
    </g>
  );
}

const PATTERNS: Record<string, () => React.ReactElement> = {
  architecture: SquareRings,
  security: Hatch,
  data_integrity: SteppedBars,
  reliability: RadialTicks,
  quality: DotLattice,
  product_ux: Chevrons,
  devops: Brackets,
  algorithms: Arcs,
  code_quality: Interlock,
  ai_ml: Circles,
  evidence_arbiter: Balance,
};

export function CrestPattern({ persona }: { persona: string }) {
  const Pattern = PATTERNS[persona] ?? SquareRings;
  return (
    <g className="text-gold-800/55" stroke="currentColor" strokeWidth={1} opacity={0.5}>
      <Pattern />
    </g>
  );
}
