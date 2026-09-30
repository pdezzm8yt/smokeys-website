/**
 * Desert road environment, pure SVG (paints instantly, zero image bytes).
 *  - "dusk":  fallback backdrop for scene 1 when no roadrunner photo is supplied
 *  - "night": the bus reveal. Same road, after the dust storm, lights down.
 */
const PALETTES = {
  dusk: {
    sky: ["#120a24", "#3b1640", "#8a2f45", "#e2753d", "#f6b25e"],
    sun: 1,
    halo: ["#ffb35c", 0.55],
    stars: 0.5,
    range: "#5a2438",
    mesas: "#2a1220",
    ground: ["#3a1c1e", "#1c1012", "#090607"],
    road: ["#4a2a26", "#1d1416", "#0c0a0b"],
    lines: 0.35,
    cacti: "#0f0709",
  },
  night: {
    sky: ["#020207", "#07061a", "#140c2a", "#2c1438", "#4b1f40"],
    sun: 0,
    halo: ["#7a3cff", 0.22],
    stars: 0.85,
    range: "#1a0f24",
    mesas: "#0c0812",
    ground: ["#120b16", "#08060b", "#030204"],
    road: ["#1a1320", "#0c0a10", "#050407"],
    lines: 0.18,
    cacti: "#030204",
  },
} as const;

const STARS = [
  [120, 60], [260, 140], [420, 40], [610, 110], [980, 70], [1180, 150], [1320, 50], [1480, 120], [760, 30], [1500, 220], [80, 200],
  [340, 230], [880, 190], [1060, 260], [1560, 40], [520, 180], [1240, 300], [180, 320],
];

export function DesertBackdrop({ variant = "dusk" }: { variant?: keyof typeof PALETTES }) {
  const p = PALETTES[variant];
  const id = (name: string) => `dz-${variant}-${name}`;

  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden="true">
      <defs>
        <linearGradient id={id("sky")} x1="0" y1="0" x2="0" y2="1">
          {p.sky.map((c, i) => (
            <stop key={c} offset={[0, 0.35, 0.55, 0.66, 0.7][i]} stopColor={c} />
          ))}
        </linearGradient>
        <radialGradient id={id("sun")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff3d6" />
          <stop offset="0.45" stopColor="#ffc46e" />
          <stop offset="1" stopColor="#ff8a3d" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("halo")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={p.halo[0]} stopOpacity={p.halo[1]} />
          <stop offset="1" stopColor={p.halo[0]} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("ground")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.ground[0]} />
          <stop offset="0.3" stopColor={p.ground[1]} />
          <stop offset="1" stopColor={p.ground[2]} />
        </linearGradient>
        <linearGradient id={id("road")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.road[0]} />
          <stop offset="0.25" stopColor={p.road[1]} />
          <stop offset="1" stopColor={p.road[2]} />
        </linearGradient>
      </defs>

      <rect width="1600" height="630" fill={`url(#${id("sky")})`} />
      <g fill="#fff" opacity={p.stars}>
        {STARS.map(([x, y], i) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={i % 4 === 0 ? 1.8 : 1.2} />
        ))}
      </g>

      <circle cx="800" cy="540" r="440" fill={`url(#${id("halo")})`} />
      {p.sun > 0 && <circle cx="800" cy="548" r="130" fill={`url(#${id("sun")})`} />}

      {/* Far range */}
      <path
        d="M0 560 L90 520 L170 540 L260 490 L340 530 L430 505 L520 548 L600 520 L680 560 L1000 560 L1080 518 L1160 540 L1250 495 L1340 530 L1420 505 L1520 540 L1600 515 L1600 640 L0 640 Z"
        fill={p.range}
        opacity="0.75"
      />
      {/* Mesas */}
      <path
        d="M0 600 L60 600 L80 560 L230 560 L250 600 L420 600 L440 580 L520 580 L540 604 L1080 604 L1100 572 L1210 572 L1232 600 L1330 600 L1350 548 L1520 548 L1540 600 L1600 600 L1600 660 L0 660 Z"
        fill={p.mesas}
      />

      <rect y="600" width="1600" height="300" fill={`url(#${id("ground")})`} />

      {/* Road in perspective */}
      <polygon points="786,604 814,604 1280,900 320,900" fill={`url(#${id("road")})`} />
      <polyline points="786,604 320,900" stroke="#f3c38a" strokeOpacity={p.lines} strokeWidth="3" fill="none" />
      <polyline points="814,604 1280,900" stroke="#f3c38a" strokeOpacity={p.lines} strokeWidth="3" fill="none" />
      <g fill="#f7d49a" opacity={p.lines * 1.5}>
        <polygon points="799,612 801,612 801.6,622 798.4,622" />
        <polygon points="798.2,636 801.8,636 802.6,652 797.4,652" />
        <polygon points="797,672 803,672 804.4,698 795.6,698" />
        <polygon points="795,728 805,728 807.4,772 792.6,772" />
        <polygon points="792,812 808,812 812,880 788,880" />
      </g>

      {/* Saguaro silhouettes */}
      <g fill={p.cacti}>
        <path d="M210 640 L210 520 Q210 500 226 500 Q242 500 242 520 L242 640 Z M210 580 L186 580 Q176 580 176 570 L176 540 Q176 530 186 530 Q196 530 196 540 L196 562 L210 562 Z M242 560 L262 560 L262 530 Q262 520 272 520 Q282 520 282 530 L282 568 Q282 578 272 578 L242 578 Z" />
        <path d="M1390 660 L1390 490 Q1390 468 1410 468 Q1430 468 1430 490 L1430 660 Z M1390 580 L1360 580 Q1348 580 1348 568 L1348 520 Q1348 508 1360 508 Q1372 508 1372 520 L1372 560 L1390 560 Z M1430 550 L1456 550 L1456 500 Q1456 488 1468 488 Q1480 488 1480 500 L1480 560 Q1480 572 1468 572 L1430 572 Z" />
      </g>
    </svg>
  );
}
