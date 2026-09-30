/**
 * Timing and speed tunables for the intro. Change a number here, not in the
 * components or timelines. (Layout tunables live in globals.css, see below.)
 */
export const INTRO = {
  /** How long the cartoon runs through the desert before the dust storm hits. */
  cartoonHoldMs: 1900,
  /** Ignore wheel/keys this long after a scene lands (trackpad inertia). */
  cooldownMs: 700,
  /** Keep the page locked briefly after the reveal so momentum can't fling it. */
  unlockDelayMs: 450,

  // Layout (shared anchor, subject widths, portrait / short-landscape variants)
  // lives in CSS custom properties on `.intro-stage` in src/app/globals.css.

  /** Seconds per loop of each parallax layer (lower = faster). */
  loops: {
    realPlate: 2.4,
    realGround: 1.1,
    desertFar: 26,
    desertMid: 7,
    desertNear: 1.4,
  },
} as const;
