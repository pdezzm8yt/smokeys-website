import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { introClipTiming, type ClipSlot } from "@/content/intro-video";
import { INTRO } from "./intro-config";
import type { IntroMedia } from "./intro-media";

gsap.registerPlugin(ScrollTrigger);
// Phones: the address bar showing/hiding must not re-measure (and jolt) the scene.
ScrollTrigger.config({ ignoreMobileResize: true });

/**
 * The intro's animation engine: ONE GSAP master timeline, scrubbed by scroll.
 *
 *   real clip running → (scroll) camera pushes in, the world speeds up → the
 *   cartoon clip (already running) fades in over the real bird, lined up with
 *   it → the cartoon runs, dust gathers at his feet → the dust clip grows over
 *   him → under full cover the bus takes his place → the dust clears, the bus
 *   drives out of it, the camera settles → branding → CTAs → the stage unpins
 *   and the page scrolls on.
 *
 * The stage is pinned with CSS `position: sticky` inside a tall section; one
 * ScrollTrigger maps that section's scroll progress onto the master timeline
 * (with a little scrub smoothing), so scrolling back up plays it all in
 * reverse: bus → dust → cartoon → real.
 *
 * The VIDEOS provide the subjects' movement. The running clips loop and never
 * stop (the screen is never static); their playback rate follows world speed,
 * which rises with scroll progress and with how fast you scroll. The dust clip
 * is scrubbed frame-accurately with the scroll (it builds and clears both
 * ways); the bus clip plays from just before it's revealed. All of that is
 * decided in one idempotent `sync()` from the timeline's current time, so any
 * scroll jump, in either direction, lands in the right state.
 *
 * Timeline animations are created inside one gsap.context, so `destroy()`
 * reverts every style they wrote; per-frame writers (loops, dust puffs) and the
 * clips are reset explicitly. This module (and GSAP) is loaded on demand.
 */

export type IntroOptions = {
  /** Reduced motion (or Save-Data): stills and calm crossfades, no clips, no loops. */
  still: boolean;
};

type Scene = "real" | "cartoon";
type Loop = { scene: Scene; anim: gsap.core.Animation; max: number };
type EmitterConfig = { interval: number; life: number; travelX: number; travelY: number; grow: number; peak: number };
/** A camera transform (transform-origin 0 0). */
type Pose = { x: number; y: number; scale: number };
/** A subject on the stage, in px: where its feet are, and how tall it is. */
type Spot = { x: number; y: number; h: number };

const T = INTRO.timeline;
const S = INTRO.speed;
const V = INTRO.video;
const SCENES: Scene[] = ["real", "cartoon"];
const SLOTS: ClipSlot[] = ["real", "cartoon", "dust", "bus"];
const IDENTITY: Pose = { x: 0, y: 0, scale: 1 };

/** The story's beats, in timeline units (the whole timeline = the intro's scroll length). They overlap. */
const B = (() => {
  const morph = T.morph;
  const run = morph + T.morphLength;
  const storm = run + T.run;
  const swap = storm + T.dustBuild;
  const clear = swap + T.hold;
  const brand = clear + T.brandAfterClear;
  const ctas = brand + T.ctaAfterBrand;
  return {
    morph,
    run,
    /** The real clip is fully faded out (and can stop decoding). */
    realGone: morph + T.morphLength * 1.4 + 0.05,
    feetDust: run + T.feetDustAt,
    /** The dust clip starts while he's still running; its thickest frame lands on the swap. */
    dustStart: storm - T.dustLead,
    storm,
    swap,
    clear,
    dustEnd: clear + T.clear,
    /** The bus clip starts just before the dust thins, so it's already driving when revealed. */
    busStart: clear - T.busLead,
    brand,
    ctas,
    end: ctas + T.ctaLength + T.dwell,
  };
})();

const EMITTERS: Record<Scene, { cfg: EmitterConfig; seed: number }> = {
  real: { cfg: { interval: 0.2, life: 0.8, travelX: 260, travelY: 55, grow: 1, peak: 0.75 }, seed: 7 },
  cartoon: { cfg: { interval: 0.12, life: 0.55, travelX: 190, travelY: 55, grow: 0.8, peak: 0.6 }, seed: 23 },
};

/** Emits dust sprites from behind the runner's feet; rate and size follow the world. */
class DustEmitter {
  private next = 0;
  private seed: number;
  private call: gsap.core.Tween | null = null;

  constructor(
    private readonly particles: HTMLElement[],
    private readonly world: { speed: number; dust: number },
    private readonly cfg: EmitterConfig,
    seed: number,
  ) {
    this.seed = seed;
  }

  /** Deterministic pseudo-random (same run every time, no Math.random). */
  private rand() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** Longest life a puff can have right now (it grows as the storm gathers). */
  private maxLife() {
    return this.cfg.life * (1 + this.world.dust * 0.9) * 1.2;
  }

  private emit() {
    const p = this.particles[this.next++ % this.particles.length];
    if (!p) return;
    const d = this.world.dust; // 0 → 1 as the storm gathers: bigger, denser, longer-lived puffs
    const r1 = this.rand();
    const r2 = this.rand();
    const life = (this.maxLife() / 1.2) * (0.8 + r1 * 0.4);
    gsap.killTweensOf(p);
    gsap.set(p, { xPercent: -50, yPercent: -50, scale: 0.3 + d * 0.6, rotation: r2 * 120, opacity: 0 });
    gsap.to(p, {
      xPercent: -50 - this.cfg.travelX * (0.7 + r2 * 0.6) * (1 + d * 0.5),
      yPercent: -50 - this.cfg.travelY * (0.6 + r1 * 0.8) * (1 + d * 1.4),
      scale: (1.1 + r2 * 0.8) * this.cfg.grow * (1 + d * 1.8),
      rotation: `+=${40 + r1 * 60}`,
      duration: life,
      ease: "power2.out",
    });
    gsap.to(p, { keyframes: { opacity: [0, Math.min(1, this.cfg.peak * (1 + d * 0.5)), 0] }, duration: life, ease: "none" });
  }

  start() {
    const tick = () => {
      this.emit();
      const rate = Math.max(0.35, this.world.speed * (1 + this.world.dust * 2.5));
      // Never outrun the pool: a puff is reused only once it has finished its life.
      const poolFloor = this.maxLife() / this.particles.length;
      this.call = gsap.delayedCall(Math.max(this.cfg.interval / rate, poolFloor), tick);
    };
    tick();
  }

  stop() {
    this.call?.kill();
    this.call = null;
    gsap.killTweensOf(this.particles);
    gsap.set(this.particles, { clearProps: "transform,opacity" });
  }
}

/** Piecewise-linear map from timeline time to clip time: [[timelineT, clipT], …]. */
function mapTime(points: [number, number][], t: number) {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return 0;
  if (t <= first[0]) return first[1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [t1, c1] = points[i] as [number, number];
    const [t0, c0] = points[i - 1] as [number, number];
    if (t <= t1) return c0 + ((t - t0) / (t1 - t0)) * (c1 - c0);
  }
  return last[1];
}

export class IntroEngine {
  private readonly ctx: gsap.Context;
  private readonly q: (selector: string) => HTMLElement[];
  /** World speed from the timeline (scroll progress), plus a boost from how fast you're scrolling. */
  private readonly world = { speed: S.idle as number, dust: 0 };
  private readonly boost = { v: 0 };
  private boostTo: ((value: number) => void) | null = null;
  private loops: Loop[] = [];
  private running = new Set<Scene>();
  private emitters = new Map<Scene, DustEmitter>();
  private particles = new Map<Scene, HTMLElement[]>();
  private master: gsap.core.Timeline | null = null;
  private trigger: ScrollTrigger | null = null;
  /** Eases the scroll boost back to 0 shortly after scrolling stops (restarted on every scroll update). */
  private boostReset: gsap.core.Tween | null = null;
  /** Frame-accurate scrubbing without a seek backlog: one seek in flight, the latest target queued. */
  private seeks = new Map<HTMLVideoElement, { busy: boolean; want: number; onSeeked: () => void }>();
  private revealed: boolean | null = null;
  /**
   * ScrollTrigger reverts the timeline to 0 while it re-measures (resize,
   * rotation, a refresh) and then restores it silently: sync() must ignore
   * that revert and run once the refresh is done.
   */
  private refreshing = false;
  private destroyed = false;
  /** A refresh waiting for the page to stop scrolling. */
  private pendingRefresh: (() => void) | null = null;
  private readonly onVisibility = () => this.sync();
  /** Autoplay blocked (iOS Low Power Mode, "Never Auto-Play"): the first tap or key press unlocks the clips. */
  private readonly onActivation = () => this.unblock();

  constructor(
    /** The tall scrolling section (its scroll range drives the timeline). */
    private readonly section: HTMLElement,
    /** The pinned stage inside it. */
    private readonly stage: HTMLElement,
    private readonly media: IntroMedia,
    private readonly opts: IntroOptions,
  ) {
    this.q = gsap.utils.selector(stage) as (selector: string) => HTMLElement[];
    this.ctx = gsap.context(() => {}, stage);
  }

  // ---------------------------------------------------------------------------
  // Layout: where each subject is on this screen (measured, never guessed)
  // ---------------------------------------------------------------------------

  private get width() {
    return this.stage.clientWidth;
  }
  /** The stage's full height (on phones it's the large viewport, so the film fills the screen once the toolbar hides). */
  private get height() {
    return this.stage.clientHeight;
  }
  /** The height the clips are framed in (the small viewport: never under the browser's toolbar). */
  private get frameHeight() {
    return this.q("[data-frame]")[0]?.offsetHeight || this.height;
  }

  /** A clip's subject on the stage, before any camera move (from its framed box). */
  private spot(slot: ClipSlot): Spot {
    const box = this.media.clips[slot].box;
    if (!box || !box.offsetWidth) return { x: this.width / 2, y: this.frameHeight * 0.85, h: this.frameHeight * 0.3 };
    const s = this.media.subjectOf(slot);
    return { x: box.offsetLeft + s.x * box.offsetWidth, y: box.offsetTop + s.y * box.offsetHeight, h: s.h * box.offsetHeight };
  }

  /** Put the feet-dust boxes under each runner; mark clips shown as a band (feathered edges). */
  private layout() {
    for (const scene of SCENES) {
      const box = this.q(`[data-subject-box="${scene}"]`)[0];
      if (!box) continue;
      const s = this.spot(scene);
      const w = s.h * 1.3;
      Object.assign(box.style, { left: `${s.x - w / 2}px`, top: `${s.y - s.h}px`, width: `${w}px`, height: `${s.h}px` });
    }
    // A clip narrower or shorter than the frame is shown as a band: feather the edges that end on screen.
    for (const slot of SLOTS) {
      const box = this.media.clips[slot].box;
      if (!box) continue;
      const band = box.offsetHeight < this.frameHeight - 1 ? "y" : box.offsetWidth < this.width - 1 ? "x" : null;
      if (band) box.dataset.banded = band;
      else delete box.dataset.banded;
    }
  }

  /** Scale the camera by `s` around a stage point: that point stays put. */
  private around(p: { x: number; y: number }, s: number): Pose {
    return { x: p.x * (1 - s), y: p.y * (1 - s), scale: s };
  }

  /**
   * A camera pose for a layer (`slot`) that puts its subject (`from`) where
   * another subject is on screen (`to`), as big and on the same ground line.
   * A clip that covers the stage can only grow (and must keep covering it); a
   * banded clip sits on its scene's backdrop, so it may also shrink and move freely.
   */
  private align(to: Spot, from: Spot, slot: ClipSlot, maxScale = 1.8): Pose {
    const banded = Boolean(this.media.clips[slot].box?.dataset.banded);
    const s = gsap.utils.clamp(banded ? 0.6 : 1.04, maxScale, to.h / Math.max(1, from.h));
    const x = to.x - s * from.x;
    const y = to.y - s * from.y;
    if (banded) return { x, y, scale: s };
    return { x: gsap.utils.clamp(this.width * (1 - s), 0, x), y: gsap.utils.clamp(this.height * (1 - s), 0, y), scale: s };
  }

  /**
   * How far the camera pushes into the real bird: at least T.push, more when
   * the cartoon bird is bigger on screen, so the two meet at the same size.
   */
  private realPush() {
    return gsap.utils.clamp(T.push, 1.6, this.spot("cartoon").h / Math.max(1, this.spot("real").h));
  }

  /** Where the dust gathers: around the cartoon bird's body. */
  private dustCentre() {
    const c = this.spot("cartoon");
    return { x: c.x, y: c.y - c.h * 0.4 };
  }

  /** The dust clip scaled by `s` with its cloud centred on the runner. */
  private dustPose(s: number): Pose {
    const d = this.spot("dust");
    const c = this.dustCentre();
    return { x: c.x - s * d.x, y: c.y - s * d.y, scale: s };
  }

  /**
   * Tween vars for a pose, as functions: they're re-measured whenever
   * ScrollTrigger refreshes (resize, rotation), so the scenes stay lined up.
   */
  private pose(fn: () => Pose) {
    return { x: () => fn().x, y: () => fn().y, scale: () => fn().scale };
  }

  // ---------------------------------------------------------------------------
  // Clips
  // ---------------------------------------------------------------------------

  private video(slot: ClipSlot) {
    const c = this.media.clips[slot];
    return !this.opts.still && c.ready ? c.video : null;
  }

  /** A looping clip that can actually play (not blocked from autoplay): otherwise its still shows. */
  private runnable(slot: ClipSlot) {
    return this.media.clips[slot].blocked ? null : this.video(slot);
  }

  /** Playback rate for the running clips: world speed (+ scroll boost), mapped and capped. */
  private rate() {
    return Math.min(V.maxRate, 1 + (this.speed() - 1) * V.speedGain);
  }

  private speed() {
    return this.world.speed + this.boost.v * S.scrollBoost;
  }

  /** A looping clip: running while its scene is on screen, paused (not decoding) otherwise. */
  private loopClip(slot: ClipSlot, on: boolean) {
    const v = this.runnable(slot);
    if (!v) return;
    if (on && v.paused && !document.hidden) {
      v.playbackRate = this.rate();
      void v.play().catch(() => {});
    } else if (!on && !v.paused) v.pause();
  }

  /**
   * Seek without piling up: one seek in flight; when it lands, jump to the
   * newest target. Targets are clamped to the clip, so a timing setting longer
   * than the footage can never make it re-seek forever.
   */
  private seek(v: HTMLVideoElement, time: number) {
    const end = Number.isFinite(v.duration) ? Math.max(0, v.duration - 0.05) : time;
    const want = Math.min(Math.max(0, time), end);
    let s = this.seeks.get(v);
    if (!s) {
      const state = {
        busy: false,
        want,
        onSeeked: () => {
          state.busy = false;
          if (Math.abs(v.currentTime - state.want) > 0.02) this.seek(v, state.want);
        },
      };
      v.addEventListener("seeked", state.onSeeked);
      this.seeks.set(v, state);
      s = state;
    }
    s.want = want;
    if (s.busy || Math.abs(v.currentTime - want) < 0.02) return;
    s.busy = true;
    v.currentTime = want;
  }

  /** A clip that follows the scroll frame by frame, through [[timeline time, clip time], …]. */
  private scrub(slot: ClipSlot, t: number, points: (duration: number) => [number, number][]) {
    const v = this.video(slot);
    if (!v) return;
    if (!v.paused) v.pause();
    this.seek(v, mapTime(points(Number.isFinite(v.duration) ? v.duration : 0), t));
  }

  /** Autoplay was blocked: show the running clips' stills until a tap or key press unlocks them. */
  private watchBlocked() {
    const blocked = SCENES.filter((slot) => this.media.clips[slot].blocked && this.video(slot));
    for (const slot of blocked) {
      void this.media.showPoster(slot);
      const v = this.media.clips[slot].video;
      if (v) v.style.visibility = "hidden";
    }
    if (!blocked.length) return;
    for (const type of ["pointerdown", "keydown", "touchend"]) document.addEventListener(type, this.onActivation, true);
  }

  /** Inside a user gesture: play() now counts as user-initiated, which lifts the block per element. */
  private unblock() {
    for (const slot of SCENES) {
      const state = this.media.clips[slot];
      const v = state.video;
      if (!state.blocked || !v) continue;
      v.play()
        .then(() => {
          state.blocked = false;
          v.style.visibility = "";
          this.sync(); // pauses it again if its scene isn't on screen
        })
        .catch(() => {});
    }
    for (const type of ["pointerdown", "keydown", "touchend"]) document.removeEventListener(type, this.onActivation, true);
  }

  // ---------------------------------------------------------------------------
  // World speed
  // ---------------------------------------------------------------------------

  private readonly applySpeed = () => {
    const speed = this.speed();
    for (const l of this.loops) l.anim.timeScale(Math.max(0.001, Math.min(speed, l.max)));
    const rate = this.rate();
    for (const slot of SCENES) {
      const v = this.runnable(slot);
      // Only when it changes noticeably: rate changes are cheap, but not free.
      if (v && !v.paused && Math.abs(v.playbackRate - rate) > 0.015) v.playbackRate = rate;
    }
  };

  // ---------------------------------------------------------------------------
  // Overlay loops per scene (speed lines, parallax desert, feet dust)
  // ---------------------------------------------------------------------------

  /** Create a scene's overlay loops, paused (done once, up front: nothing is created mid-scroll). */
  private prepareScene(scene: Scene) {
    if (this.opts.still || this.loops.some((l) => l.scene === scene)) return;
    this.ctx.add(() => {
      const add = (anim: gsap.core.Animation, max = Infinity) => this.loops.push({ scene, anim, max });
      // Parallax desert (only rendered behind a transparent cartoon clip): 3 copies, one per loop.
      for (const el of this.q(`[data-scene="${scene}"] [data-loop]`)) {
        add(gsap.fromTo(el, { xPercent: 0 }, { xPercent: -100 / 3, duration: Number(el.dataset.loop), ease: "none", repeat: -1, paused: true }));
      }
      // Speed lines: from just off the right edge to fully off the left (stage width px + own width %).
      // repeatRefresh re-reads the width every pass, so a resize or rotation never strands one.
      this.q(`[data-speedlines="${scene}"] [data-streak]`).forEach((el, i) => {
        const anim = gsap.fromTo(
          el,
          { x: 0, xPercent: 0 },
          { x: () => -this.width, xPercent: -100, duration: Number(el.dataset.streak), ease: "none", repeat: -1, repeatRefresh: true, paused: true },
        );
        anim.progress((i * 0.37) % 1);
        add(anim);
      });
    });
  }

  /** Overlay loops and feet dust run only while their scene is on screen. */
  private setScene(scene: Scene, on: boolean) {
    if (this.opts.still || on === this.running.has(scene)) return;
    if (on) {
      this.running.add(scene);
      for (const l of this.loops) if (l.scene === scene) l.anim.play();
      const particles = this.particles.get(scene) ?? [];
      if (particles.length) {
        const { cfg, seed } = EMITTERS[scene];
        const emitter = new DustEmitter(particles, this.world, cfg, seed);
        // Outside the context: the emitter makes a tween per puff and cleans up after itself.
        this.ctx.ignore(() => emitter.start());
        this.emitters.set(scene, emitter);
      }
      this.applySpeed();
    } else {
      this.running.delete(scene);
      for (const l of this.loops) if (l.scene === scene) l.anim.pause();
      this.emitters.get(scene)?.stop();
      this.emitters.delete(scene);
    }
  }

  // ---------------------------------------------------------------------------
  // One idempotent sync: everything that isn't a plain tween, from the playhead
  // ---------------------------------------------------------------------------

  private readonly sync = () => {
    if (this.destroyed || this.refreshing) return;
    const t = this.master?.time() ?? 0;
    const hidden = document.hidden;
    // Which scene is on screen decides what runs (and decodes).
    const realOn = t < B.realGone && !hidden;
    const cartoonOn = t > B.morph - 0.2 && t < B.swap && !hidden;
    this.setScene("real", realOn);
    this.setScene("cartoon", cartoonOn);
    this.loopClip("real", realOn);
    this.loopClip("cartoon", cartoonOn);
    // The dust follows the scroll frame by frame; its thickest frame sits exactly on the swap.
    const dustStartAt = this.media.clips.dust.clip.startAt;
    const peak = introClipTiming.dustPeakAt;
    this.scrub("dust", t, (d) => [
      [B.dustStart, dustStartAt],
      [B.swap, peak],
      [B.dustEnd, Math.max(peak, d - 0.05)],
    ]);
    // So does the bus: it drives out of the dust as you scroll (reversible, never plays unseen, never
    // jumps) and has come to rest exactly as the branding lands.
    const busStartAt = this.media.clips.bus.clip.startAt;
    this.scrub("bus", t, (d) => [
      [B.busStart, busStartAt],
      [B.brand, Math.max(busStartAt, d - 0.05)],
    ]);
    // The header comes in with the branding.
    const revealed = t >= B.brand - 0.05;
    if (revealed !== this.revealed) {
      this.revealed = revealed;
      document.documentElement.dataset.introStage = revealed ? "bus" : "real";
    }
  };

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Build everything up front (measured while nothing moves), hook the timeline
   * to the scroll, and let scene 1 idle: the real clip runs from the start.
   */
  start() {
    this.layout();
    for (const scene of SCENES) {
      this.particles.set(scene, this.q(`[data-emitter="${scene}"] [data-particle]`).filter((p) => getComputedStyle(p).display !== "none"));
      this.prepareScene(scene);
    }
    let tl!: gsap.core.Timeline;
    this.ctx.add(() => {
      tl = this.opts.still ? this.stillTimeline() : this.cinematicTimeline();
      this.master = tl; // sync() reads the playhead from here
      // Opened part-way down (deep link, restored scroll): start there. Set before the trigger
      // exists, so its scrub has nothing to catch up on (it would play the story up to here).
      const top = this.section.getBoundingClientRect().top + window.scrollY;
      const range = this.section.offsetHeight - window.innerHeight;
      tl.progress(gsap.utils.clamp(0, 1, range > 0 ? (window.scrollY - top) / range : 0));
      this.boostTo = gsap.quickTo(this.boost, "v", { duration: 0.6, ease: "power2.out", onUpdate: this.applySpeed });
      this.boostReset = gsap.delayedCall(0.15, () => this.boostTo?.(0)).pause();
      this.trigger = ScrollTrigger.create({
        trigger: this.section,
        start: "top top",
        end: "bottom bottom",
        animation: tl,
        // The timeline eases toward the scrollbar: smooth on wheel steps and touch flicks alike.
        scrub: this.opts.still ? 0.4 : INTRO.scroll.scrub,
        invalidateOnRefresh: true,
        onRefreshInit: () => {
          this.refreshing = true;
          this.layout(); // re-measure before the function-based poses are re-evaluated
        },
        onRefresh: () => {
          this.refreshing = false;
          this.sync();
          this.applySpeed();
        },
        onUpdate: (self) => {
          // Scrolling fast makes him run faster; it eases back shortly after you stop.
          const running = (this.master?.time() ?? 0) < B.swap;
          this.boostTo?.(running ? Math.min(1, Math.abs(self.getVelocity()) / 2500) : 0);
          this.boostReset?.restart(true);
        },
      });
    });
    this.master = tl;
    this.refreshing = false;
    document.addEventListener("visibilitychange", this.onVisibility);
    this.watchBlocked();
    this.sync();
  }

  /** The loader lifts off the running scene (the scroll hint underneath is the timeline's). Resolves once it's gone. */
  enter() {
    return new Promise<void>((resolve) => {
      this.ctx.add(() => {
        gsap.to(this.q("[data-intro-loader]"), { autoAlpha: 0, duration: 0.45, ease: "power2.out", onComplete: () => resolve() });
      });
    });
  }

  /**
   * The rest of the footage has arrived: re-measure (a clip may have been
   * framed for a different file) and re-evaluate what should be playing.
   */
  refresh() {
    this.watchBlocked();
    // A refresh restores the scroll position it measured at, so it would stop a scroll that's still
    // under way (a deep link's smooth scroll, a flick): wait until the page is still.
    const run = () => {
      if (this.destroyed) return;
      ScrollTrigger.refresh();
      this.sync();
    };
    if (!ScrollTrigger.isScrolling()) return run();
    const once = () => {
      ScrollTrigger.removeEventListener("scrollEnd", once);
      run();
    };
    ScrollTrigger.addEventListener("scrollEnd", once);
    this.pendingRefresh = once;
  }

  /** Put the DOM and the clips back exactly as the page started (unmount). */
  destroy() {
    this.destroyed = true;
    if (this.pendingRefresh) ScrollTrigger.removeEventListener("scrollEnd", this.pendingRefresh);
    document.removeEventListener("visibilitychange", this.onVisibility);
    for (const type of ["pointerdown", "keydown", "touchend"]) document.removeEventListener(type, this.onActivation, true);
    for (const [v, s] of this.seeks) v.removeEventListener("seeked", s.onSeeked);
    this.seeks.clear();
    this.boostReset?.kill();
    this.boostReset = null;
    this.boostTo = null;
    for (const scene of SCENES) {
      this.running.delete(scene);
      this.emitters.get(scene)?.stop();
      this.emitters.delete(scene);
    }
    // revert (not kill): the timeline, its trigger and every fade restore what they changed.
    this.ctx.revert();
    this.trigger = null;
    this.master = null;
    for (const slot of SLOTS) {
      const { video, ready, clip } = this.media.clips[slot];
      if (!video || !ready) continue;
      video.pause();
      video.playbackRate = 1;
      video.style.visibility = "";
      video.currentTime = clip.startAt;
    }
    gsap.set(this.q("[data-scene], [data-camera], [data-dust], [data-loop], [data-streak]"), { clearProps: "opacity,visibility,transform" });
    delete document.documentElement.dataset.introStage;
  }

  // ---------------------------------------------------------------------------
  // The master timeline (units = scroll: the whole thing spans the intro's scroll length)
  // ---------------------------------------------------------------------------

  private cinematicTimeline() {
    const q = this.q;
    const tl = gsap.timeline({ paused: true, defaults: { ease: "power2.inOut" }, onUpdate: this.sync });
    /**
     * Every tween is a fromTo with explicit start AND end values, and (after
     * position 0) never renders its start early: before a tween starts, the
     * element shows its CSS resting state, which equals that start. So any
     * scroll position, reached from any direction or after any re-measure
     * (resize, rotation), always looks the same.
     */
    const at = (targets: gsap.TweenTarget, from: gsap.TweenVars, to: gsap.TweenVars, position: number) =>
      tl.fromTo(targets, from, { ...to, immediateRender: position === 0 }, position);

    const realScene = q('[data-scene="real"]');
    const cartoonScene = q('[data-scene="cartoon"]');
    const busScene = q('[data-scene="bus"]');
    const realCam = q('[data-camera="real"]');
    const cartoonCam = q('[data-camera="cartoon"]');
    const busCam = q('[data-camera="bus"]');
    const caption = q('[data-caption="cartoon"]');
    const dust = q("[data-dust]");
    const haze = q('[data-fx="haze"]');
    const flash = q('[data-fx="flash"]');
    const speed = (from: number, to: number, start: number, end: number, ease: string) =>
      at(this.world, { speed: from }, { speed: to, duration: end - start, ease, onUpdate: this.applySpeed }, start);

    // Camera poses, re-measured on every refresh (see pose()).
    const realPush = this.pose(() => this.around(this.spot("real"), this.realPush()));
    // The cartoon's camera starts with its bird exactly over the (pushed-in) real bird: as big,
    // same spot, same ground line. The bus's camera starts with the bus where the roadrunner vanishes.
    const cartoonMatch = this.pose(() => this.align({ ...this.spot("real"), h: this.spot("real").h * this.realPush() }, this.spot("cartoon"), "cartoon"));
    const cartoonCharge = this.pose(() => this.around(this.spot("cartoon"), 1.07));
    const busMatch = this.pose(() => this.align({ ...this.spot("cartoon"), h: this.spot("bus").h * 1.1 }, this.spot("bus"), "bus", 1.3));
    const dustSmall = this.pose(() => this.dustPose(0.7));
    const dustFull = this.pose(() => this.dustPose(1.15));
    const dustGone = this.pose(() => this.dustPose(1.45));

    // 1 ── Scroll starts: the camera moves in, the real bird gains speed ────────
    at(q('[data-intro-hint="scroll"]'), { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: 10, duration: 0.25, ease: "power1.out" }, 0);
    at(q("[data-intro-wordmark]"), { autoAlpha: 1, yPercent: 0 }, { autoAlpha: 0, yPercent: -60, duration: 0.5, ease: "power2.in" }, 0.05);
    // World speed rises all the way to the swap: the roadrunner keeps gaining speed.
    speed(S.idle, S.kick, 0, B.morph + 0.1, "power1.in");
    speed(S.kick, S.run, B.morph + 0.1, B.run, "none");
    speed(S.run, S.storm, B.run, B.swap, "power2.in");
    // …and the bus's world slows to a stop as the reveal settles.
    speed(S.storm, S.idle, B.clear, B.clear + T.clear, "power2.out");
    at(realCam, { ...IDENTITY }, { ...realPush, duration: B.run, ease: "power1.inOut" }, 0);
    at(q('[data-speedlines="real"]'), { opacity: 0.35 }, { opacity: 1, duration: 0.5 }, 0);
    at(cartoonCam, cartoonMatch, { ...cartoonMatch, duration: B.realGone - 0.1 }, 0); // waits, hidden, lined up
    at(busCam, busMatch, { ...busMatch, duration: B.clear }, 0);

    // 2 ── Real → cartoon: the cartoon (already running) fades in over the real bird ──
    //      It is fully visible before the real bird has gone; both keep running.
    at(cartoonScene, { autoAlpha: 0 }, { autoAlpha: 1, duration: T.morphLength, ease: "power1.inOut" }, B.morph);
    at(realScene, { autoAlpha: 1 }, { autoAlpha: 0, duration: T.morphLength, ease: "power1.inOut" }, B.morph + T.morphLength * 0.4);
    at(flash, { opacity: 0 }, { keyframes: { opacity: [0, 0.28, 0] }, duration: T.morphLength, ease: "none" }, B.morph);
    // With the real world gone, the camera eases back to the cartoon's own framing.
    at(cartoonCam, cartoonMatch, { ...IDENTITY, duration: B.storm - B.realGone - 0.05 }, B.realGone - 0.1);

    // 3 ── The cartoon runs; the world accelerates; dust gathers at his feet ────
    at(caption, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: "power3.out" }, B.run + 0.15);
    at(q('[data-speedlines="cartoon"]'), { opacity: 0 }, { opacity: 1, duration: 0.5 }, B.run);
    at(this.world, { dust: 0 }, { dust: 1, duration: B.swap - 0.2 - B.feetDust, ease: "power1.in" }, B.feetDust);
    at(caption, { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -12, duration: 0.35, ease: "power2.in" }, B.dustStart);

    // 4 ── The dust clip grows out of the running dust and swallows him ─────────
    at(dust, { autoAlpha: 0 }, { autoAlpha: 1, duration: (B.swap - B.dustStart) * 0.45, ease: "power1.out" }, B.dustStart);
    at(dust, dustSmall, { ...dustFull, duration: B.swap - B.dustStart, ease: "power2.out" }, B.dustStart);
    // The camera charges into the cloud with him.
    at(cartoonCam, { ...IDENTITY }, { ...cartoonCharge, duration: B.swap - B.storm, ease: "power2.in" }, B.storm);
    // A flat dust-coloured cover, fully opaque by the swap: nothing of the change can show through.
    at(haze, { autoAlpha: 0 }, { autoAlpha: 1, duration: B.swap - B.storm - 0.1, ease: "power2.in" }, B.storm);
    at(this.world, { dust: 1 }, { dust: 0, duration: 0.2 }, B.swap - 0.2);

    // 5 ── Hidden swap: roadrunner out, bus in, under full cover ────────────────
    tl.set(cartoonScene, { autoAlpha: 0 }, B.swap);
    tl.set(busScene, { opacity: 1 }, B.swap);

    // 6 ── Clear: the dust thins, the bus drives out of it, the camera settles ──
    at(haze, { autoAlpha: 1 }, { autoAlpha: 0, duration: T.clear * 0.7 }, B.clear);
    at(dust, { ...dustFull, autoAlpha: 1 }, { ...dustGone, autoAlpha: 0, duration: T.clear, ease: "power1.inOut" }, B.clear);
    at(q("[data-bus-shade]"), { opacity: 0.5 }, { opacity: 0, duration: T.clear, ease: "power2.out" }, B.clear);
    at(busCam, busMatch, { ...IDENTITY, duration: T.clear + 0.3, ease: "power3.out" }, B.clear);

    // 7 ── Branding once the camera has settled; the CTAs come last ────────────
    this.brandAndCtas(at, B.brand, B.ctas, T.ctaLength, false);
    tl.to({}, { duration: T.dwell }, B.end - T.dwell); // a beat to take it in before the page moves on
    return tl;
  }

  /** Reduced motion / Save-Data: the same story as calm crossfades of the stills, on a shorter scroll. */
  private stillTimeline() {
    const q = this.q;
    const tl = gsap.timeline({ paused: true, defaults: { ease: "power1.inOut" }, onUpdate: this.sync });
    const at = (targets: gsap.TweenTarget, from: gsap.TweenVars, to: gsap.TweenVars, position: number) =>
      tl.fromTo(targets, from, { ...to, immediateRender: position === 0 }, position);
    at(q('[data-intro-hint="scroll"], [data-intro-wordmark]'), { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3 }, 0);
    at(q('[data-scene="cartoon"]'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8 }, B.morph);
    at(q('[data-scene="real"]'), { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.8 }, B.morph + 0.3);
    at(q('[data-caption="cartoon"]'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 }, B.run);
    at(q('[data-fx="haze"]'), { autoAlpha: 0 }, { autoAlpha: 1, duration: B.swap - B.storm }, B.storm);
    tl.set(q('[data-scene="cartoon"]'), { autoAlpha: 0 }, B.swap);
    tl.set(q('[data-scene="bus"]'), { opacity: 1 }, B.swap);
    at(q('[data-fx="haze"]'), { autoAlpha: 1 }, { autoAlpha: 0, duration: T.clear * 0.6 }, B.clear);
    at(q("[data-bus-shade]"), { opacity: 0.5 }, { opacity: 0, duration: T.clear * 0.6 }, B.clear);
    this.brandAndCtas(at, B.brand, B.ctas, T.ctaLength, true);
    tl.to({}, { duration: T.dwell }, B.end - T.dwell);
    return tl;
  }

  private brandAndCtas(
    at: (targets: gsap.TweenTarget, from: gsap.TweenVars, to: gsap.TweenVars, position: number) => gsap.core.Timeline,
    brand: number,
    ctas: number,
    length: number,
    still: boolean,
  ) {
    const q = this.q;
    // Nothing left to skip once the branding is in: gone before the header returns over its spot.
    at(q('[data-intro-hint="skip"]'), { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.2, ease: "power1.out" }, brand - 0.3);
    // opacity (not autoAlpha): the H1 stays in the accessibility tree throughout.
    at(
      q("[data-bus-copy]:not([data-bus-ctas])"),
      { opacity: 0, y: still ? 0 : 24 },
      { opacity: 1, y: 0, duration: length, ease: "power3.out", stagger: 0.12 },
      brand,
    );
    // autoAlpha: invisible (and out of the Tab order) until they come in.
    at(q("[data-bus-ctas]"), { autoAlpha: 0, y: still ? 0 : 16 }, { autoAlpha: 1, y: 0, duration: length * 0.85, ease: "power3.out" }, ctas);
    at(q('[data-intro-hint="explore"]'), { autoAlpha: 0 }, { autoAlpha: 1, duration: length * 0.6 }, ctas + length * 0.5);
  }
}
