import Image, { type StaticImageData } from "next/image";
import type { CSSProperties, ReactNode } from "react";
import dust1 from "@/assets/intro/dust-1.webp";
import dust2 from "@/assets/intro/dust-2.webp";
import dust3 from "@/assets/intro/dust-3.webp";
import { cn } from "@/lib/cn";

/*
 * Static building blocks for the intro. Nothing here animates by itself: the
 * GSAP engine (intro-engine.ts) finds these by their data-* hooks and drives
 * them from one master timeline.
 */

export const DUST_SPRITES = [dust1, dust2, dust3];

type SubjectName = "real" | "cartoon" | "bus";

/**
 * A subject standing on the shared anchor point. Width comes from the
 * `--w-<name>` layout variable (globals.css, .intro-stage); height follows the
 * image's own aspect ratio, so it is never stretched. `children` are overlays
 * positioned in % of the image box. `trails` adds ghost copies behind the
 * image that the engine fades in as speed rises (a motion smear).
 */
export function AnchoredSubject({
  name,
  image,
  alt,
  fallback,
  priority = false,
  sizes,
  trails = 0,
  children,
}: {
  name: SubjectName;
  image: StaticImageData | null;
  alt: string;
  /** Illustrated placeholder when no image is supplied. */
  fallback: ReactNode;
  /** The first visible subject is the LCP element. */
  priority?: boolean;
  sizes: string;
  trails?: number;
  children?: ReactNode;
}) {
  return (
    <div
      className="intro-anchor absolute"
      style={{ width: `var(--w-${name})`, "--shift": name === "real" ? "var(--shift-real)" : undefined } as CSSProperties}
    >
      {/* The timeline moves this box; the stride loop lives on the inner one so they never fight. */}
      <div data-subject={name} className="relative isolate origin-bottom will-change-transform">
        <div data-bob className="relative origin-bottom will-change-transform">
          {image
            ? Array.from({ length: trails }, (_, i) => (
                <Image
                  key={i}
                  data-trail={i + 1}
                  src={image}
                  alt=""
                  aria-hidden="true"
                  sizes={sizes}
                  quality={85}
                  loading="eager"
                  draggable={false}
                  className="pointer-events-none absolute inset-0 -z-10 h-auto w-full opacity-0 select-none"
                />
              ))
            : null}
          {image ? (
            <Image
              src={image}
              alt={alt}
              sizes={sizes}
              quality={85}
              loading="eager"
              fetchPriority={priority ? "high" : undefined}
              draggable={false}
              className="block h-auto w-full select-none"
            />
          ) : (
            fallback
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * A horizontally looping parallax layer: three copies of `children`; the
 * engine slides it left by exactly one copy per loop, so the seam never shows.
 * `seconds` is the loop length at world speed 1.
 */
export function LoopLayer({ children, seconds, className }: { children: ReactNode; seconds: number; className?: string }) {
  return (
    <div aria-hidden="true" data-loop={seconds} className={cn("absolute left-0 flex w-max will-change-transform", className)}>
      {children}
      {children}
      {children}
    </div>
  );
}

/** One copy of a loopable image strip, sized by its own aspect ratio. */
export function StripTile({ image }: { image: StaticImageData }) {
  return (
    <div
      className="h-full shrink-0 bg-no-repeat"
      style={{
        aspectRatio: `${image.width} / ${image.height}`,
        backgroundImage: `url(${image.src})`,
        backgroundSize: "100% 100%", // box has the image's exact ratio, so this is 1:1
      }}
    />
  );
}

const STREAKS = [
  { top: "14%", width: "34%", seconds: 0.9 },
  { top: "27%", width: "22%", seconds: 0.7 },
  { top: "41%", width: "40%", seconds: 1.1 },
  { top: "58%", width: "26%", seconds: 0.8 },
  { top: "71%", width: "30%", seconds: 0.95 },
  { top: "86%", width: "44%", seconds: 0.75 },
];

/** Full-frame speed streaks rushing past the camera (they start just off the right edge). */
export function SpeedLines({ name, className }: { name: string; className?: string }) {
  return (
    <div data-speedlines={name} aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {STREAKS.map((s) => (
        <span
          key={s.top}
          data-streak={s.seconds}
          className="absolute left-full h-px rounded-full bg-linear-to-l from-transparent via-white/70 to-transparent will-change-transform max-md:[&:nth-child(even)]:hidden"
          style={{ top: s.top, width: s.width }}
        />
      ))}
    </div>
  );
}

/**
 * A pool of dust sprites the engine emits from a point behind the runner's
 * feet (`x`/`y` in % of the subject box, `size` in % of its width). Emission
 * rate and puff size follow the world speed and the gathering storm.
 */
export function DustEmitter({
  name,
  x,
  y,
  size,
  count,
  phoneCount,
  sprites = [dust1],
  cartoon = false,
}: {
  name: string;
  x: number;
  y: number;
  size: number;
  count: number;
  /** Fewer particles on phones (the rest are display:none, so the engine skips them). */
  phoneCount: number;
  sprites?: StaticImageData[];
  /** Bright cream cartoon puffs (reads against the cartoon's sand) instead of photo dust. */
  cartoon?: boolean;
}) {
  return (
    <div data-emitter={name} aria-hidden="true" className="pointer-events-none absolute inset-0">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          data-particle
          className={cn(
            "absolute aspect-square opacity-0 will-change-transform",
            cartoon
              ? "rounded-full bg-[radial-gradient(circle,#fffaf0_0%,#fbecd2_38%,rgb(246_226_192/0.6)_55%,transparent_70%)]"
              : "bg-contain bg-center bg-no-repeat",
            i >= phoneCount && "max-md:hidden",
          )}
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: `${size}%`,
            backgroundImage: cartoon ? undefined : `url(${sprites[i % sprites.length]?.src})`,
          }}
        />
      ))}
    </div>
  );
}

// Deterministic spread for the dust explosion: puffs fan out over the upper
// half-circle around the anchor, with a few staying central to fill the core.
const PUFFS = Array.from({ length: 10 }, (_, i) => {
  const central = i < 3;
  const angle = central ? -90 + (i - 1) * 40 : -180 + ((i - 3) / 6) * 180 + (i % 2 ? 7 : -7);
  const dist = central ? 4 + i * 2 : 20 + ((i * 37) % 22);
  const rad = (angle * Math.PI) / 180;
  return {
    "--dx": `${(Math.cos(rad) * dist).toFixed(1)}vmax`,
    "--dy": `${(Math.sin(rad) * dist * 0.7).toFixed(1)}vmax`,
    "--size": `${26 + ((i * 13) % 20)}vmax`,
    "--s0": central ? 0.35 : 0.2,
    "--grow": 1 + (i % 3) * 0.25,
    "--rot": `${(i % 2 ? 1 : -1) * (18 + i * 4)}deg`,
    sprite: i % DUST_SPRITES.length,
  };
});

/**
 * The dust cloud that hides the transformation. The engine tweens the
 * container's `--p` (0 = gathered at the anchor, 1 = full cover, ~2 = cleared);
 * every puff derives its own position, spin and size from it. Sprites only
 * load once the intro arms it (html[data-intro-armed="full"], globals.css),
 * never for visitors who skip.
 */
export function DustCloud() {
  return (
    <div
      data-dust
      className="absolute opacity-0"
      style={{ left: "var(--anchor-x)", bottom: "calc(var(--anchor-bottom) + 9svh)", "--p": 0 } as CSSProperties}
    >
      {PUFFS.map(({ sprite, ...vars }, i) => (
        <span
          key={i}
          className="dust-puff max-md:[&:nth-child(n+9)]:hidden"
          style={{ ...vars, backgroundImage: `url(${DUST_SPRITES[sprite]?.src})` } as CSSProperties}
        />
      ))}
    </div>
  );
}
