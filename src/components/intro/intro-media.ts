import type { ClipSlot } from "@/content/intro-video";
import { CLIP_SLOTS, getClip, toRegion, variantsFor, type Clip, type DeviceProfile, type Variant } from "./intro-clips";

/**
 * Loads the intro's clips so playback can never stall, flash black or pop in
 * late: each clip's file is downloaded COMPLETELY (into memory, as a blob URL)
 * before the shot can start, then its decoder is primed and it's parked on
 * its first frame. Also frames each clip for this screen (see .intro-clip in
 * globals.css). No GSAP here: this runs before the engine is loaded.
 */

export type ClipState = {
  slot: ClipSlot;
  clip: Clip;
  /** The framed box (.intro-clip), the video in it, and its still frame. */
  box: HTMLElement | null;
  video: HTMLVideoElement | null;
  poster: HTMLImageElement | null;
  /** The file chosen for this device (null in still mode or if none can play). */
  variant: Variant | null;
  /** The file the box is currently framed for (its crop region decides where the subject is). */
  framed: Variant | null;
  candidates: Variant[];
  /** Downloaded, decoded and parked on its start frame: it will start instantly. */
  ready: boolean;
  /**
   * The browser refused to play it without a user gesture (iOS Low Power Mode,
   * Safari "Never Auto-Play", Firefox "Block Audio and Video"). It can still be
   * seeked (scrubbed clips work); looping clips show their still until a tap.
   */
  blocked: boolean;
};

/** Session cache: file URL → blob URL (Replay and remounts reuse the downloaded bytes). */
const blobs = new Map<string, Promise<string>>();

function deviceProfile(): DeviceProfile {
  const probe = document.createElement("video");
  const ua = navigator.userAgent;
  return {
    portraitPhone: window.matchMedia("(max-aspect-ratio: 4/5) and (max-width: 960px)").matches,
    canPlay: (type) => probe.canPlayType(type) !== "",
    // WebKit (Safari, and every browser on iOS): no WebM transparency, but HEVC-with-alpha works.
    safari: /AppleWebKit\//.test(ua) && !/(Chrome|Chromium|Edg|OPR)\//.test(ua),
  };
}

function waitFor(el: HTMLElement, event: string, ms: number) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      el.removeEventListener(event, ok);
      el.removeEventListener("error", bad);
    };
    const ok = () => (cleanup(), resolve());
    const bad = () => (cleanup(), reject(new Error(`${event}: media error`)));
    const timer = window.setTimeout(() => (cleanup(), reject(new Error(`${event}: timed out`))), ms);
    el.addEventListener(event, ok, { once: true });
    el.addEventListener("error", bad, { once: true });
  });
}

/** Download a file completely, reporting bytes (and the total, when the server sends it) as they arrive. */
function download(src: string, onBytes: (loaded: number, total: number) => void, signal: AbortSignal): Promise<string> {
  const cached = blobs.get(src);
  if (cached) return cached;
  const job = (async () => {
    const res = await fetch(src, { signal });
    if (!res.ok || !res.body) throw new Error(`${res.status} ${src}`);
    const total = Number(res.headers.get("content-length")) || 0;
    const reader = res.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onBytes(loaded, total);
    }
    return URL.createObjectURL(new Blob(chunks, { type: res.headers.get("content-type") ?? "video/mp4" }));
  })();
  blobs.set(src, job);
  job.catch(() => blobs.delete(src)); // a failed download may be retried (Replay)
  return job;
}

/**
 * Point the video at the downloaded file, make the browser decode real frames,
 * park on `startAt`. Returns false if the browser blocked playback without a
 * user gesture (the clip is still usable by seeking).
 */
async function prime(video: HTMLVideoElement, url: string, startAt: number) {
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = "auto";
  if (video.src !== url) {
    const meta = waitFor(video, "loadedmetadata", 10_000);
    video.src = url;
    await meta;
  }
  // A muted play() + pause() makes every browser (iOS included) decode frames now rather than
  // at the moment the clip is needed.
  let allowed = true;
  await video.play().catch((error: unknown) => {
    if (error instanceof DOMException && error.name === "NotAllowedError") allowed = false;
  });
  video.pause();
  const seeked = waitFor(video, "seeked", 5_000);
  video.currentTime = startAt;
  await seeked.catch(() => {});
  return allowed;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export class IntroMedia {
  readonly clips: Record<ClipSlot, ClipState>;

  constructor(
    root: HTMLElement,
    readonly still: boolean,
  ) {
    const device = deviceProfile();
    this.clips = Object.fromEntries(
      CLIP_SLOTS.map((slot) => {
        const clip = getClip(slot);
        const box = root.querySelector<HTMLElement>(`[data-clip-box="${slot}"]`);
        const state: ClipState = {
          slot,
          clip,
          box,
          video: box?.querySelector("video") ?? null,
          poster: box?.querySelector("img") ?? null,
          variant: null,
          framed: null,
          candidates: still ? [] : variantsFor(clip, device),
          ready: false,
          blocked: false,
        };
        // Frame for the file we're about to load, so layout is final before anything is measured.
        if (state.candidates[0]) this.frame(state, state.candidates[0]);
        return [slot, state];
      }),
    ) as Record<ClipSlot, ClipState>;
  }

  /** Framing for one file: its aspect ratio, and the clip's focus/minVisible mapped into its region. */
  private frame(state: ClipState, variant: Variant) {
    const { box, clip } = state;
    state.framed = variant;
    if (!box) return;
    const focus = toRegion(clip.focus, variant.region);
    box.style.setProperty("--aspect", String(variant.aspect));
    box.style.setProperty("--fx", String(clamp01(focus.x)));
    box.style.setProperty("--fy", String(clamp01(focus.y)));
    box.style.setProperty("--min-visible", String(Math.max(0.0001, Math.min(1, clip.minVisible / variant.region.w))));
  }

  /** Where the clip's subject is, as fractions of the file its box is framed for (its crop, if any). */
  subjectOf(slot: ClipSlot) {
    const s = this.clips[slot];
    const region = s.framed?.region ?? { x: 0, y: 0, w: 1, h: 1 };
    const p = toRegion(s.clip.subject, region);
    return { x: p.x, y: p.y, h: s.clip.subject.h / region.h };
  }

  /** Show a clip's still frame (still mode, or its video couldn't load). */
  async showPoster(slot: ClipSlot) {
    const img = this.clips[slot].poster;
    if (!img) return;
    if (!img.getAttribute("src") && img.dataset.src) img.src = img.dataset.src;
    await img.decode().catch(() => {});
  }

  /**
   * Load these clips in order (the first one needed first), reporting overall
   * progress 0–1. Resolves when all are ready or `timeoutMs` passes. Anything
   * not ready by then is cancelled and shows its still frame for this visit:
   * a clip never turns up late over a scene that's already on screen.
   */
  async load(slots: ClipSlot[], onProgress: (fraction: number) => void, timeoutMs: number) {
    if (this.still) {
      await Promise.all(slots.map((s) => this.showPoster(s)));
      onProgress(1);
      return;
    }
    const abort = new AbortController();
    let settled = false;
    const expected = slots.map((s) => this.expectedBytes(this.clips[s]));
    const total = expected.reduce((a, b) => a + b, 0) || 1;
    // Each clip's share of the bar only ever grows (a fallback file continues from where the last one got to).
    const share = slots.map(() => 0);
    const report = () => onProgress(Math.min(1, share.reduce((a, f, i) => a + f * (expected[i] ?? 0), 0) / total));
    const work = (async () => {
      for (const [i, slot] of slots.entries()) {
        const state = this.clips[slot];
        for (const variant of state.candidates) {
          if (settled) return;
          try {
            const url = await download(
              variant.src,
              (bytes, size) => {
                share[i] = Math.max(share[i] ?? 0, Math.min(0.95, bytes / (size || expected[i] || 1)));
                report();
              },
              abort.signal,
            );
            if (settled || !state.video) return;
            this.frame(state, variant);
            state.blocked = !(await prime(state.video, url, state.clip.startAt));
            if (settled) return;
            state.variant = variant;
            state.ready = true;
            break;
          } catch {
            // try the next file (e.g. the phone version is missing)
          }
        }
        share[i] = 1;
        report();
        if (!state.ready) await this.showPoster(slot);
      }
    })();
    let timer = 0;
    await Promise.race([work, new Promise<void>((resolve) => (timer = window.setTimeout(resolve, timeoutMs)))]);
    window.clearTimeout(timer);
    settled = true;
    abort.abort(); // cancel whatever is still downloading
    // Anything that missed the deadline shows its still (and stays a still for this visit).
    await Promise.all(
      slots
        .filter((s) => !this.clips[s].ready)
        .map((s) => {
          const state = this.clips[s];
          if (state.video?.getAttribute("src")) {
            state.video.removeAttribute("src"); // never cover the still with a half-primed first frame
            state.video.load();
          }
          if (state.candidates[0]) this.frame(state, state.candidates[0]);
          return this.showPoster(s);
        }),
    );
  }

  private expectedBytes(state: ClipState) {
    const file = state.candidates[0]?.src.split("/").pop();
    const kb = file ? (state.clip.manifest as { kb?: Record<string, number> } | null)?.kb?.[file] : undefined;
    return (kb ?? 1000) * 1024;
  }
}
