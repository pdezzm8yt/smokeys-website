import gsap from "gsap";
import { FILM_GLOWS, frameTimes, type FilmBeats } from "@/content/intro-video";
import { INTRO } from "./intro-config";
import type { FilmMedia } from "./intro-media";

/**
 * The tunnel scene's animation engine: ONE GSAP master timeline, scrubbed by
 * scroll, around ONE continuous film. The scene is the first part of the
 * world (src/components/world): nothing ends or loads after it, the world
 * just carries on.
 *
 *   the roadrunner runs at the tunnel (the camera pushes in) → he runs in and
 *   the light goes → complete darkness (out of sight, the film jumps to the
 *   far side of its own swap: the roadrunner has become the bus) → two
 *   headlights in the dark → the bus's shape → it drives out onto the road,
 *   the camera settles → branding → CTAs → the camera starts travelling on
 *   beside it as the world carries on.
 *
 * The stage is pinned with CSS `position: sticky` inside a long section (wide
 * in the sideways world, tall where the world falls back to scrolling down);
 * the section's scroll progress drives the master timeline, which eases
 * after it (INTRO.scroll.scrub: smooth on wheel steps and touch flicks), so
 * going back plays it all in reverse. The FILM provides the movement: it
 * follows the playhead frame by frame (it never plays on its own), through
 * the film's beats (src/content/intro-video.ts), each stretch paced by
 * INTRO.timeline. That is decided in one idempotent `sync()` from the
 * timeline's current time, so any jump, either way, lands on the right frame.
 *
 * Sideways the world is a loop (src/components/world): after its last scene
 * the journey comes back round to this scene, which the world moves round to
 * its end for that. So the scene is either behind the visitor (the story
 * finished, the bus at rest) or ahead of them (its start, the film on its
 * first frame), and the story only plays again as they travel on into it.
 * Off the screen the timeline is set at once (nobody sees it); on it, it
 * always eases.
 *
 * Reduced motion (or Save-Data, or a film that couldn't load): the same story
 * as crossfaded stills (the black still hides the change) on a shorter scroll.
 *
 * Timeline animations are created inside one gsap.context, so `destroy()`
 * reverts every style they wrote. This module (and GSAP) is loaded on demand.
 */

export type IntroOptions = {
  /** Stills and calm crossfades, no film. */
  still: boolean;
  /**
   * What scrolls the scene: the world sideways (its scroll container), or the
   * page downwards (short landscape screens, where the world is a column).
   */
  scroller: { axis: "x"; element: HTMLElement } | { axis: "y" };
};

type At = (targets: gsap.TweenTarget, from: gsap.TweenVars, to: gsap.TweenVars, position: number) => gsap.core.Timeline;

const T = INTRO.timeline;

/** Piecewise-linear map through [[x, y], …] (x ascending), clamped at both ends. */
function mapTime(points: [number, number][], x: number) {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return 0;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i] as [number, number];
    const [x0, y0] = points[i - 1] as [number, number];
    if (x <= x1) return x1 === x0 ? y1 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return last[1];
}

/** The story on the timeline (units = scroll), from the film's beats (seconds). */
function storyFor(beats: FilmBeats) {
  const tunnel = T.run;
  const dark = tunnel + T.enter;
  /** Mid-darkness: the film jumps from `dark` to `lights` here, unseen. */
  const swap = dark + T.black / 2;
  const lights = dark + T.black;
  const emerge = lights + T.lights;
  const rest = emerge + T.out;
  const brand = rest + T.brandAfterRest;
  const ctas = brand + T.ctaAfterBrand;
  const travel = ctas + T.ctaLength;
  /**
   * [timeline, film seconds] at each beat: the film follows this line. At the
   * swap it STEPS (two points at the same place: mapTime takes the first up to
   * it and the second just past it), so no frame in between is ever decoded.
   */
  const film: [number, number][] = [
    [0, 0],
    [tunnel, beats.tunnel],
    [dark, beats.dark],
    [swap, beats.dark],
    [swap, beats.lights],
    [lights, beats.lights],
    [emerge, beats.lights + (beats.rest - beats.lights) * T.lightsShare],
    [rest, beats.rest],
  ];
  /** Where a moment of the film (seconds) sits on the timeline (the frames the swap skips map onto it). */
  const at = (seconds: number) => mapTime(film.map(([t, s]) => [s, t]), seconds);
  return { tunnel, dark, swap, lights, emerge, rest, brand, ctas, travel, end: travel + T.travel, film, at };
}

export class IntroEngine {
  private readonly ctx: gsap.Context;
  private readonly q: (selector: string) => HTMLElement[];
  private readonly beats: FilmBeats;
  private readonly story: ReturnType<typeof storyFor>;
  private master: gsap.core.Timeline | null = null;
  /** Frame-accurate scrubbing without a seek backlog: one seek in flight, the latest target queued. */
  private seeking: { busy: boolean; want: number; requested: number; onSeeked: () => void } | null = null;
  private revealed: boolean | null = null;
  private destroyed = false;
  /**
   * Eases the timeline toward where the scroll would have it, INTRO.scroll.scrub
   * seconds to catch up (the very mechanism ScrollTrigger's scrub uses: one
   * tween, retargeted; nothing created while scrolling).
   */
  private toP: gsap.QuickToFunc | null = null;
  /** Re-measuring after a resize waits for the world to put the visitor back in their place. */
  private resizing = 0;
  /**
   * Re-parked off screen (the world moving the scene round), the film is out
   * of sight (its stills underneath show the scene) until it shows the
   * playhead's new frame; each park outdates any reveal still waiting.
   */
  private parkings = 0;

  constructor(
    /** The long scrolling section (its scroll range drives the timeline). */
    private readonly section: HTMLElement,
    /** The pinned stage inside it. */
    private readonly stage: HTMLElement,
    private readonly film: FilmMedia,
    private readonly opts: IntroOptions,
  ) {
    this.q = gsap.utils.selector(stage) as (selector: string) => HTMLElement[];
    this.ctx = gsap.context(() => {}, stage);
    if (!film.cut) throw new Error("The tunnel scene has no film (no cut has been built).");
    this.beats = film.cut.beats;
    this.story = storyFor(this.beats);
  }

  // ---------------------------------------------------------------------------
  // The film follows the playhead
  // ---------------------------------------------------------------------------

  /**
   * Seek without piling up: one seek in flight; when it lands, jump to the
   * newest target. A target within half a frame of the last one REQUESTED is
   * already on screen (compared with what we asked for, never with
   * currentTime, which some browsers round to the frame: that would re-seek
   * forever). Targets are clamped to the film.
   */
  private seek(time: number) {
    const v = this.film.video;
    if (!v) return;
    const halfFrame = 0.5 / (this.film.cut?.manifest.fps || 30);
    const end = Number.isFinite(v.duration) ? Math.max(0, v.duration - 2 * halfFrame) : time;
    const want = Math.min(Math.max(0, time), end);
    if (!this.seeking) {
      const state = {
        busy: false,
        want,
        requested: v.currentTime,
        onSeeked: () => {
          state.busy = false;
          this.seek(state.want);
        },
      };
      v.addEventListener("seeked", state.onSeeked);
      this.seeking = state;
    }
    const s = this.seeking;
    s.want = want;
    if (s.busy || Math.abs(s.requested - want) < halfFrame) return;
    s.busy = true;
    s.requested = want;
    v.currentTime = want;
  }

  /** Resolves when the film shows the playhead's frame (at once if no seek is under way; at most ~0.6 s). */
  private landed() {
    const v = this.film.video;
    if (this.opts.still || !this.film.ready || !v || !this.seeking?.busy) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = () => {
        window.clearTimeout(timer);
        v.removeEventListener("seeked", done);
        resolve();
      };
      const timer = window.setTimeout(done, 600);
      v.addEventListener("seeked", done);
    });
  }

  /** Everything that isn't a plain tween, derived from the playhead (idempotent: any jump lands right). */
  private readonly sync = () => {
    if (this.destroyed) return;
    const t = this.master?.time() ?? 0;
    if (!this.opts.still && this.film.ready) this.seek(mapTime(this.story.film, t));
    // The branding is in: other parts of the page (the header's home link state, tests) can tell.
    const revealed = t >= this.story.brand - 0.05;
    if (revealed !== this.revealed) {
      this.revealed = revealed;
      document.documentElement.dataset.introStage = revealed ? "end" : "film";
    }
  };

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Where the section is along the scroll, how far it scrolls while its stage
   * stays pinned (px: its length less the stage's, which is the large
   * viewport down the page, so a phone's toolbar coming and going never
   * changes it), and its whole length.
   */
  private measure() {
    const { scroller } = this.opts;
    if (scroller.axis === "x") {
      const w = scroller.element;
      const start = this.section.getBoundingClientRect().left - w.getBoundingClientRect().left + w.scrollLeft;
      return { at: w.scrollLeft, start, range: this.section.offsetWidth - this.stage.offsetWidth, size: this.section.offsetWidth, view: w.clientWidth };
    }
    const start = this.section.getBoundingClientRect().top + window.scrollY;
    return { at: window.scrollY, start, range: this.section.offsetHeight - this.stage.offsetHeight, size: this.section.offsetHeight, view: window.innerHeight };
  }

  /**
   * Where the timeline should be for the scroll position now (behind the
   * scene: finished; ahead of it, as when the world's loop is coming round to
   * it: its start), and whether the stage is off the screen (then nothing
   * eases: it goes straight there).
   */
  private target() {
    const { at, start, range, size, view } = this.measure();
    const into = at - start;
    return { p: gsap.utils.clamp(0, 1, range > 0 ? into / range : 0), offscreen: into >= size || into <= -view };
  }

  /**
   * Follow the scroll: ease the timeline toward where it should be, or set it
   * at once (off screen, `instant`). The world's trips (html[data-trip],
   * src/components/world/world-scroll.ts) ask for more: "past" one that
   * passes the tunnel by leaves its stage as it is while it's on screen (it
   * is pinned there, so it looks the same until it moves off); "story" one
   * that ends in it plays it in step with the trip (already eased).
   */
  private follow(instant = false) {
    const tl = this.master;
    if (this.destroyed || !tl || !this.toP) return;
    const { p, offscreen } = this.target();
    const trip = document.documentElement.dataset.trip;
    if (trip === "past" && !offscreen) return;
    if (offscreen || instant || trip === "story") {
      if (p !== tl.totalProgress()) this.jump(p, offscreen);
      return;
    }
    this.toP(p);
  }

  /** The timeline straight to `p` (the easing starts again from there). */
  private show(p: number) {
    this.master?.totalProgress(p); // onUpdate: sync()
    this.toP?.(p, p);
  }

  /**
   * Straight to `p`. Off screen (`hidden`), the film is re-parked out of
   * sight (see `parkings`), so even a trip that brings the stage straight back
   * on screen never sees the frame it left.
   */
  private jump(p: number, hidden: boolean) {
    const v = this.film.video;
    if (hidden && !this.opts.still && this.film.ready && v) {
      v.dataset.parking = "";
      this.parkings++;
    }
    const parking = this.parkings;
    this.show(p);
    // Out of sight until the film shows this jump's frame (any later jump while it's still parked brings it back
    // once ITS frame lands; only a newer park outdates this).
    if (v?.hasAttribute("data-parking"))
      void this.landed().then(() => {
        if (!this.destroyed && parking === this.parkings) delete v.dataset.parking;
      });
  }

  private readonly onScroll = () => this.follow();

  /** A layout change isn't travel: once the world has put the visitor back in place (its own frame comes first), straight there. */
  private readonly onResize = () => {
    this.film.band();
    cancelAnimationFrame(this.resizing);
    this.resizing = requestAnimationFrame(() => this.follow(true));
  };

  /**
   * Build the timeline (measured while nothing moves) and hook it to the
   * scroll. Resolves once the film shows the frame for the current scroll
   * position (so a finished hero shown meanwhile can hand over without a
   * flash of another frame).
   */
  start() {
    this.film.band();
    this.ctx.add(() => {
      const tl = this.opts.still ? this.stillTimeline() : this.cinematicTimeline();
      this.master = tl; // sync() reads the playhead from here
      this.toP = gsap.quickTo(tl, "totalProgress", { duration: this.opts.still ? 0.4 : INTRO.scroll.scrub, ease: "expo" });
    });
    // Opened part-way along (deep link, restored position): start there, at once.
    this.follow(true);
    // Capturing: the sideways world is a scroll container, whose scroll events don't reach the window otherwise.
    window.addEventListener("scroll", this.onScroll, { passive: true, capture: true });
    window.addEventListener("resize", this.onResize);
    this.sync();
    return this.landed();
  }

  /**
   * Put the DOM back exactly as the page started (unmount), and the film too
   * unless `keepFilm` (the world changing axis: a new engine takes over at the
   * same frame, so the film mustn't rewind meanwhile).
   */
  destroy({ keepFilm = false }: { keepFilm?: boolean } = {}) {
    this.destroyed = true;
    window.removeEventListener("scroll", this.onScroll, { capture: true });
    window.removeEventListener("resize", this.onResize);
    cancelAnimationFrame(this.resizing);
    if (this.seeking) this.film.video?.removeEventListener("seeked", this.seeking.onSeeked);
    this.seeking = null;
    if (this.film.video) delete this.film.video.dataset.parking;
    // revert (not kill): the timeline and every fade restore what they changed.
    this.ctx.revert();
    this.master = null;
    this.toP = null;
    if (!keepFilm) this.film.reset();
    gsap.set(this.q("[data-camera], [data-still], [data-glow], [data-fx]"), { clearProps: "opacity,visibility,transform" });
    delete document.documentElement.dataset.introStage;
  }

  // ---------------------------------------------------------------------------
  // The master timeline (units = scroll: the whole thing spans the scene's scroll length)
  // ---------------------------------------------------------------------------

  /**
   * Every tween is a fromTo with explicit start AND end values, and (after
   * position 0) never renders its start early: before a tween starts, the
   * element shows its CSS resting state, which equals that start. So any
   * scroll position, reached from any direction or after any jump (a resize,
   * a rotation, the loop coming round), always looks the same.
   */
  private timeline(ease: string) {
    // onUpdate: the film follows the playhead.
    const tl = gsap.timeline({ paused: true, defaults: { ease }, onUpdate: this.sync });
    const at: At = (targets, from, to, position) => tl.fromTo(targets, from, { ...to, immediateRender: position === 0 }, position);
    return { tl, at };
  }

  private cinematicTimeline() {
    const q = this.q;
    const s = this.story;
    const { tl, at } = this.timeline("power2.inOut");
    const camera = q("[data-camera]");
    const C = INTRO.camera;

    // 1 ── Movement starts: the hint goes, the camera eases in on the runner as the tunnel grows ──
    at(q('[data-intro-hint="scroll"]'), { autoAlpha: 1, x: 0 }, { autoAlpha: 0, x: 12, duration: 0.25, ease: "power1.out" }, 0);
    at(camera, { scale: 1 }, { scale: C.push, duration: s.tunnel, ease: "power1.inOut" }, 0);
    this.caption(at);

    // 2 ── Into the tunnel: the camera charges in with him and the black closes over everything ──
    at(camera, { scale: C.push }, { scale: C.charge, duration: s.dark - s.tunnel, ease: "power2.in" }, s.tunnel);
    this.darkness(at);

    // 3 ── Headlights in the dark, the bus's shape, then it drives out: the camera settles on it ──
    at(camera, { scale: C.charge }, { scale: 1, duration: s.rest - s.lights, ease: "power3.out" }, s.lights);
    this.glows(at);

    // 4 ── Branding once the bus is out; the CTAs; the camera starts travelling on beside it ──
    this.brandAndCtas(at, false);
    at(camera, { xPercent: 0 }, { xPercent: -C.travel * 100, duration: s.end - s.travel, ease: "power1.in" }, s.travel);
    return tl;
  }

  /** Reduced motion / Save-Data / no film: the same story as calm crossfades of the stills, on a shorter scroll. */
  private stillTimeline() {
    const q = this.q;
    const s = this.story;
    const { tl, at } = this.timeline("power1.inOut");
    at(q('[data-intro-hint="scroll"]'), { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3 }, 0);
    this.caption(at);
    this.darkness(at);
    // The bus is first seen at rest, out on the road: it comes up out of the black.
    at(q('[data-still="rest"]'), { opacity: 0 }, { opacity: 1, duration: 0.05 }, s.swap);
    this.glows(at);
    this.brandAndCtas(at, true);
    return tl;
  }

  /**
   * The tunnel's black: it closes over everything as he runs in (complete at
   * the film's darkest frame), holds while the film jumps to the far side of
   * its own swap, then lifts slowly — the bus's headlights are the brightest
   * thing in the dark, so they come through first, then its shape. Nothing of
   * the swap is ever on screen.
   */
  private darkness(at: At) {
    const s = this.story;
    const D = INTRO.darkness;
    const black = this.q('[data-fx="dark"]');
    const from = s.tunnel + (s.dark - s.tunnel) * D.from;
    at(black, { opacity: 0 }, { opacity: 1, duration: s.dark - from, ease: "power2.in" }, from);
    // Two headlights in the dark first (the brightest thing in the frame comes through), then the bus.
    const glimpse = s.lights + (s.emerge - s.lights) * D.glimpseAt;
    at(black, { opacity: 1 }, { opacity: D.glimpse, duration: glimpse - s.lights, ease: "power1.out" }, s.lights);
    at(black, { opacity: D.glimpse }, { opacity: 0, duration: s.emerge - glimpse, ease: "power2.in" }, glimpse);
  }

  private caption(at: At) {
    const caption = this.q("[data-caption]");
    at(caption, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: "power3.out" }, T.captionAt);
    at(caption, { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -12, duration: 0.35, ease: "power2.in" }, T.captionAt + T.captionFor);
  }

  /**
   * The glow around a banded film follows the story: each one fades in over
   * the one before it, finishing as the film reaches the moment it was taken
   * from (frames inside the darkness map onto it, under the black). Opacity
   * only; invisible behind a film that fills the frame.
   */
  private glows(at: At) {
    const times = frameTimes(this.beats);
    let prev = 0;
    for (const name of FILM_GLOWS) {
      const p = this.story.at(times[name]);
      if (name !== "start") {
        const from = prev + (p - prev) * 0.3;
        at(this.q(`[data-glow="${name}"]`), { opacity: 0 }, { opacity: 1, duration: Math.max(0.05, p - from), ease: "none" }, from);
      }
      prev = p;
    }
  }

  private brandAndCtas(at: At, still: boolean) {
    const q = this.q;
    const { brand, ctas } = this.story;
    const length = T.ctaLength;
    // The scrim that keeps the headline readable over the footage comes in just ahead of it.
    at(q("[data-copy-scrim]"), { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power1.out" }, brand - 0.25);
    // opacity (not autoAlpha): the H1 stays in the accessibility tree throughout.
    at(
      q("[data-bus-copy]:not([data-bus-ctas])"),
      { opacity: 0, y: still ? 0 : 24 },
      { opacity: 1, y: 0, duration: length, ease: "power3.out", stagger: 0.12 },
      brand,
    );
    // autoAlpha: invisible (and out of the Tab order) until they come in.
    at(q("[data-bus-ctas]"), { autoAlpha: 0, y: still ? 0 : 16 }, { autoAlpha: 1, y: 0, duration: length * 0.85, ease: "power3.out" }, ctas);
  }
}
