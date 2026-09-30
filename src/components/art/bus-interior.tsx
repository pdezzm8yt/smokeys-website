/**
 * Illustrated PLACEHOLDER of the bus interior (one-point perspective looking
 * toward the rear). Swap for real interior photography when available.
 */
export function BusInterior({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1200 640" className={className} role="img" aria-label="Illustration of a party bus interior with LED ceiling and lounge seating (placeholder artwork)">
      <defs>
        <linearGradient id="bi-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141019" />
          <stop offset="1" stopColor="#07060a" />
        </linearGradient>
        <radialGradient id="bi-floorglow" cx="0.5" cy="0.1" r="0.7">
          <stop offset="0" stopColor="oklch(0.7 0.24 350)" stopOpacity="0.35" />
          <stop offset="1" stopColor="oklch(0.7 0.24 350)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bi-seat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2e2638" />
          <stop offset="1" stopColor="#17121e" />
        </linearGradient>
        <filter id="bi-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Ceiling */}
      <polygon points="0,0 1200,0 780,200 420,200" fill="#0e0c13" />
      <g fill="#fff">
        {[
          [300, 40], [420, 70], [540, 50], [660, 80], [780, 45], [900, 60], [480, 120], [600, 140], [720, 115], [560, 175], [640, 170], [360, 100], [840, 100],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 2.6 : 1.6} opacity={0.5 + (i % 4) * 0.12} />
        ))}
      </g>
      <path d="M40 0 L430 196" stroke="var(--neon-pink)" strokeWidth="5" filter="url(#bi-glow)" />
      <path d="M1160 0 L770 196" stroke="var(--neon-cyan)" strokeWidth="5" filter="url(#bi-glow)" />
      <path d="M430 196 L770 196" stroke="var(--neon-violet)" strokeWidth="4" filter="url(#bi-glow)" />

      {/* Side walls with windows */}
      <polygon points="0,0 420,200 420,420 0,640" fill="#15121c" />
      <polygon points="1200,0 780,200 780,420 1200,640" fill="#15121c" />
      <polygon points="60,110 360,225 360,300 60,250" fill="#0a0c12" stroke="#2a2533" strokeWidth="3" />
      <polygon points="1140,110 840,225 840,300 1140,250" fill="#0a0c12" stroke="#2a2533" strokeWidth="3" />
      <g opacity="0.8">
        <circle cx="140" cy="190" r="6" fill="oklch(0.85 0.13 75)" />
        <circle cx="220" cy="215" r="4" fill="oklch(0.7 0.24 350)" />
        <circle cx="300" cy="245" r="5" fill="oklch(0.84 0.13 205)" />
        <circle cx="1060" cy="190" r="5" fill="oklch(0.84 0.13 205)" />
        <circle cx="960" cy="222" r="6" fill="oklch(0.85 0.13 75)" />
      </g>

      {/* Rear wall + window */}
      <rect x="420" y="200" width="360" height="220" fill="#110f16" />
      <rect x="470" y="226" width="260" height="96" rx="10" fill="#07080c" stroke="#2a2533" strokeWidth="3" />
      <path d="M470 290 Q560 270 640 300 T730 290" stroke="oklch(0.7 0.24 350)" strokeOpacity="0.4" strokeWidth="2" fill="none" />

      {/* Floor */}
      <polygon points="420,420 780,420 1200,640 0,640" fill="url(#bi-floor)" />
      <polygon points="420,420 780,420 1200,640 0,640" fill="url(#bi-floorglow)" />

      {/* Wraparound lounge seating */}
      <polygon points="0,350 420,330 420,372 0,450" fill="url(#bi-seat)" />
      <polygon points="0,450 420,372 470,392 0,560" fill="#241d2d" />
      <polygon points="1200,350 780,330 780,372 1200,450" fill="url(#bi-seat)" />
      <polygon points="1200,450 780,372 730,392 1200,560" fill="#241d2d" />
      <polygon points="420,330 780,330 780,372 420,372" fill="url(#bi-seat)" />
      <polygon points="420,372 780,372 800,392 400,392" fill="#241d2d" />
      <g stroke="#3b3148" strokeWidth="2">
        <path d="M0 400 L420 351" />
        <path d="M1200 400 L780 351" />
      </g>
      {/* Seat base LED */}
      <path d="M0 560 L470 392 L730 392 L1200 560" stroke="var(--neon-pink)" strokeWidth="4" fill="none" filter="url(#bi-glow)" />

      {/* Bar */}
      <polygon points="640,395 760,395 790,470 620,470" fill="#1b1622" stroke="var(--neon-cyan)" strokeWidth="2.5" filter="url(#bi-glow)" />
      <rect x="660" y="372" width="12" height="24" rx="3" fill="oklch(0.84 0.13 205)" opacity="0.7" />
      <rect x="690" y="366" width="10" height="30" rx="3" fill="oklch(0.85 0.13 75)" opacity="0.7" />

      {/* Speaker */}
      <g transform="translate(990 270)">
        <ellipse rx="34" ry="42" fill="#0c0b10" stroke="#3b3148" strokeWidth="3" />
        <ellipse rx="20" ry="25" fill="#17141d" stroke="var(--neon-violet)" strokeWidth="2" />
        <ellipse rx="6" ry="8" fill="#2c2636" />
      </g>
    </svg>
  );
}
