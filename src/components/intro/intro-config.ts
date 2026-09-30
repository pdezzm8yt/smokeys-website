/**
 * Timing and speed tunables for the intro. Change a number here, not in the
 * timeline code. Clip files, framing and where each subject stands live in
 * src/content/intro-video.ts; layout rules in globals.css (.intro-clip).
 *
 * The intro is ONE timeline scrubbed by scroll. Its positions are timeline
 * units, not seconds: the whole timeline is spread over `scroll.screens`
 * screen-heights of scrolling (so 1 unit ≈ screens / total units of a screen).
 * Beats deliberately OVERLAP: the cartoon fades in while the real bird is
 * still visible, the dust clip starts while he's still running, the bus is in
 * place behind the dust before it clears.
 */
export const INTRO = {
  /** Scene 1 (the real clip) must be ready within this, or it starts as a still. */
  firstClipTimeoutMs: 10_000,
  /** The other clips must be ready within this, or they play as stills (scrolling unlocks anyway). */
  restClipsTimeoutMs: 30_000,

  scroll: {
    /** How much scrolling the intro takes, in screen heights (the stage stays pinned meanwhile). */
    screens: 4.5,
    /** Reduced motion / Save-Data: a shorter run of calm crossfades. */
    stillScreens: 2,
    /** Seconds the timeline takes to catch up with the scrollbar: smooths wheel steps and touch flicks. */
    scrub: 0.8,
  },

  timeline: {
    /** Camera push into the real bird while the cartoon fades in over it. */
    push: 1.08,
    /** Real → cartoon: an overlapping crossfade, both birds lined up and running. */
    morph: 0.8,
    morphLength: 1.1,
    /** The cartoon's desert run, until the storm. */
    run: 1.9,
    /** Small dust starts gathering at his feet this far into the run. */
    feetDustAt: 0.7,
    /** The dust clip starts this long before the storm (he's still running). */
    dustLead: 0.5,
    /** The storm builds to full cover (the swap happens at its end). */
    dustBuild: 0.9,
    /** Frame fully covered while the roadrunner becomes the bus. */
    hold: 0.3,
    /** Dust clears; the camera settles on the bus. */
    clear: 1.4,
    /** The bus clip starts this long before the dust thins: already driving when revealed. */
    busLead: 0.2,
    /** Branding waits for the camera to settle; CTAs come after branding. */
    brandAfterClear: 1.45,
    ctaAfterBrand: 0.5,
    ctaLength: 0.6,
    /** A last beat to take it in before the stage unpins and the page scrolls on. */
    dwell: 0.35,
  },

  /**
   * World speed: one number that drives everything that shows speed (the
   * running clips' playback rate, speed lines, feet dust, parallax layers).
   * It rises with scroll progress: idle → kick → run → storm.
   */
  speed: {
    idle: 1,
    kick: 1.9,
    run: 2.5,
    storm: 3.4,
    /** Extra speed while you scroll fast (it eases back when you stop). */
    scrollBoost: 1.2,
  },

  /** How world speed maps onto the running clips' playback rate: 1 + (speed − 1) × gain, capped. */
  video: { speedGain: 0.25, maxRate: 1.75 },

  /** Seconds per loop of each cartoon-desert layer at world speed 1 (only behind a transparent cartoon clip). */
  loops: {
    desertClouds: 65,
    desertFar: 26,
    desertMid: 7,
    desertNear: 1.4,
  },
} as const;
