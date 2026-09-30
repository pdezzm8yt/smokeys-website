import manifestJson from "@/content/intro-video.generated.json";
import { INTRO_VIDEO_BASE, introClips, type ClipSlot, type IntroClipConfig } from "@/content/intro-video";

/**
 * The intro's clips at runtime: the hand-written settings
 * (src/content/intro-video.ts) merged with what the build measured
 * (src/content/intro-video.generated.json), plus picking the right file for
 * this device. No GSAP here: server components use it too.
 */

/** A region of the full frame, as fractions (the phone version is a crop). */
export type Region = { x: number; y: number; w: number; h: number };

export type ClipManifest = {
  placeholder: boolean;
  width: number;
  height: number;
  duration: number;
  fps: number;
  alpha: boolean;
  files: { mp4?: string; webm?: string; mov?: string };
  mobile: { file: string; width: number; height: number; crop: Region } | null;
  poster: { file: string; at: number };
  backdrop: { top: string; bottom: string } | null;
};

export type Clip = IntroClipConfig & { slot: ClipSlot; manifest: ClipManifest | null };

const manifest = manifestJson as Partial<Record<ClipSlot, ClipManifest>>;

export const CLIP_SLOTS: ClipSlot[] = ["real", "cartoon", "dust", "bus"];

export function getClip(slot: ClipSlot): Clip {
  return { ...introClips[slot], slot, manifest: manifest[slot] ?? null };
}

export const clipUrl = (file: string) => `${INTRO_VIDEO_BASE}/${file}`;

/** True while any clip is still a generated placeholder (the UI labels it). */
export const hasPlaceholderFootage = CLIP_SLOTS.some((slot) => manifest[slot]?.placeholder !== false);

export const FULL_FRAME: Region = { x: 0, y: 0, w: 1, h: 1 };

/** One playable file: where it is, its type, and which part of the full frame it shows. */
export type Variant = { src: string; type: string; region: Region; aspect: number };

export type DeviceProfile = {
  /** Portrait phone: take the lighter phone crop. */
  portraitPhone: boolean;
  canPlay: (type: string) => boolean;
  /** Safari can't show WebM transparency but can show HEVC-with-alpha. */
  safari: boolean;
};

const TYPES = {
  mp4: 'video/mp4; codecs="avc1.640028"',
  webm: 'video/webm; codecs="vp9"',
  hevcAlpha: 'video/mp4; codecs="hvc1"',
};

/**
 * Files to try for a clip, best first. Opaque clips: H.264 first (hardware
 * decoded everywhere, the smoothest playback), VP9 as the alternative.
 * Transparent clips: HEVC-alpha for Safari, VP9-alpha for everyone else.
 */
export function variantsFor(clip: Clip, device: DeviceProfile): Variant[] {
  const m = clip.manifest;
  if (!m) return [];
  const full = (file: string, type: string): Variant => ({ src: clipUrl(file), type, region: FULL_FRAME, aspect: m.width / m.height });
  const out: Variant[] = [];
  if (m.alpha) {
    if (device.safari && m.files.mov && device.canPlay(TYPES.hevcAlpha)) out.push(full(m.files.mov, TYPES.hevcAlpha));
    else if (!device.safari && m.files.webm && device.canPlay(TYPES.webm)) out.push(full(m.files.webm, TYPES.webm));
    return out;
  }
  if (device.portraitPhone && m.mobile && device.canPlay(TYPES.mp4)) {
    out.push({ src: clipUrl(m.mobile.file), type: TYPES.mp4, region: m.mobile.crop, aspect: m.mobile.width / m.mobile.height });
  }
  if (m.files.mp4 && device.canPlay(TYPES.mp4)) out.push(full(m.files.mp4, TYPES.mp4));
  if (m.files.webm && device.canPlay(TYPES.webm)) out.push(full(m.files.webm, TYPES.webm));
  return out;
}

/** A point given as fractions of the full frame → fractions of a variant's region. */
export function toRegion(p: { x: number; y: number }, r: Region) {
  return { x: (p.x - r.x) / r.w, y: (p.y - r.y) / r.h };
}
