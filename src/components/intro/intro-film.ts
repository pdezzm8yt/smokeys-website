import manifestJson from "@/content/intro-video.generated.json";
import { INTRO_VIDEO_BASE, introFilm, type FilmCut, type FilmCutConfig, type FilmGlow, type FilmStill } from "@/content/intro-video";

/**
 * The intro film at runtime: the hand-written settings
 * (src/content/intro-video.ts) merged with what the build made
 * (src/content/intro-video.generated.json), plus picking the cut and the file
 * for this screen. No GSAP here: server components use it too.
 */

export type CutManifest = {
  width: number;
  height: number;
  duration: number;
  fps: number;
  files: { mp4: string; webm: string; small: string };
  small: { width: number; height: number };
  stills: Record<FilmStill, string>;
  glows: Record<FilmGlow, string>;
  kb: Record<string, number>;
};

export type Cut = FilmCutConfig & { name: FilmCut; manifest: CutManifest; aspect: number };

const manifest = manifestJson as Partial<Record<FilmCut, CutManifest>>;

/** The cuts that have been built. */
const CUTS: Cut[] = (["portrait", "wide"] as const).flatMap((name) => {
  const m = manifest[name];
  return m ? [{ ...introFilm.cuts[name], name, manifest: m, aspect: m.width / m.height }] : [];
});

/** True while the footage isn't final (the UI labels it). */
export const hasPlaceholderFootage = introFilm.placeholder;

export const filmUrl = (file: string) => `${INTRO_VIDEO_BASE}/${file}`;

/** Screens at least as wide as they are tall get the wide cut (the stills' <source> media query says the same). */
export const WIDE_SCREEN = "(min-aspect-ratio: 1/1)";

/** The cut for a wide or a tall screen; while one cut has no master, the other stands in. */
export function cutFor(wide: boolean): Cut | null {
  return CUTS.find((c) => (c.name === "wide") === wide) ?? CUTS[0] ?? null;
}

/** One playable file of a cut. */
export type Variant = { src: string; type: string };

export type DeviceProfile = {
  /** Phone-sized screen: take the lighter file. */
  small: boolean;
  canPlay: (type: string) => boolean;
};

const TYPES = {
  mp4: 'video/mp4; codecs="avc1.640028"',
  webm: 'video/webm; codecs="vp9"',
};

/** Files to try, best first: H.264 (hardware decoded everywhere: the smoothest scrubbing), then VP9. */
export function variantsFor(cut: Cut, device: DeviceProfile): Variant[] {
  const { files } = cut.manifest;
  const out: Variant[] = [];
  if (device.canPlay(TYPES.mp4)) {
    if (device.small) out.push({ src: filmUrl(files.small), type: TYPES.mp4 });
    out.push({ src: filmUrl(files.mp4), type: TYPES.mp4 });
  }
  if (device.canPlay(TYPES.webm)) out.push({ src: filmUrl(files.webm), type: TYPES.webm });
  return out;
}

/**
 * The band rule (FilmMedia.band) as media queries, for pages where no script
 * runs (no JS): a film that can't cover the frame within its minVisible gets
 * its feathered edges from CSS alone. From .intro-film's sizing, a film is
 * pillarboxed on screens wider than aspect / minVisible.y and letterboxed on
 * screens narrower than aspect × minVisible.x (judged on the viewport, so
 * approximate under a phone's toolbar).
 */
export function noScriptBandCss() {
  const tallCut = cutFor(false);
  const wideCut = cutFor(true);
  if (!tallCut || !wideCut) return "";
  const ratio = (x: number) => `${Math.max(1, Math.round(x * 1000))}/1000`;
  const mask = (dir: "right" | "bottom", edge: number) =>
    `.intro-film{mask-image:linear-gradient(to ${dir},transparent,#000 ${edge}%,#000 ${100 - edge}%,transparent)}`;
  const rules = (cut: Cut, range: string) => [
    `@media ${range}(min-aspect-ratio: ${ratio(cut.aspect / cut.minVisible.y)}){${mask("right", 7)}}`,
    `@media ${range}(max-aspect-ratio: ${ratio(cut.aspect * cut.minVisible.x)}){${mask("bottom", 9)}}`,
  ];
  return tallCut === wideCut
    ? rules(tallCut, "").join("")
    : [...rules(tallCut, "(max-aspect-ratio: 999/1000) and "), ...rules(wideCut, `${WIDE_SCREEN} and `)].join("");
}

/** A cut's framing as the CSS variables .intro-film reads (see globals.css). */
export function framingVars(cut: Cut, prefix = "") {
  return {
    [`--${prefix}aspect`]: cut.aspect,
    [`--${prefix}fx`]: cut.focus.x,
    [`--${prefix}fy`]: cut.focus.y,
    [`--${prefix}min-visible`]: Math.max(0.0001, cut.minVisible.x),
    [`--${prefix}min-visible-y`]: Math.max(0.0001, cut.minVisible.y),
  };
}
