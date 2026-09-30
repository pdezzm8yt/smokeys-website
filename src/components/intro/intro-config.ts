/**
 * Timing and speed tunables for the intro. Change a number here, not in the
 * timeline code. (Layout tunables live in globals.css under `.intro-stage`.)
 *
 * The master timeline is one continuous shot. Positions below are seconds after
 * the tap; phases deliberately OVERLAP (the cartoon fades in while the real
 * bird is still visible, dust forms while the cartoon is still running, the bus
 * is in place before the dust clears).
 */
export const INTRO = {
  /** Ignore wheel/keys this long after the reveal lands (trackpad inertia). */
  cooldownMs: 700,
  /** Keep the page locked briefly after the reveal so momentum can't fling it. */
  unlockDelayMs: 450,
  /** Never hold the visitor on the loader longer than this, even if an image stalls. */
  preloadTimeoutMs: 8000,

  timeline: {
    /** Real roadrunner kicks into top speed (the tap's immediate response). */
    accelerate: 0.7,
    /** Real → cartoon: overlapping crossfade of both birds in the same pose. */
    morphAt: 0.35,
    morph: 0.6,
    /** Cartoon running through the desert before the storm. */
    run: 2.0,
    /** Dust starts forming behind him this long into the run. */
    dustFormsAt: 0.95,
    /** Dust cloud builds to full cover. */
    dustBuild: 0.85,
    /** Frame fully covered while the roadrunner becomes the bus. */
    hold: 0.3,
    /** Dust clears and the bus rolls out of it. */
    clear: 1.4,
    /** Branding waits for the reveal to land; CTAs come after branding. */
    brandAfterClear: 1.45,
    ctaAfterBrand: 0.6,
  },

  /**
   * World speed: one number that drives every loop (parallax layers, stride
   * bob, speed lines, dust emission). Loops play at `speed × their own rate`,
   * so ramping this ramps the whole world smoothly. It only ever rises:
   * idle → kick (the tap's instant surge) → run (steady climb) → storm.
   */
  speed: {
    idle: 1,
    kick: 2.2,
    run: 2.5,
    storm: 3.4,
    /** The stride and whoosh cap here so each footfall stays readable (≥ 6 frames) at storm speed. */
    strideMax: 1.8,
  },

  /** Seconds per loop of each parallax layer at world speed 1 (lower = faster). */
  loops: {
    realPlate: 2.4,
    realGround: 1.1,
    desertClouds: 65,
    desertFar: 26,
    desertMid: 7,
    desertNear: 1.4,
  },
} as const;
