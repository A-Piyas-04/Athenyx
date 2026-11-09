"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * A specialist, as a person.
 *
 * Each one is an engraved bust — the kind of portrait struck on a medal or a
 * hallmark — rather than a photographic avatar. That keeps nine invented
 * colleagues from implying nine real people, and it sits inside the assay
 * language the rest of the brand already speaks: gold plate, umber line work.
 *
 * They are alive when idle: the bust breathes, the eyes blink on their own
 * offset rhythm, and on hover the head turns slightly toward you and the brow
 * lifts. All of it stops under reduced motion.
 */

type Face = {
  /** Plate tone for the face, from the gold ramp. */
  skin: string;
  hair: string;
  /** Drawn with the head, behind the gear. */
  Hair: () => React.ReactElement;
  /** Drawn in front of the face. */
  Gear?: () => React.ReactElement;
  /** Added to the blink cycle so they never blink in unison. */
  offset: number;
};

const LINE = "#412201";

/* ---------- hair and headgear, one set per specialist ---------- */

const SweptHair = () => (
  <path d="M36 44 C 38 24, 56 18, 70 22 C 82 25, 88 33, 86 46 C 82 36, 74 31, 62 32 C 50 33, 41 37, 36 44 Z" />
);

const Hood = () => (
  <path d="M32 58 C 28 30, 44 14, 60 14 C 76 14, 92 30, 88 58 C 84 40, 74 28, 60 28 C 46 28, 36 40, 32 58 Z" />
);

const BunHair = () => (
  <>
    <path d="M35 48 C 36 26, 52 19, 62 20 C 78 21, 86 32, 85 50 C 80 36, 72 31, 60 31 C 48 31, 39 38, 35 48 Z" />
    <circle cx="86" cy="28" r="9" />
  </>
);

const CropHair = () => (
  <path d="M36 46 C 37 27, 50 20, 62 20 C 76 20, 85 29, 84 46 C 79 35, 72 31, 60 31 C 48 31, 40 36, 36 46 Z" />
);

const CurlHair = () => (
  <>
    <path d="M34 48 C 34 28, 48 19, 61 19 C 76 19, 87 29, 86 49 C 80 36, 72 31, 60 31 C 47 31, 39 37, 34 48 Z" />
    {[38, 50, 62, 74, 84].map((cx, i) => (
      <circle key={cx} cx={cx} cy={i % 2 ? 20 : 24} r={7} />
    ))}
  </>
);

const LongHair = () => (
  <>
    <path d="M33 54 C 32 28, 48 18, 61 18 C 77 18, 88 29, 87 54 C 83 38, 73 30, 60 30 C 46 30, 37 38, 33 54 Z" />
    <path d="M33 50 C 29 66, 30 78, 34 88 L 42 88 C 37 76, 36 62, 38 52 Z" />
    <path d="M87 50 C 91 66, 90 78, 86 88 L 78 88 C 83 76, 84 62, 82 52 Z" />
  </>
);

const PartedHair = () => (
  <path d="M35 47 C 36 26, 50 19, 62 19 C 77 19, 86 29, 85 47 C 80 34, 73 30, 64 31 C 57 32, 52 36, 48 44 C 45 37, 40 42, 35 47 Z" />
);

/* ---------- gear worn in front of the face ---------- */

const HardHat = () => (
  <g>
    <path d="M36 40 C 36 22, 48 15, 60 15 C 72 15, 84 22, 84 40 Z" fill="#e1c802" />
    <rect x="28" y="38" width="64" height="5.5" rx="2.75" fill="#e1c802" />
    <rect x="57" y="16" width="6" height="23" rx="3" fill={LINE} opacity="0.28" />
  </g>
);

const Cap = () => (
  <g fill={LINE}>
    <path d="M34 42 C 34 24, 48 17, 61 17 C 76 17, 87 25, 86 42 Z" />
    <rect x="30" y="40" width="60" height="5" rx="2.5" />
    <path d="M86 40 L 105 43 L 105 47 L 86 45 Z" />
  </g>
);

const Visor = () => (
  <g>
    <rect x="34" y="42" width="52" height="13" rx="4" fill={LINE} opacity="0.9" />
    <rect x="38" y="45" width="19" height="4" rx="2" fill="#e1c802" opacity="0.45" />
  </g>
);

const Spectacles = () => (
  <g fill="none" stroke={LINE} strokeWidth="2">
    <circle cx="50" cy="50" r="9" />
    <circle cx="70" cy="50" r="9" />
    <path d="M59 50 h2" />
    <path d="M41 48 L 35 46" />
    <path d="M79 48 L 85 46" />
  </g>
);

const Monocle = () => (
  <g fill="none" stroke={LINE} strokeWidth="2">
    <circle cx="70" cy="50" r="10" />
    <path d="M70 60 C 72 68, 76 72, 80 75" />
  </g>
);

const Headset = () => (
  <g>
    <path d="M33 50 C 31 28, 46 18, 60 18 C 74 18, 89 28, 87 50" fill="none" stroke={LINE} strokeWidth="4" />
    <rect x="27" y="46" width="10" height="16" rx="4" fill={LINE} />
    <rect x="83" y="46" width="10" height="16" rx="4" fill={LINE} />
    <path d="M32 62 C 32 72, 40 74, 45 70" fill="none" stroke={LINE} strokeWidth="2.5" />
    <circle cx="46" cy="70" r="3" fill={LINE} />
  </g>
);

const Headphones = () => (
  <g>
    <path d="M32 52 C 30 30, 45 20, 60 20 C 75 20, 90 30, 88 52" fill="none" stroke={LINE} strokeWidth="4" />
    <rect x="25" y="48" width="12" height="18" rx="5" fill={LINE} />
    <rect x="83" y="48" width="12" height="18" rx="5" fill={LINE} />
  </g>
);

const Beard = () => (
  <path
    d="M38 56 C 38 80, 48 90, 60 90 C 72 90, 82 80, 82 56 C 80 72, 72 78, 60 78 C 48 78, 40 72, 38 56 Z"
    fill={LINE}
    opacity="0.85"
  />
);

/* ---------- the cast ---------- */

const FACES: Record<string, Face> = {
  architecture: { skin: "#e1c802", hair: "#614501", Hair: SweptHair, Gear: HardHat, offset: 0 },
  security: { skin: "#c1ab01", hair: "#412201", Hair: Hood, Gear: Visor, offset: 0.7 },
  data_integrity: { skin: "#e1c802", hair: "#806800", Hair: BunHair, Gear: Spectacles, offset: 1.4 },
  reliability: { skin: "#c1ab01", hair: "#614501", Hair: CropHair, Gear: Headset, offset: 2.1 },
  quality: { skin: "#e1c802", hair: "#412201", Hair: LongHair, Gear: Monocle, offset: 2.8 },
  product_ux: { skin: "#c1ab01", hair: "#806800", Hair: CurlHair, Gear: Headphones, offset: 3.5 },
  devops: { skin: "#e1c802", hair: "#614501", Hair: CropHair, Gear: Cap, offset: 4.2 },
  algorithms: { skin: "#c1ab01", hair: "#412201", Hair: CurlHair, Gear: Spectacles, offset: 4.9 },
  code_quality: { skin: "#e1c802", hair: "#806800", Hair: PartedHair, Gear: Beard, offset: 5.6 },
  ai_ml: { skin: "#c1ab01", hair: "#614501", Hair: BunHair, Gear: Visor, offset: 6.3 },
  evidence_arbiter: { skin: "#e1c802", hair: "#412201", Hair: PartedHair, Gear: Spectacles, offset: 7 },
};

export function PersonaAvatar({
  persona,
  active = false,
  className,
  ...placement
}: {
  persona: string;
  active?: boolean;
  className?: string;
  /** Placement when nested inside another SVG. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  preserveAspectRatio?: string;
}) {
  const reduce = useReducedMotion();
  const face = FACES[persona] ?? FACES.architecture;
  const Hair = face.Hair;
  const Gear = face.Gear;

  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true" {...placement}>
      <motion.g
        animate={reduce ? undefined : { y: [0, -1.1, 0] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut", delay: face.offset * 0.3 }}
      >
        {/* Shoulders first, so the neck tucks behind the collar line. */}
        <path d="M14 120 C 14 98, 34 86, 60 86 C 86 86, 106 98, 106 120 Z" fill={face.hair} opacity="0.9" />
        <rect x="52" y="66" width="16" height="24" rx="7" fill={face.skin} opacity="0.7" />

        {/* The head turns a little toward you on hover. */}
        <motion.g
          animate={reduce ? undefined : { rotate: active ? -3.2 : 0, x: active ? 1.2 : 0 }}
          transition={{ type: "spring", stiffness: 160, damping: 18 }}
          style={{ transformOrigin: "60px 76px" }}
        >
          <ellipse cx="37" cy="54" rx="4" ry="5.5" fill={face.skin} />
          <ellipse cx="83" cy="54" rx="4" ry="5.5" fill={face.skin} />
          <ellipse cx="60" cy="52" rx="23" ry="26" fill={face.skin} />

          <g fill={face.hair}>
            <Hair />
          </g>

          <motion.g
            animate={reduce ? undefined : { y: active ? -1.6 : 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 20 }}
            stroke={LINE}
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          >
            <path d="M44 42 C 47 39.5, 54 39.5, 57 41.5" />
            <path d="M63 41.5 C 66 39.5, 73 39.5, 76 42" />
          </motion.g>

          <motion.g
            fill={LINE}
            animate={reduce ? undefined : { scaleY: [1, 1, 0.08, 1] }}
            transition={{ duration: 0.3, repeat: Infinity, repeatDelay: 3.6 + face.offset, ease: "easeInOut" }}
            style={{ transformOrigin: "60px 50px" }}
          >
            <ellipse cx="50" cy="50" rx="2.9" ry="3.2" />
            <ellipse cx="70" cy="50" rx="2.9" ry="3.2" />
          </motion.g>

          <path
            d="M60 54 L 60 61 L 63.5 62.5"
            fill="none"
            stroke={LINE}
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity="0.7"
          />

          <motion.path
            animate={
              reduce
                ? undefined
                : { d: active ? "M53 68 C 57 71.5, 63 71.5, 67 68" : "M53 68.5 C 57 70, 63 70, 67 68.5" }
            }
            transition={{ duration: 0.3 }}
            d="M53 68.5 C 57 70, 63 70, 67 68.5"
            fill="none"
            stroke={LINE}
            strokeWidth="2"
            strokeLinecap="round"
          />

          {Gear ? <Gear /> : null}
        </motion.g>

        {/* The collar: the bust sits on a plate edge, like a struck medal. */}
        <path d="M14 120 C 14 104, 30 94, 44 92 L 60 104 L 76 92 C 90 94, 106 104, 106 120 Z" fill={LINE} opacity="0.92" />
        <path d="M44 92 L 60 104 L 76 92" fill="none" stroke={face.skin} strokeWidth="1.6" opacity="0.5" />
      </motion.g>
    </svg>
  );
}
