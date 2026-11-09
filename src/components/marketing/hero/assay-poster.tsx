import { cn } from "@/lib/utils";

/**
 * The hero's guaranteed visual: a flat twin of the 3D assay scene, as inline
 * SVG with no JavaScript. It is in the HTML on first byte, so it — not the
 * canvas — is what paints first, and it is all that mobile, reduced-motion and
 * no-WebGL visitors ever receive.
 *
 * Because it is the same composition as the scene, the canvas can cross-fade
 * over it without a visible jump.
 */
export function AssayPoster({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" aria-hidden="true" className={cn("h-full w-full", className)}>
      <defs>
        <linearGradient id="assay-bar-1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f0d81a" />
          <stop offset="55%" stopColor="#e1c802" />
          <stop offset="100%" stopColor="#a28900" />
        </linearGradient>
        <linearGradient id="assay-bar-2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c1ab01" />
          <stop offset="60%" stopColor="#a28900" />
          <stop offset="100%" stopColor="#806800" />
        </linearGradient>
        <linearGradient id="assay-bar-3" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a28900" />
          <stop offset="60%" stopColor="#806800" />
          <stop offset="100%" stopColor="#614501" />
        </linearGradient>
        <radialGradient id="assay-contact" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#412201" stopOpacity="0.5" />
          <stop offset="60%" stopColor="#412201" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#412201" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* The punch frame, hanging behind the bars. */}
      <g transform="translate(206 196) rotate(-4)" className="text-umber-900 dark:text-[#2b1a06]">
        <path
          d="M -86 -86 h 172 a 14 14 0 0 1 14 14 v 144 a 14 14 0 0 1 -14 14 h -172 a 14 14 0 0 1 -14 -14 v -144 a 14 14 0 0 1 14 -14 z
             M -62 -62 v 124 h 124 v -124 z"
          fill="currentColor"
          fillRule="evenodd"
        />
        <path
          d="M -62 -62 h 124 v 124 h -124 z"
          fill="none"
          stroke="#614501"
          strokeWidth="1.5"
        />
      </g>

      {/* Contact shadow on the bench. */}
      <ellipse cx="186" cy="324" rx="128" ry="20" fill="url(#assay-contact)" />

      {/* Three bars stepping down in width and tone, left-flush, as the mark does. */}
      <g transform="translate(96 118) skewY(-6)">
        <rect x="0" y="0" width="212" height="46" rx="6" fill="url(#assay-bar-1)" />
        <rect x="0" y="0" width="212" height="3" rx="1.5" fill="#f7e86b" opacity="0.85" />

        <rect x="-14" y="72" width="152" height="46" rx="6" fill="url(#assay-bar-2)" />
        <rect x="-14" y="72" width="152" height="3" rx="1.5" fill="#d9c23a" opacity="0.7" />

        <rect x="-28" y="144" width="92" height="46" rx="6" fill="url(#assay-bar-3)" />
        <rect x="-28" y="144" width="92" height="3" rx="1.5" fill="#b89b2e" opacity="0.6" />
      </g>
    </svg>
  );
}
