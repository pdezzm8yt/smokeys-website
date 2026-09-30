import type { Transition } from "motion/react";

/** Canonical motion tokens. Mirrors the CSS values in globals.css (@theme static). */
export const duration = { fast: 0.12, base: 0.2, moderate: 0.3, slow: 0.45 } as const;

export const ease = {
  enter: [0.16, 1, 0.3, 1],
  exit: [0.7, 0, 0.84, 0],
  standard: [0.65, 0, 0.35, 1],
} as const satisfies Record<string, [number, number, number, number]>;

export const enter = (d: number = duration.base): Transition => ({ duration: d, ease: ease.enter });
export const exit = (d: number = duration.base): Transition => ({ duration: d * 0.7, ease: ease.exit });

export const spring = {
  snappy: { type: "spring", visualDuration: 0.2, bounce: 0 },
  default: { type: "spring", visualDuration: 0.3, bounce: 0 },
  bouncy: { type: "spring", visualDuration: 0.45, bounce: 0.35 },
} as const satisfies Record<string, Transition>;

/** App-wide default: springs for movement, tweens for opacity and color. */
export const appTransition: Transition = {
  ...spring.default,
  opacity: enter(duration.base),
  color: enter(duration.fast),
  backgroundColor: enter(duration.fast),
};

/** Shared "reveal on scroll" variant pair used by <Reveal>. */
export const revealVariants = {
  hidden: { opacity: 0, y: 24 },
  shown: { opacity: 1, y: 0, transition: { ...enter(duration.slow) } },
} as const;
