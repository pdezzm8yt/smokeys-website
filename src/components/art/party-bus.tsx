import { cn } from "@/lib/cn";

type PartyBusProps = {
  /** Unique per instance so gradient/filter ids never collide on one page. */
  idPrefix: string;
  /** Static render with party lights on (the intro animates them instead). */
  lightsOn?: boolean;
  /** Show the headlight beam cone extending off to the right. */
  beam?: boolean;
  className?: string;
};

const WINDOW_X = [110, 246, 382, 518, 654, 790];
const LIGHT_COLORS = ["pink", "violet", "cyan", "pink", "violet", "cyan"] as const;

/**
 * Illustrated PLACEHOLDER of a black party bus (side view, facing right).
 * Replace with real photography via `assets.bus.heroLightsOff/On` when available.
 *
 * `data-bus-*` attributes are animation hooks used by IntroSequence.
 */
export function PartyBus({ idPrefix, lightsOn = true, beam = false, className }: PartyBusProps) {
  const id = (name: string) => `${idPrefix}-${name}`;
  const lit = lightsOn ? 1 : 0;

  return (
    <svg
      viewBox="0 0 1200 440"
      className={cn("overflow-visible", className)}
      role="img"
      aria-label="Illustration of a black party bus with neon lights (placeholder artwork)"
    >
      <defs>
        <linearGradient id={id("body")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b2b35" />
          <stop offset="0.45" stopColor="#101015" />
          <stop offset="1" stopColor="#17171e" />
        </linearGradient>
        <linearGradient id={id("glass")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#141824" />
          <stop offset="0.55" stopColor="#0b0d13" />
          <stop offset="1" stopColor="#1b2030" />
        </linearGradient>
        <linearGradient id={id("pink")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.78 0.2 350)" />
          <stop offset="1" stopColor="oklch(0.45 0.2 330)" />
        </linearGradient>
        <linearGradient id={id("violet")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.72 0.2 295)" />
          <stop offset="1" stopColor="oklch(0.4 0.18 285)" />
        </linearGradient>
        <linearGradient id={id("cyan")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.88 0.12 205)" />
          <stop offset="1" stopColor="oklch(0.5 0.12 230)" />
        </linearGradient>
        <linearGradient id={id("chrome")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4f4f8" />
          <stop offset="0.5" stopColor="#8a8d99" />
          <stop offset="1" stopColor="#d9dae2" />
        </linearGradient>
        <radialGradient id={id("rim")}>
          <stop offset="0" stopColor="#9a9eab" />
          <stop offset="0.7" stopColor="#3a3d47" />
          <stop offset="1" stopColor="#1a1b21" />
        </radialGradient>
        <linearGradient id={id("beam")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="oklch(0.95 0.08 85)" stopOpacity="0.55" />
          <stop offset="1" stopColor="oklch(0.9 0.1 80)" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id("flare")}>
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset="0.25" stopColor="oklch(0.9 0.12 80)" stopOpacity="0.8" />
          <stop offset="1" stopColor="oklch(0.8 0.15 70)" stopOpacity="0" />
        </radialGradient>
        <filter id={id("blur")} x="-20%" y="-200%" width="140%" height="500%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <filter id={id("glow")} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Underglow */}
      <g data-bus-glow style={{ opacity: lit }}>
        <ellipse cx="610" cy="404" rx="540" ry="18" fill="var(--neon-pink)" filter={`url(#${id("blur")})`} opacity="0.9" />
        <ellipse cx="610" cy="404" rx="420" ry="6" fill="var(--neon-violet)" filter={`url(#${id("blur")})`} />
      </g>

      {/* Headlight beam + flare */}
      <g data-bus-headlight>
        {beam && <polygon points="1150,266 1700,170 1700,400 1150,296" fill={`url(#${id("beam")})`} />}
        <circle cx="1146" cy="280" r="70" fill={`url(#${id("flare")})`} />
      </g>

      <g data-bus-body>
        {/* Body */}
        <path
          d="M70 92 Q70 60 102 60 L1010 60 Q1052 60 1077 86 L1136 176 Q1150 196 1150 222 L1150 330 Q1150 352 1128 352 L92 352 Q70 352 70 330 Z"
          fill={`url(#${id("body")})`}
          stroke="#2c2c36"
          strokeWidth="2"
        />
        <rect x="96" y="66" width="900" height="7" rx="3.5" fill="#fff" opacity="0.07" />

        {/* Side windows + interior lights */}
        {WINDOW_X.map((x, i) => (
          <g key={x}>
            <rect x={x} y="90" width="120" height="100" rx="12" fill={`url(#${id("glass")})`} />
            <rect
              data-bus-light
              x={x}
              y="90"
              width="120"
              height="100"
              rx="12"
              fill={`url(#${id(LIGHT_COLORS[i] ?? "pink")})`}
              opacity={lit * 0.85}
              style={{ mixBlendMode: "screen" }}
            />
            <path d={`M${x + 18} 90 L${x + 58} 90 L${x + 20} 190 L${x} 190 L${x} 140 Z`} fill="#fff" opacity="0.06" />
          </g>
        ))}

        {/* Windshield */}
        <path d="M1004 82 L1058 86 Q1072 88 1080 100 L1128 180 L1010 180 Z" fill={`url(#${id("glass")})`} />
        <path d="M1020 88 L1050 88 L1030 176 L1012 176 Z" fill="#fff" opacity="0.07" />

        {/* Door */}
        <rect x="918" y="90" width="54" height="244" rx="6" fill="none" stroke="#30303b" strokeWidth="2" />
        <rect x="925" y="98" width="40" height="96" rx="6" fill={`url(#${id("glass")})`} />
        <rect data-bus-light x="922" y="326" width="46" height="4" rx="2" fill="var(--primary)" opacity={lit} />

        {/* Roof LED strip */}
        <path data-bus-light d="M104 64 L1004 64" stroke="var(--neon-cyan)" strokeWidth="3" strokeLinecap="round" filter={`url(#${id("glow")})`} opacity={lit} />

        {/* Trim + decal */}
        <path d="M80 268 L1146 268" stroke="#3a3c47" strokeWidth="2" />
        <text
          x="500"
          y="248"
          textAnchor="middle"
          fontSize="58"
          fontWeight="900"
          letterSpacing="8"
          fill={`url(#${id("chrome")})`}
          opacity="0.92"
          style={{ fontFamily: "var(--font-display-face), sans-serif" }}
        >
          SMOKEY&apos;S
        </text>

        {/* Mirror, head- and taillights */}
        <path d="M1128 118 L1156 108 L1162 138 L1138 140 Z" fill="#101016" stroke="#2c2c36" strokeWidth="2" />
        <rect x="1136" y="264" width="14" height="32" rx="5" fill="#fff5dc" />
        <rect x="70" y="262" width="9" height="42" rx="3" fill="#ff2d55" filter={`url(#${id("glow")})`} />

        {/* Wheel arches + wheels */}
        {[250, 1045].map((cx) => (
          <g key={cx}>
            <path d={`M${cx - 66} 352 A66 66 0 0 1 ${cx + 66} 352 Z`} fill="#050507" />
            <circle cx={cx} cy="352" r="50" fill="#0a0a0c" stroke="#1d1d24" strokeWidth="5" />
            <circle cx={cx} cy="352" r="30" fill={`url(#${id("rim")})`} />
            {[0, 72, 144, 216, 288].map((deg) => (
              <line
                key={deg}
                x1={cx}
                y1="352"
                x2={cx}
                y2="326"
                stroke="#c9ccd6"
                strokeWidth="3"
                opacity="0.55"
                transform={`rotate(${deg} ${cx} 352)`}
              />
            ))}
            <circle cx={cx} cy="352" r="7" fill="#d9dbe3" />
          </g>
        ))}
      </g>
    </svg>
  );
}
