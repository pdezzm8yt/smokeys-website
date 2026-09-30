import Image, { type StaticImageData } from "next/image";
import type { CSSProperties, ReactNode } from "react";
import dust1 from "@/assets/intro/dust-1.webp";
import dust2 from "@/assets/intro/dust-2.webp";
import dust3 from "@/assets/intro/dust-3.webp";
import { cn } from "@/lib/cn";

export const DUST_SPRITES = [dust1, dust2, dust3];

type SubjectName = "real" | "cartoon" | "bus";

/**
 * A subject standing on the shared anchor point. Width comes from the
 * `--w-<name>` layout variable (globals.css, .intro-stage); height follows the
 * image's own aspect ratio, so it is never stretched. `children` are overlays
 * positioned in % of the image box.
 */
export function AnchoredSubject({
  name,
  image,
  alt,
  fallback,
  idleClassName,
  priority = false,
  sizes,
  children,
}: {
  name: SubjectName;
  image: StaticImageData | null;
  alt: string;
  /** Illustrated placeholder when no image is supplied. */
  fallback: ReactNode;
  /** Idle loop while the scene plays (a motion-safe CSS animation). */
  idleClassName?: string;
  /** The first visible subject is the LCP element. */
  priority?: boolean;
  sizes: string;
  children?: ReactNode;
}) {
  return (
    <div
      className="intro-anchor absolute"
      style={{ width: `var(--w-${name})`, "--shift": name === "real" ? "var(--shift-real)" : undefined } as CSSProperties}
    >
      {/* Motion animates this box; the idle loop lives on the inner one so they never fight. */}
      <div data-subject={name} className="relative isolate origin-bottom will-change-transform">
        <div className={cn("relative origin-bottom", idleClassName)}>
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
 * A horizontally looping parallax layer: three copies of `children` slide
 * left by exactly one copy per loop, so the seam never shows.
 */
export function LoopLayer({ children, seconds, className }: { children: ReactNode; seconds: number; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("absolute left-0 flex w-max motion-safe:animate-pan", className)}
      style={{ animationDuration: `${seconds}s` }}
    >
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
  { top: "14%", width: "34%", duration: "0.9s", delay: "0s" },
  { top: "27%", width: "22%", duration: "0.7s", delay: "-0.35s" },
  { top: "41%", width: "40%", duration: "1.1s", delay: "-0.6s" },
  { top: "58%", width: "26%", duration: "0.8s", delay: "-0.2s" },
  { top: "71%", width: "30%", duration: "0.95s", delay: "-0.75s" },
  { top: "86%", width: "44%", duration: "0.75s", delay: "-0.5s" },
];

/** Full-frame speed streaks rushing past the camera. */
export function SpeedLines({ name, className }: { name: string; className?: string }) {
  return (
    <div data-speedlines={name} aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {STREAKS.map((s) => (
        <span
          key={s.top}
          className="absolute right-0 h-px rounded-full bg-linear-to-l from-transparent via-white/70 to-transparent motion-safe:animate-streak max-md:[&:nth-child(even)]:hidden"
          style={{ top: s.top, width: s.width, animationDuration: s.duration, animationDelay: s.delay }}
        />
      ))}
    </div>
  );
}

/**
 * Dust kicked up from the feet: sprites burst out behind the subject and
 * drift away. `x`/`y` place the emitter in % of the subject box.
 */
export function KickDust({ x, y, size, count = 4, period = 0.8 }: { x: number; y: number; size: number; count?: number; period?: number }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="absolute aspect-square -translate-1/2 bg-contain bg-center bg-no-repeat opacity-0 motion-safe:animate-kick"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: `${size}%`,
            // One sprite (rotated per particle by the keyframes): the only dust file scene 1 needs.
            backgroundImage: `url(${dust1.src})`,
            animationDuration: `${period}s`,
            animationDelay: `${(-i * period) / count}s`,
          }}
        />
      ))}
    </div>
  );
}

// Deterministic spread for the dust explosion: puffs fan out over the upper
// half-circle around the anchor, with a few staying central to fill the core.
const PUFFS = Array.from({ length: 16 }, (_, i) => {
  const central = i < 3;
  const angle = central ? -90 + (i - 1) * 40 : -180 + ((i - 3) / 12) * 180 + (i % 2 ? 7 : -7);
  const dist = central ? 4 + i * 2 : 20 + ((i * 37) % 22);
  const rad = (angle * Math.PI) / 180;
  return {
    "--dx": `${(Math.cos(rad) * dist).toFixed(1)}vmax`,
    "--dy": `${(Math.sin(rad) * dist * 0.7).toFixed(1)}vmax`,
    "--size": `${34 + ((i * 13) % 26)}vmax`,
    "--s0": central ? 0.35 : 0.2,
    "--grow": 1 + (i % 3) * 0.25,
    "--rot": `${(i % 2 ? 1 : -1) * (18 + i * 4)}deg`,
    sprite: i % DUST_SPRITES.length,
  };
});

/**
 * The dust explosion that hides the cartoon → bus swap. Motion animates the
 * container's `--p` (0 = gathered at the anchor, 1 = full cover, ~2 = cleared);
 * every puff derives its own position, spin and size from it. Sprites are only
 * fetched once `armed` (the run has started), never for visitors who skip it.
 */
export function DustCloud({ armed }: { armed: boolean }) {
  return (
    <div
      data-dust
      data-armed={armed ? "" : undefined}
      className="absolute opacity-0"
      style={{ left: "var(--anchor-x)", bottom: "calc(var(--anchor-bottom) + 9svh)", "--p": 0 } as CSSProperties}
    >
      {PUFFS.map(({ sprite, ...vars }, i) => (
        <span
          key={i}
          className="dust-puff max-md:[&:nth-child(n+11)]:hidden"
          style={{ ...vars, backgroundImage: `url(${DUST_SPRITES[sprite]?.src})` } as CSSProperties}
        />
      ))}
    </div>
  );
}
