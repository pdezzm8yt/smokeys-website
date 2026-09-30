import { INTRO } from "./intro-config";
import { LoopLayer } from "./parts";

/*
 * Scene 2 environment: a flat, cartoon-style desert built from horizontally
 * tileable SVG strips. Each strip's left and right edges match, so LoopLayer
 * can scroll them forever. Speeds differ per layer (parallax): far mesas
 * crawl, cacti glide, the road rushes past.
 */

const OUTLINE = "#3a1f14";

function Clouds() {
  const cloud = (x: number, y: number, s: number) => (
    <g key={x} transform={`translate(${x} ${y}) scale(${s})`} fill="#fff8ec" stroke="#f1d6b8" strokeWidth="4">
      <path d="M0 60 Q0 20 40 24 Q56 -6 96 6 Q124 -10 150 18 Q196 14 196 52 Q200 76 170 76 L24 76 Q0 76 0 60 Z" />
    </g>
  );
  return (
    <svg viewBox="0 0 3200 300" className="h-full shrink-0" style={{ aspectRatio: "3200 / 300" }}>
      {[cloud(120, 60, 1.1), cloud(900, 150, 0.8), cloud(1650, 40, 1.3), cloud(2500, 120, 0.9)]}
    </svg>
  );
}

// Flat-topped buttes; the ridge starts and ends at y=420 so the tile repeats seamlessly.
const MESA_RIDGE =
  "M0 420 L60 410 L92 330 L380 330 L412 400 L520 420 L560 362 L700 362 L732 440 L900 450 L942 300 L1280 300 L1322 420 L1500 440 L1540 382 L1720 382 L1752 450 L2000 460 L2042 342 L2360 342 L2402 430 L2600 450 L2642 392 L2860 392 L2902 440 L3200 420";
// Closed shape for the fill + clip. The outline is drawn on the open ridge only:
// stroking the closed shape would draw a dark vertical line at every tile seam.
const MESA_SKYLINE = `${MESA_RIDGE.replace("M0 420", "M0 600 L0 420")} L3200 600 Z`;

/** Shared SVG defs, rendered once (LoopLayer repeats tiles, and ids must stay unique). */
function DesertDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <clipPath id="cd-mesa-clip">
          <path d={MESA_SKYLINE} />
        </clipPath>
        <linearGradient id="cd-mesa" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9864c" />
          <stop offset="1" stopColor="#d4683a" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Mesas() {
  const skyline = MESA_SKYLINE;
  return (
    <svg viewBox="0 0 3200 600" className="h-full shrink-0" style={{ aspectRatio: "3200 / 600" }}>
      <path d={skyline} fill="url(#cd-mesa)" />
      {/* Rock strata, clipped to the silhouette */}
      <g clipPath="url(#cd-mesa-clip)" stroke="#b9552d" strokeWidth="6" opacity="0.55">
        <path d="M0 372 H3200" />
        <path d="M0 412 H3200" strokeWidth="4" />
        <path d="M0 470 H3200" strokeWidth="8" />
      </g>
      <path d={MESA_RIDGE} fill="none" stroke={OUTLINE} strokeWidth="5" strokeLinejoin="round" />
      {/* Atmospheric haze at the base */}
      <rect y="470" width="3200" height="130" fill="#ffd9a0" opacity="0.35" />
    </svg>
  );
}

/** Saguaro drawn as fat round-capped strokes: outline pass, then fill pass. */
function Saguaro({ x, h, armL, armR }: { x: number; h: number; armL: number; armR: number }) {
  const base = 300;
  const top = base - h;
  const d = [
    `M${x} ${base} L${x} ${top}`,
    `M${x - 6} ${top + h * armL} L${x - 52} ${top + h * armL} L${x - 52} ${top + h * armL - 70}`,
    `M${x + 6} ${top + h * armR} L${x + 50} ${top + h * armR} L${x + 50} ${top + h * armR - 56}`,
  ].join(" ");
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke={OUTLINE} strokeWidth="48" />
      <path d={d} stroke="#4fa35a" strokeWidth="38" />
      <path d={`M${x - 8} ${base - 10} L${x - 8} ${top + 8}`} stroke="#72c27c" strokeWidth="6" />
    </g>
  );
}

function Cacti() {
  return (
    <svg viewBox="0 0 3200 300" className="h-full shrink-0" style={{ aspectRatio: "3200 / 300" }}>
      <Saguaro x={260} h={230} armL={0.45} armR={0.3} />
      <Saguaro x={1320} h={190} armL={0.38} armR={0.5} />
      <Saguaro x={2380} h={250} armL={0.5} armR={0.35} />
      {/* Rocks and scrub */}
      <g stroke={OUTLINE} strokeWidth="5">
        <ellipse cx="720" cy="286" rx="70" ry="34" fill="#c4683c" />
        <ellipse cx="780" cy="292" rx="40" ry="22" fill="#d9844f" />
        <ellipse cx="1860" cy="288" rx="90" ry="38" fill="#c4683c" />
        <ellipse cx="2860" cy="290" rx="54" ry="26" fill="#d9844f" />
      </g>
      <g fill="#6f9a3e" stroke={OUTLINE} strokeWidth="4">
        <circle cx="1020" cy="282" r="26" />
        <circle cx="1052" cy="276" r="30" />
        <circle cx="1086" cy="286" r="22" />
        <circle cx="2100" cy="284" r="24" />
        <circle cx="2130" cy="278" r="28" />
      </g>
    </svg>
  );
}

function Road() {
  const dashes = Array.from({ length: 8 }, (_, i) => i * 400 + 60);
  const pebbles = [
    [140, 350, 9], [520, 372, 6], [860, 340, 11], [1240, 380, 7], [1610, 356, 10], [1980, 376, 6], [2330, 344, 9], [2750, 368, 8], [3050, 352, 7],
    [300, 70, 6], [980, 90, 8], [1700, 60, 5], [2450, 84, 7],
  ];
  return (
    <svg viewBox="0 0 3200 400" className="h-full shrink-0" style={{ aspectRatio: "3200 / 400" }}>
      <rect width="3200" height="400" fill="#e8a050" />
      <rect y="120" width="3200" height="180" fill="#3d3642" />
      <path d="M0 128 H3200 M0 292 H3200" stroke="#f7e7c0" strokeWidth="8" />
      {dashes.map((x) => (
        <rect key={x} x={x} y="202" width="220" height="14" rx="7" fill="#ffd35c" />
      ))}
      <g fill="#c77b3b">
        {pebbles.map(([x, y, r]) => (
          <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={r} ry={(r ?? 6) * 0.6} />
        ))}
      </g>
    </svg>
  );
}

export function CartoonDesert() {
  return (
    <div aria-hidden="true" className="absolute inset-0">
      <DesertDefs />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#3b8fd9_0%,#7cc4ee_42%,#ffe1a1_66%)]" />
      <div className="absolute top-[10%] right-[12%] size-[22vmin] rounded-full bg-[radial-gradient(circle,#fff8d6_0%,#ffd76e_55%,#ffb347_68%,transparent_70%)] shadow-[0_0_120px_50px_rgb(255_205_110/0.45)]" />
      <LoopLayer seconds={INTRO.loops.desertFar * 2.5} className="top-[6%] h-[14%] opacity-90">
        <Clouds />
      </LoopLayer>
      <LoopLayer seconds={INTRO.loops.desertFar} className="bottom-[33%] h-[32%]">
        <Mesas />
      </LoopLayer>
      <div className="absolute inset-x-0 bottom-0 h-[35%] bg-linear-to-b from-[#f2b866] to-[#e59a4c]" />
      <LoopLayer seconds={INTRO.loops.desertMid} className="bottom-[21%] h-[20%]">
        <Cacti />
      </LoopLayer>
      <LoopLayer seconds={INTRO.loops.desertNear} className="bottom-0 h-[24%]">
        <Road />
      </LoopLayer>
    </div>
  );
}
