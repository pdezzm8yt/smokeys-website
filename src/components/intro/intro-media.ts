import type { FilmGlow, FilmStill } from "@/content/intro-video";
import { cutFor, filmUrl, framingVars, variantsFor, WIDE_SCREEN, type Cut, type DeviceProfile, type Variant } from "./intro-film";

/**
 * Loads the intro film so scrubbing can never stall, flash black or show a
 * half-loaded frame: the file for this screen is downloaded COMPLETELY (into
 * memory, as a blob URL) before the story can be scrolled, then its decoder
 * is primed and it's parked on its first frame. Also locks in the cut for
 * this screen (framing, stills, glows). No GSAP here: this runs before the
 * engine is loaded.
 */

/** Session cache: file URL → blob URL (remounts reuse the downloaded bytes). */
const blobs = new Map<string, Promise<string>>();

function deviceProfile(): DeviceProfile {
  const probe = document.createElement("video");
  return {
    small: window.matchMedia("(max-width: 960px) and (max-height: 960px)").matches,
    canPlay: (type) => probe.canPlayType(type) !== "",
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
  job.catch(() => blobs.delete(src)); // a failed download may be retried (remount)
  return job;
}

const visible = () => document.visibilityState !== "hidden";

/** Resolves once the page is visible (browsers hold back media loading and play() in background tabs). */
function whenVisible() {
  if (visible()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const onChange = () => {
      if (!visible()) return;
      document.removeEventListener("visibilitychange", onChange);
      resolve();
    };
    document.addEventListener("visibilitychange", onChange);
  });
}

/**
 * Resolves after `ms` of the page being VISIBLE (the clock stops in a
 * background tab, where the browser wouldn't let the film load anyway).
 * Returns a cancel function alongside.
 */
function visibleTimeout(ms: number) {
  let left = ms;
  let started = 0;
  let timer = 0;
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  const run = () => {
    started = performance.now();
    timer = window.setTimeout(finish, left);
  };
  const onChange = () => {
    if (visible()) {
      if (!timer) run();
    } else if (timer) {
      window.clearTimeout(timer);
      timer = 0;
      left = Math.max(0, left - (performance.now() - started));
    }
  };
  const cancel = () => {
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
  function finish() {
    cancel();
    resolve();
  }
  document.addEventListener("visibilitychange", onChange);
  if (visible()) run();
  return { done, cancel };
}

/**
 * Point the video at the downloaded file, make the browser decode real frames
 * (a muted play() + pause() does that on every browser, iOS included; if
 * autoplay is blocked that's fine: the film is only ever seeked), park it on
 * its first frame.
 */
async function prime(video: HTMLVideoElement, url: string) {
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = "auto";
  await whenVisible();
  if (video.src !== url) {
    const meta = waitFor(video, "loadedmetadata", 10_000);
    video.src = url;
    await meta;
  }
  // Optional warm-up: never wait on a play() the browser keeps pending (Firefox in a background tab).
  await Promise.race([video.play().catch(() => {}), new Promise((r) => window.setTimeout(r, 1000))]);
  video.pause();
  const seeked = waitFor(video, "seeked", 5_000);
  video.currentTime = 0;
  await seeked.catch(() => {});
}

export class FilmMedia {
  /** The cut for this screen (null only if no cut has been built at all). */
  readonly cut: Cut | null;
  readonly box: HTMLElement | null;
  readonly video: HTMLVideoElement | null;
  /** Downloaded, decoded and parked on its first frame: ready to scrub. */
  ready = false;
  private readonly root: HTMLElement;
  private readonly candidates: Variant[];
  /** Stops a load in progress (unmount, or the intro gave up). */
  private stop: (() => void) | null = null;

  constructor(
    root: HTMLElement,
    /** Reduced motion / Save-Data: stills only, nothing downloaded. */
    readonly still: boolean,
  ) {
    this.root = root;
    this.cut = cutFor(window.matchMedia(WIDE_SCREEN).matches);
    this.box = root.querySelector<HTMLElement>("[data-film-box]");
    this.video = this.box?.querySelector("video") ?? null;
    this.candidates = still || !this.cut ? [] : variantsFor(this.cut, deviceProfile());
    this.pin();
    this.band();
  }

  /**
   * A film narrower or shorter than the frame is shown as a band: mark it so
   * the edges that end on screen feather into the glow (globals.css). Run on
   * creation (the stills show before the engine exists) and by the engine
   * whenever it re-measures.
   */
  band() {
    const box = this.box;
    if (!box) return;
    const frameHeight = this.root.querySelector<HTMLElement>("[data-frame]")?.offsetHeight || this.root.clientHeight;
    const band = box.offsetHeight < frameHeight - 1 ? "y" : box.offsetWidth < this.root.clientWidth - 1 ? "x" : null;
    if (band) box.dataset.banded = band;
    else delete box.dataset.banded;
  }

  /**
   * Lock in this screen's cut: its framing, and its own stills and glows
   * (their <source>s go, so turning the phone later never swaps them under a
   * film that's already loaded). Layout is final before anything is measured.
   */
  private pin() {
    const cut = this.cut;
    if (!cut) return;
    if (this.box) for (const [k, v] of Object.entries(framingVars(cut))) this.box.style.setProperty(k, String(v));
    const pinTo = (picture: HTMLElement, file: string) => {
      const img = picture.querySelector("img");
      if (!img) return;
      const url = filmUrl(file);
      for (const source of picture.querySelectorAll("source")) source.remove();
      if (img.getAttribute("src") !== url) img.src = url;
    };
    for (const picture of this.root.querySelectorAll<HTMLElement>("[data-still]")) {
      const name = picture.dataset.still as FilmStill;
      pinTo(picture, cut.manifest.stills[name]);
    }
    for (const picture of this.root.querySelectorAll<HTMLElement>("[data-glow]")) {
      const name = picture.dataset.glow as FilmGlow;
      pinTo(picture, cut.manifest.glows[name]);
    }
  }

  /** Resolves once a still has been decoded (or failed): what's on screen before the film is in memory. */
  async stillReady(name: FilmStill = "start") {
    const img = this.root.querySelector<HTMLImageElement>(`[data-still="${name}"] img`);
    await img?.decode().catch(() => {});
  }

  /**
   * Download and prime the film, reporting progress 0–1. Resolves true when
   * it's ready, false if it can't be (still mode, nothing playable, cancel(),
   * or `timeoutMs` of the page being visible passed: the download is then
   * cancelled and the story is told with the stills instead).
   */
  async load(onProgress: (fraction: number) => void, timeoutMs: number) {
    const video = this.video;
    if (this.still || !video || !this.candidates.length) {
      onProgress(1);
      return false;
    }
    const abort = new AbortController();
    let settled = false;
    const timeout = visibleTimeout(timeoutMs);
    let stopped!: () => void;
    const stoppedEarly = new Promise<void>((r) => (stopped = r));
    this.stop = stopped;
    const expected = this.expectedBytes();
    // The bar only ever grows (a fallback file continues from where the last one got to).
    let shown = 0;
    const work = (async () => {
      for (const variant of this.candidates) {
        if (settled) return;
        try {
          const url = await download(
            variant.src,
            (bytes, size) => {
              shown = Math.max(shown, Math.min(0.95, bytes / (size || expected)));
              onProgress(shown);
            },
            abort.signal,
          );
          if (settled) return;
          await prime(video, url);
          if (settled) return;
          this.ready = true;
          video.dataset.ready = "";
          return;
        } catch {
          // try the next file (e.g. this browser can't decode it after all)
        }
      }
    })();
    await Promise.race([work, timeout.done, stoppedEarly]);
    timeout.cancel();
    this.stop = null;
    settled = true;
    abort.abort(); // cancel whatever is still downloading
    if (!this.ready && video.getAttribute("src")) {
      video.removeAttribute("src"); // never cover the stills with a half-primed frame
      video.load();
    }
    onProgress(1);
    return this.ready;
  }

  /** Stop a load in progress: it resolves false at once and cancels its download. */
  cancel() {
    this.stop?.();
  }

  /** Put the film back on its first frame (unmount). */
  reset() {
    const v = this.video;
    if (!v || !this.ready) return;
    v.pause();
    v.currentTime = 0;
  }

  private expectedBytes() {
    const file = this.candidates[0]?.src.split("/").pop();
    const kb = file ? this.cut?.manifest.kb[file] : undefined;
    return (kb ?? 3000) * 1024;
  }
}
