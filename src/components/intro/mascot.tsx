import { cn } from "@/lib/cn";

const INK = "#0b0a10";
const BODY = "#2d2438";
const SHADE = "#1f1828";
const BELLY = "#f4e7d2";
const PINK = "var(--neon-pink)";
const AMBER = "var(--primary)";

/**
 * "Smokey": Smokey's ORIGINAL roadrunner mascot (placeholder art until the
 * illustrator delivers the final character). Deliberately not the Warner Bros.
 * Road Runner: charcoal body, neon crest, shades.
 */
export function Mascot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 380" className={cn("overflow-visible", className)} role="img" aria-label="Smokey, the Smokey's roadrunner mascot, in sunglasses">
      <g strokeLinejoin="round" strokeLinecap="round">
        {/* Smoke puffs at the feet */}
        <g fill="#d8cfe4" opacity="0.18">
          <circle cx="170" cy="340" r="18" />
          <circle cx="140" cy="330" r="12" />
          <circle cx="118" cy="342" r="8" />
        </g>

        {/* Tail feathers */}
        <path d="M175 214 C135 200 90 170 60 140 C52 130 62 116 76 126 C112 152 152 178 192 196 Z" fill={PINK} stroke={INK} strokeWidth="6" />
        <path d="M170 205 C130 175 85 120 58 72 C50 58 66 46 80 56 C112 92 158 142 196 176 Z" fill={BODY} stroke={INK} strokeWidth="6" />

        {/* Legs */}
        <g stroke={AMBER} strokeWidth="10" fill="none">
          <path d="M225 262 L212 330" />
          <path d="M212 330 L186 338 M212 330 L238 336" strokeWidth="9" />
          <path d="M262 260 L276 326" />
        </g>
        <g
          stroke={AMBER}
          strokeWidth="9"
          fill="none"
          className="origin-[276px_326px] [transform-box:view-box] motion-safe:animate-tap"
        >
          <path d="M276 326 L304 330 M276 326 L256 334" />
        </g>

        {/* Body */}
        <path d="M160 215 C158 165 205 135 258 140 C305 145 330 178 322 215 C314 252 272 272 226 268 C188 264 162 245 160 215 Z" fill={BODY} />
        <ellipse cx="282" cy="230" rx="34" ry="24" transform="rotate(-28 282 230)" fill={BELLY} />
        <path d="M200 192 C226 166 276 168 294 196 C270 208 236 214 200 192 Z" fill={SHADE} stroke={INK} strokeWidth="5" />
        <path d="M208 196 C236 206 262 204 286 198" stroke={PINK} strokeWidth="4" fill="none" />
        <path d="M160 215 C158 165 205 135 258 140 C305 145 330 178 322 215 C314 252 272 272 226 268 C188 264 162 245 160 215 Z" fill="none" stroke={INK} strokeWidth="7" />

        {/* Head group bobs as an idle */}
        <g className="origin-[300px_170px] [transform-box:view-box] motion-safe:animate-bob">
          <path d="M280 162 C290 132 300 114 318 110 L336 142 C320 152 306 168 296 182 Z" fill={BODY} stroke={INK} strokeWidth="6" />
          {/* Crest */}
          <path d="M318 78 C300 50 282 36 262 30 C286 48 296 62 304 82 Z" fill={PINK} stroke={INK} strokeWidth="5" />
          <path d="M328 72 C318 42 306 22 290 8 C314 24 326 44 336 70 Z" fill={AMBER} stroke={INK} strokeWidth="5" />
          <path d="M338 70 C340 44 336 24 326 6 C346 26 352 46 348 72 Z" fill={PINK} stroke={INK} strokeWidth="5" />
          <circle cx="342" cy="104" r="42" fill={BODY} stroke={INK} strokeWidth="7" />
          <ellipse cx="330" cy="126" rx="12" ry="7" fill={PINK} opacity="0.35" />
          {/* Beak + grin */}
          <path d="M372 98 C410 96 448 102 472 112 C448 122 410 126 372 124 Z" fill={AMBER} stroke={INK} strokeWidth="6" />
          <path d="M378 114 C402 122 428 121 452 114" stroke={INK} strokeWidth="4" fill="none" />
          {/* Shades */}
          <path d="M300 96 L318 90" stroke={INK} strokeWidth="5" />
          <path d="M316 86 L388 86 C390 104 384 118 368 118 C354 118 348 108 346 98 L340 98 C336 110 328 118 318 116 C306 114 304 100 316 86 Z" fill={INK} />
          <path d="M330 92 L340 92 L326 110 L320 110 Z" fill="var(--neon-cyan)" opacity="0.85" />
          <path d="M362 92 L374 92 L358 112 L352 112 Z" fill="var(--neon-cyan)" opacity="0.85" />
          <path d="M320 76 C336 68 352 68 366 74" stroke={INK} strokeWidth="6" fill="none" />
        </g>
      </g>
    </svg>
  );
}
