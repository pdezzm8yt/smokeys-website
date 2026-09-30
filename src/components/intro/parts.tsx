import type { StaticImageData } from "next/image";
import type { ReactNode } from "react";
import dust1 from "@/assets/intro/dust-1.webp";
import { cn } from "@/lib/cn";

/*
 * Static building blocks for the intro's overlays. Nothing here animates by
 * itself: the GSAP engine (intro-engine.ts) finds these by their data-* hooks
 * and drives them from one master timeline, at the shared world speed.
 */

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
 * rate and puff size follow the world speed and the gathering storm. It sits
 * in a box the engine places at the subject's feet (see FeetDust in scenes.tsx).
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
