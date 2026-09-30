/**
 * The intro's four video clips: the ONE place that says how each clip is
 * processed (scripts/intro-video/build.mjs reads this file) and how the intro
 * uses it (framing, where the subject stands, when it starts).
 *
 * Replacing footage (see assets/intro-source/video/README.md):
 *   1. Put your master file in assets/intro-source/video/ named after `file`
 *      (e.g. real-roadrunner.mov). Any common format works.
 *   2. Adjust that clip's settings below (trim, mirror, subject…).
 *   3. `npm run video:build` → regenerates every web file in public/video/intro/
 *      and marks the clip as final (no more "placeholder" label).
 * Until a master exists, the build uses a generated, clearly labelled
 * placeholder (`npm run video:placeholders` renders them from the owner's images).
 *
 * All positions are fractions (0–1) of the PROCESSED frame (after trim,
 * mirror and crop). Keep this file free of imports: Node runs it directly.
 */

export type ClipSlot = "real" | "cartoon" | "dust" | "bus";

/**
 * How a clip is layered over what's behind it:
 * - "normal": opaque footage (fills its layer).
 * - "screen": footage on BLACK (dust, smoke, sparks): black drops out, light adds.
 * - "alpha": footage with a transparent background (WebM VP9 alpha for
 *   Chrome/Firefox/Edge, HEVC-with-alpha .mov for Safari; both are built).
 */
export type ClipBlend = "normal" | "screen" | "alpha";

export type IntroClipConfig = {
  /** Base name: masters are assets/intro-source/video/<file>.*, web files public/video/intro/<file>*. */
  file: string;
  /** Human name (labels, docs). */
  label: string;

  // ── Processing (build.mjs) ─────────────────────────────────────────────
  /** Use only this part of the master (seconds). */
  trim?: { start?: number; end?: number };
  /** Flip horizontally so every clip runs the same way (left → right). */
  mirror?: boolean;
  /** Keep only this region of the master as you see it (fractions of the frame), e.g. to drop a watermark. Applied before `mirror`. */
  crop?: { x: number; y: number; w: number; h: number };
  /** Seamless loop: crossfade the clip's end into its start over this many seconds (0 = off). */
  loopCrossfade?: number;
  /**
   * The intro scrubs this clip with the scroll (the dust, the bus), so it's
   * encoded for instant seeking: ≤30 fps, a keyframe every 4 frames. Keep
   * such clips short.
   */
  seekable?: boolean;
  /** Green- (or blue-) screen master → transparent clip. Requires blend "alpha". */
  chromaKey?: { color: string; similarity: number; blend: number };
  /** Frame used as the still (reduced motion, returning visitors, final state): seconds, or "last". */
  poster: number | "last";

  // ── Playback (the intro) ───────────────────────────────────────────────
  blend: ClipBlend;
  loop: boolean;
  /** Seconds into the processed clip where playback starts. */
  startAt: number;
  /**
   * Framing when the screen's shape crops the clip (like CSS object-position):
   * which part of the frame to keep in view.
   */
  focus: { x: number; y: number };
  /**
   * The least of the frame's width that must stay visible (0–1). Portrait
   * phones would otherwise crop a wide subject (the bus) down to its middle:
   * above this the clip is shown as a feathered band instead of being cropped.
   */
  minVisible: number;
  /**
   * Where the subject is: x = body centre, y = where it touches the ground,
   * h = its height (all fractions of the frame). Used to line the scenes up:
   * the cartoon starts exactly over the real bird, the bus appears where the
   * roadrunner vanished into the dust.
   */
  subject: { x: number; y: number; h: number };
};

export const introClips = {
  /** Scene 1: the real roadrunner, already running when the page opens (loops, never stops). */
  real: {
    file: "real-roadrunner",
    label: "Real roadrunner running",
    poster: 0,
    loopCrossfade: 0,
    blend: "normal",
    loop: true,
    startAt: 0,
    focus: { x: 0.5, y: 0.6 },
    minVisible: 0.62,
    subject: { x: 0.5, y: 0.87, h: 0.244 },
  },
  /** Scene 2: the cartoon roadrunner running through the desert (the desert is in the footage; loops). */
  cartoon: {
    file: "cartoon-roadrunner",
    label: "Cartoon roadrunner desert run",
    poster: 1.5,
    loopCrossfade: 0,
    blend: "normal",
    loop: true,
    startAt: 0,
    focus: { x: 0.5, y: 0.62 },
    minVisible: 0.4,
    subject: { x: 0.5, y: 0.87, h: 0.39 },
  },
  /**
   * The cloud that hides the transformation. On black: layered with "screen".
   * It follows the scroll frame by frame (builds and clears in both directions).
   */
  dust: {
    file: "dust-transition",
    label: "Dust cloud transition",
    poster: 1.3,
    seekable: true,
    blend: "screen",
    loop: false,
    startAt: 0,
    focus: { x: 0.5, y: 0.6 },
    minVisible: 0,
    /** Cloud centre and size at its thickest. */
    subject: { x: 0.5, y: 0.72, h: 1 },
  },
  /**
   * Scene 3: the black party bus rolling out of the dust and coming to rest.
   * It follows the scroll (reversible), from just before the dust thins to
   * the moment the branding lands: trim it to end when the bus is at rest.
   */
  bus: {
    file: "party-bus",
    label: "Black party bus reveal",
    poster: "last",
    seekable: true,
    blend: "normal",
    loop: false,
    startAt: 0,
    focus: { x: 0.5, y: 0.62 },
    minVisible: 0.96,
    subject: { x: 0.5, y: 0.85, h: 0.49 },
  },
} satisfies Record<ClipSlot, IntroClipConfig>;

/** Clip timing the intro needs beyond the shared settings. */
export const introClipTiming = {
  /** Seconds into the dust clip where it covers the most: lined up with the hidden swap. */
  dustPeakAt: 1.3,
};

/** Web files live here (public/video/intro). */
export const INTRO_VIDEO_BASE = "/video/intro";
