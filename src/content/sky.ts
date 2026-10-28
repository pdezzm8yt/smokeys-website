/**
 * The living sky behind the site (src/components/sky): its colours through a
 * day → night change, and its tunables. The sky follows ONE number, `phase`:
 * 0 = day, 1 = night. Going to night it passes through sunset and twilight;
 * coming back the same colours read as twilight → sunrise → morning.
 *
 * Colours are interpolated in OKLab between these keyframes, so the in-between
 * shades stay natural (no muddy greys).
 */

export type Period = "day" | "night";

export type SkyKey = {
  /** Where on the day → night line this key sits (0–1). */
  at: number;
  /** Sky gradient, top of the screen → horizon. */
  top: string;
  mid: string;
  horizon: string;
  /** Clouds: the side facing the light, and the shaded side. */
  cloudLit: string;
  cloudShade: string;
  /** How dense the clouds look (0–1). */
  cloudOpacity: number;
  /** Warm light over the bus and the scene (sunlight, then sunset glow). */
  light: string;
};

export const SKY_KEYS: SkyKey[] = [
  { at: 0, top: "#2f74d0", mid: "#62a0e6", horizon: "#b8daf6", cloudLit: "#ffffff", cloudShade: "#b9c8da", cloudOpacity: 0.95, light: "#fff6df" },
  { at: 0.4, top: "#3b4f93", mid: "#c7708a", horizon: "#f7b26a", cloudLit: "#ffd9b0", cloudShade: "#8a5a78", cloudOpacity: 0.9, light: "#ffb36b" },
  { at: 0.7, top: "#141f4d", mid: "#2f2f69", horizon: "#6b4f86", cloudLit: "#8a7fb0", cloudShade: "#2a2850", cloudOpacity: 0.7, light: "#7a6fb0" },
  { at: 1, top: "#040a26", mid: "#0a1a45", horizon: "#16305e", cloudLit: "#5d6f97", cloudShade: "#1b2546", cloudOpacity: 0.5, light: "#9fb6ff" },
];

export const SKY = {
  /** A full day ↔ night change, ms (reduced motion: a short crossfade). */
  transitionMs: 5200,
  reducedTransitionMs: 600,
  /** Where the sun and moon sit (fractions of the screen) in full day / full night. */
  sun: { day: { x: 0.8, y: 0.15 }, set: { x: 0.72, y: 0.82 } },
  moon: { night: { x: 0.2, y: 0.17 }, low: { x: 0.24, y: 0.42 } },
  /** Stars on a large screen / a phone (they fade in from twilight). */
  stars: { desktop: 420, phone: 200 },
  /** Seconds between shooting stars at night: a random pause in this range, so they stay rare. */
  shootingStarEvery: [9, 22] as [number, number],
  /** The clouds are rendered at this fraction of the screen's CSS pixels (they're soft), and capped. */
  cloudScale: { desktop: 0.5, phone: 0.35, low: 0.28 },
  /** Frames per second while nothing moves but the drift; full rate while scrolling or changing. */
  idleFps: 30,
} as const;

/** Day between 6:00 and 18:59 local time: the sky a first visit starts with (no preference chosen yet). */
export function periodForHour(hour: number): Period {
  return hour >= 6 && hour < 19 ? "day" : "night";
}
