/**
 * Timing tunables for the intro. Change a number here, not in the timeline
 * code. The film's files, framing and story beats (seconds into the footage)
 * live in src/content/intro-video.ts; layout rules in globals.css (.intro-film).
 *
 * The intro is ONE timeline scrubbed by scroll. Its positions are timeline
 * units, not seconds: the whole timeline is spread over `scroll.screens`
 * screen-heights of scrolling. The film's stretches (between its beats) get
 * these many units each, so the pace can differ per stretch: the dust, where
 * the roadrunner becomes the bus, gets more scroll than its seconds alone
 * would give it.
 */
export const INTRO = {
  /** The film must be in memory within this, or the story is told with stills (scrolling unlocks anyway). */
  filmTimeoutMs: 25_000,
  /** The loader waits at most this long for the engine code. */
  engineTimeoutMs: 10_000,

  scroll: {
    /** How much scrolling the intro takes, in screen heights (the stage stays pinned meanwhile). */
    screens: 5,
    /** Reduced motion / Save-Data / no film: a shorter run of calm crossfades. */
    stillScreens: 2,
    /** Seconds the timeline takes to catch up with the scrollbar: smooths wheel steps and touch flicks. */
    scrub: 0.8,
  },

  timeline: {
    /** Film start → the tunnel: the roadrunner's run. */
    run: 1.7,
    /** The tunnel → he's swallowed by the dust. */
    tunnel: 1.2,
    /** Swallowed → the headlights: the thickest dust, where he becomes the bus. */
    dust: 0.9,
    /** The headlights → the bus at rest. */
    reveal: 1.5,
    /** Branding lands just after the film comes to rest; CTAs come after branding. */
    brandAfterRest: 0.1,
    ctaAfterBrand: 0.5,
    ctaLength: 0.6,
    /** A last beat to take it in (the stage fades into the page below) before it unpins and the page scrolls on. */
    dwell: 0.6,
    /** "Fast like a roadrunner…" shows during the run. */
    captionAt: 0.3,
    captionFor: 0.8,
  },

  /** The camera (GSAP, around the film): a slow push during the run, a charge into the dust, settling on the bus. */
  camera: { push: 1.05, charge: 1.12 },

  /** The dust-coloured haze over everything at the swap (0–1): the film's own dust does most of the hiding. */
  haze: 0.55,
} as const;
