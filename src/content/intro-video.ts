/**
 * The intro film: ONE continuous shot (the roadrunner runs into a tunnel, the
 * dust swallows him, the black party bus drives out of it), scrubbed by the
 * scroll. This is the ONE place that says how its masters are processed
 * (scripts/intro-video/build.mjs reads this file) and how the intro uses them
 * (story beats, framing).
 *
 * Two cuts of the same shot, each built from its own master:
 *   - portrait (9:16): phones and other tall screens;
 *   - wide (16:9): desktops, tablets on their side, phones in landscape.
 * Each screen gets the cut closest to its shape. While a cut has no master,
 * the other stands in (a wide screen shows the portrait cut as a feathered
 * strip over a soft glow of the same scene).
 *
 * Replacing footage (see assets/intro-source/video/README.md):
 *   1. Put the master in assets/intro-source/video/ named after the cut's
 *      `file` (e.g. film-wide.mp4). Any common format works.
 *   2. Set that cut's `beats` (and trim/crop if needed): `npm run video:inspect`
 *      makes a contact sheet to read them from.
 *   3. `npm run video:build` → regenerates its web files in public/video/intro/.
 *
 * Times are seconds into the PROCESSED cut (after trim). Positions are
 * fractions (0–1) of its frame. Keep this file free of imports: Node runs it.
 */

export type FilmCut = "portrait" | "wide";

/** Moments in the film the intro is built around (seconds into the processed cut, in this order). */
export type FilmBeats = {
  /** The roadrunner runs into the tunnel: the light starts to go. */
  tunnel: number;
  /** The dust has swallowed him: nothing of him is left. */
  swallowed: number;
  /** The thickest dust: nothing at all is visible (where the roadrunner becomes the bus). */
  cover: number;
  /** The bus's headlights cut through the dust. */
  headlights: number;
  /**
   * Where the film comes to rest under the headline and the buttons: the bus
   * fully in frame. Also the still of the finished hero (no JS, Skip, return visits).
   */
  rest: number;
};

export type FilmCutConfig = {
  /** Base name: the master is assets/intro-source/video/<file>.*, web files public/video/intro/<file>*. */
  file: string;
  /** Use only this part of the master (seconds). Ending just after `rest` keeps the download small. */
  trim?: { start?: number; end?: number };
  /** Keep only this region of the master as you see it (fractions of the frame), e.g. to drop a watermark. Applied before `mirror`. */
  crop?: { x: number; y: number; w: number; h: number };
  /** Flip horizontally. */
  mirror?: boolean;
  beats: FilmBeats;
  /** Framing when the screen's shape crops the film (like CSS object-position): which part stays in view. */
  focus: { x: number; y: number };
  /**
   * The least of the frame's width / height that must stay visible (0–1).
   * Past either, the film is shown as a feathered band (over the scene's glow)
   * instead of being cropped further.
   */
  minVisible: { x: number; y: number };
};

export const introFilm = {
  label: "Roadrunner to party bus",
  /**
   * The footage isn't final: the bus in it is a generic coach, not Smokey's
   * bus. Keeps the "Placeholder footage" tag on screen; set to false once a
   * render with the real bus replaces it.
   */
  placeholder: true,
  cuts: {
    portrait: {
      file: "film-portrait",
      trim: { end: 11.65 },
      beats: { tunnel: 4.6, swallowed: 7.7, cover: 7.95, headlights: 8.3, rest: 11.5 },
      focus: { x: 0.5, y: 0.5 },
      minVisible: { x: 0.75, y: 0.82 },
    },
    wide: {
      file: "film-wide",
      // Placeholders until the 16:9 render exists: set them from its contact sheet.
      beats: { tunnel: 4.6, swallowed: 7.7, cover: 7.95, headlights: 8.3, rest: 11.5 },
      focus: { x: 0.5, y: 0.55 },
      minVisible: { x: 0.62, y: 0.7 },
    },
  },
} satisfies { label: string; placeholder: boolean; cuts: Record<FilmCut, FilmCutConfig> };

/** The stills the build makes from each cut (reduced motion, no JS, before the film is in memory). */
export const FILM_STILLS = ["start", "cover", "rest"] as const;
export type FilmStill = (typeof FILM_STILLS)[number];

/** The soft glow behind a film shown as a band: one per stretch of the story, crossfaded with it. */
export const FILM_GLOWS = ["start", "tunnel", "cover", "headlights", "rest"] as const;
export type FilmGlow = (typeof FILM_GLOWS)[number];

/** When each still and glow is taken (seconds into the processed cut). */
export function frameTimes(beats: FilmBeats): Record<FilmStill | FilmGlow, number> {
  return {
    start: 0,
    tunnel: (beats.tunnel + beats.swallowed) / 2,
    cover: beats.cover,
    headlights: beats.headlights + (beats.rest - beats.headlights) * 0.2,
    rest: beats.rest,
  };
}

/** Web files live here (public/video/intro). */
export const INTRO_VIDEO_BASE = "/video/intro";
