/**
 * Timing tunables for the tunnel scene (the first scene of the world). Change
 * a number here, not in the timeline code. The film's files, framing and
 * story beats (seconds into the footage) live in src/content/intro-video.ts;
 * layout rules in globals.css (.intro-film).
 *
 * The scene is ONE timeline scrubbed by the world's scroll (sideways; down
 * on short landscape screens). Its positions are timeline units, not seconds:
 * the whole timeline is spread over `scroll.screens` screens of scrolling.
 * The film's stretches (between its beats) get these many units each, so the
 * pace can differ per stretch.
 */
export const INTRO = {
  /** The film must be in memory within this, or the story is told with stills (scrolling unlocks anyway). */
  filmTimeoutMs: 25_000,
  /**
   * A slow connection gets the stills without that wait: at once on 2G
   * (navigator.connection, where the browser reports it), or when the film's
   * download, judged once its bytes have been arriving for `warmupMs`, is on
   * course to take longer than `budgetMs` from its first byte (it's then cancelled).
   */
  slowNet: { warmupMs: 2_000, budgetMs: 10_000 },
  /** The loader waits at most this long for the engine code. */
  engineTimeoutMs: 10_000,

  scroll: {
    /** How much scrolling the scene takes, in screens (the stage stays pinned meanwhile; see .intro-scroll). */
    screens: 5,
    /** Reduced motion / Save-Data / no film: a shorter run of calm crossfades. */
    stillScreens: 2,
    /** Seconds the timeline takes to catch up with the scrollbar: smooths wheel steps and touch flicks. */
    scrub: 0.8,
  },

  timeline: {
    /** Film start → the tunnel: the roadrunner's run (the tunnel grows as he nears it). */
    run: 1.7,
    /** The tunnel → its darkest point: he runs in, the light goes, a black closes over everything. */
    enter: 0.9,
    /**
     * Complete darkness. Half-way through, out of sight, the film jumps from
     * its `dark` beat to its `lights` beat: the roadrunner has become the bus.
     */
    black: 0.5,
    /** The `lights` beat on: two headlights in the dark first, then the bus's shape (the black lifts). */
    lights: 0.8,
    /** The share of the film from `lights` to `rest` that the headlights stretch covers; the rest is the drive out. */
    lightsShare: 0.25,
    /** The bus drives out of the tunnel onto the road and comes to the front. */
    out: 1.3,
    /** Branding lands just after the film comes to rest; CTAs come after branding. */
    brandAfterRest: 0.1,
    ctaAfterBrand: 0.5,
    ctaLength: 0.6,
    /** The camera starts travelling on beside the bus before the stage lets go and the world carries on. */
    travel: 0.6,
    /** "Fast like a roadrunner…" shows during the run. */
    captionAt: 0.3,
    captionFor: 0.8,
  },

  /**
   * The camera (GSAP, around the film): a slow push during the run, a charge into
   * the tunnel, settling on the bus, then a drift sideways (fraction of the frame)
   * as it starts travelling on with it.
   */
  camera: { push: 1.05, charge: 1.12, travel: 0.06 },

  /**
   * The tunnel's black. It starts closing in at `from` (a share of the `enter`
   * stretch) and is complete at the darkest frame. After the swap it lifts in
   * two steps: quickly to `glimpse` (only the bus's headlights glow through),
   * reached `glimpseAt` (a share) into the headlights stretch, then slowly to
   * nothing as the bus takes shape.
   */
  darkness: { from: 0.35, glimpse: 0.7, glimpseAt: 0.35 },
} as const;
