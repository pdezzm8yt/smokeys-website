import { SKY_KEYS, type SkyKey } from "@/content/sky";

/**
 * Sky colours along the day → night line (0 = day, 1 = night), mixed in
 * OKLab between the keyframes in src/content/sky.ts (perceptual: the
 * in-between shades stay natural instead of going grey). No DOM here.
 */

type Lab = [number, number, number];
type Rgb = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function rgbToLab([r, g, b]: Rgb): Lab {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function labToRgb([L, a, b]: Lab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    clamp01(toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clamp01(toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clamp01(toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ];
}

const LABS = SKY_KEYS.map((k) => ({
  at: k.at,
  top: rgbToLab(hexToRgb(k.top)),
  mid: rgbToLab(hexToRgb(k.mid)),
  horizon: rgbToLab(hexToRgb(k.horizon)),
  cloudLit: rgbToLab(hexToRgb(k.cloudLit)),
  cloudShade: rgbToLab(hexToRgb(k.cloudShade)),
  light: rgbToLab(hexToRgb(k.light)),
  cloudOpacity: k.cloudOpacity,
}));

export type SkyColors = {
  top: Rgb;
  mid: Rgb;
  horizon: Rgb;
  cloudLit: Rgb;
  cloudShade: Rgb;
  light: Rgb;
  cloudOpacity: number;
};

const mixLab = (a: Lab, b: Lab, t: number): Lab => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The sky's colours at `phase` (0 = day, 1 = night). */
export function skyColors(phase: number): SkyColors {
  const p = clamp01(phase);
  let i = 1;
  while (i < LABS.length - 1 && (LABS[i]?.at ?? 1) < p) i++;
  const a = LABS[i - 1] ?? LABS[0]!;
  const b = LABS[i] ?? a;
  const t = b.at > a.at ? clamp01((p - a.at) / (b.at - a.at)) : 0;
  return {
    top: labToRgb(mixLab(a.top, b.top, t)),
    mid: labToRgb(mixLab(a.mid, b.mid, t)),
    horizon: labToRgb(mixLab(a.horizon, b.horizon, t)),
    cloudLit: labToRgb(mixLab(a.cloudLit, b.cloudLit, t)),
    cloudShade: labToRgb(mixLab(a.cloudShade, b.cloudShade, t)),
    light: labToRgb(mixLab(a.light, b.light, t)),
    cloudOpacity: a.cloudOpacity + (b.cloudOpacity - a.cloudOpacity) * t,
  };
}

/** "rgb(r g b)" for CSS. */
export const css = ([r, g, b]: Rgb) => `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;

export type { SkyKey };
