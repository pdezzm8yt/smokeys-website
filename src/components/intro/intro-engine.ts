import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { FILM_GLOWS, frameTimes, type FilmBeats } from "@/content/intro-video";
import { INTRO } from "./intro-config";
import type { FilmMedia } from "./intro-media";

gsap.registerPlugin(ScrollTrigger);
// Phones: the address bar showing/hiding must not re-measure (and jolt) the scene.
ScrollTrigger.config({ ignoreMobileResize: true });

/**
 * The intro's animation engine: ONE GSAP master timeline, scrubbed by scroll,
 * around ONE continuous film.
 *
 *   the roadrunner runs (the camera pushes in) → into the tunnel → the dust
 *   swallows him (the camera charges in, a dust haze peaks) → the bus's
 *   headlights cut through → the bus drives out, the camera settles →
 *   branding → CTAs → the stage unpins and the page scrolls on.
 *
 * The stage is pinned with CSS `position: sticky` inside a tall section; one
 * ScrollTrigger maps that section's scroll progress onto the master timeline
 * (with a little scrub smoothing), so scrolling back up plays it all in
 * reverse. The FILM provides the movement: it follows the playhead frame by
 * frame (it never plays on its own), through the film's beats
 * (src/content/intro-video.ts), each stretch paced by INTRO.timeline. That is
 * decided in one idempotent `sync()` from the timeline's current time, so any
 * scroll jump, in either direction, lands on the right frame.
 *
 * Reduced motion (or Save-Data, or a film that couldn't load): the same story
 * as crossfaded stills on a shorter scroll.
 *
 * Timeline animations are created inside one gsap.context, so `destroy()`
 * reverts every style they wrote. This module (and GSAP) is loaded on demand.
 */

export type IntroOptions = {
  /** Stills and calm crossfades, no film. */
  still: boolean;
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
  const swallowed = tunnel + T.tunnel;
  const headlights = swallowed + T.dust;
  const rest = headlights + T.reveal;
  const brand = rest + T.brandAfterRest;
  const ctas = brand + T.ctaAfterBrand;
  /** [timeline, film seconds] at each beat: the film follows this line. */
  const film: [number, number][] = [
    [0, 0],
    [tunnel, beats.tunnel],
    [swallowed, beats.swallowed],
    [headlights, beats.headlights],
    [rest, beats.rest],
  ];
  /** Where a moment of the film (seconds) sits on the timeline. */
  const at = (seconds: number) => mapTime(film.map(([t, s]) => [s, t]), seconds);
  return { tunnel, swallowed, cover: at(beats.cover), headlights, rest, brand, ctas, end: ctas + T.ctaLength + T.dwell, film, at };
}

export class IntroEngine {
  private readonly ctx: gsap.Context;
  private readonly q: (selector: string) => HTMLElement[];
  private readonly beats: FilmBeats;
  private readonly story: ReturnType<typeof storyFor>;
  private master: gsap.core.Timeline | null = null;
  private trigger: ScrollTrigger | null = null;
  /** Frame-accurate scrubbing without a seek backlog: one seek in flight, the latest target queued. */
  private seeking: { busy: boolean; want: number; requested: number; onSeeked: () => void } | null = null;
  private revealed: boolean | null = null;
  /**
   * ScrollTrigger reverts the timeline to 0 while it re-measures (resize,
   * rotation, a refresh) and then restores it silently: sync() must ignore
   * that revert and run once the refresh is done.
   */
  private refreshing = false;
  private destroyed = false;

  constructor(
    /** The tall scrolling section (its scroll range drives the timeline). */
    private readonly section: HTMLElement,
    /** The pinned stage inside it. */
    private readonly stage: HTMLElement,
    private readonly film: FilmMedia,
    private readonly opts: IntroOptions,
  ) {
    this.q = gsap.utils.selector(stage) as (selector: string) => HTMLElement[];
    this.ctx = gsap.context(() => {}, stage);
    if (!film.cut) throw new Error("The intro has no film (no cut has been built).");
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
    if (this.destroyed || this.refreshing) return;
    const t = this.master?.time() ?? 0;
    if (!this.opts.still && this.film.ready) this.seek(mapTime(this.story.film, t));
    // The header comes in with the branding.
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
      // Opened part-way down (deep link, restored scroll): start there. Set before the trigger
      // exists, so its scrub has nothing to catch up on (it would play the story up to here).
      const top = this.section.getBoundingClientRect().top + window.scrollY;
      const range = this.section.offsetHeight - window.innerHeight;
      tl.progress(gsap.utils.clamp(0, 1, range > 0 ? (window.scrollY - top) / range : 0));
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
          this.film.band(); // re-measure before the timeline is re-evaluated
        },
        onRefresh: () => {
          this.refreshing = false;
          this.sync();
        },
      });
    });
    this.refreshing = false;
    this.sync();
    return this.landed();
  }

  /** Put the DOM and the film back exactly as the page started (unmount). */
  destroy() {
    this.destroyed = true;
    if (this.seeking) this.film.video?.removeEventListener("seeked", this.seeking.onSeeked);
    this.seeking = null;
    // revert (not kill): the timeline, its trigger and every fade restore what they changed.
    this.ctx.revert();
    this.trigger = null;
    this.master = null;
    this.film.reset();
    gsap.set(this.q("[data-camera], [data-still], [data-glow], [data-fx]"), { clearProps: "opacity,visibility,transform" });
    delete document.documentElement.dataset.introStage;
  }

  // ---------------------------------------------------------------------------
  // The master timeline (units = scroll: the whole thing spans the intro's scroll length)
  // ---------------------------------------------------------------------------

  /**
   * Every tween is a fromTo with explicit start AND end values, and (after
   * position 0) never renders its start early: before a tween starts, the
   * element shows its CSS resting state, which equals that start. So any
   * scroll position, reached from any direction or after any re-measure
   * (resize, rotation), always looks the same.
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
    const haze = q('[data-fx="haze"]');
    const C = INTRO.camera;

    // 1 ── Scroll starts: the hint and wordmark go, the camera eases in on the runner ──
    at(q('[data-intro-hint="scroll"]'), { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: 10, duration: 0.25, ease: "power1.out" }, 0);
    at(q("[data-intro-wordmark]"), { autoAlpha: 1, yPercent: 0 }, { autoAlpha: 0, yPercent: -60, duration: 0.5, ease: "power2.in" }, 0.05);
    at(camera, { scale: 1 }, { scale: C.push, duration: s.tunnel, ease: "power1.inOut" }, 0);
    this.caption(at);

    // 2 ── Into the tunnel and the dust: the camera charges in with him, a haze gathers ──
    at(camera, { scale: C.push }, { scale: C.charge, duration: s.cover - s.tunnel, ease: "power2.in" }, s.tunnel);
    const hazeIn = s.swallowed - 0.35;
    at(haze, { autoAlpha: 0 }, { autoAlpha: INTRO.haze, duration: s.cover - hazeIn, ease: "power2.in" }, hazeIn);

    // 3 ── The headlights cut through: the haze thins, the camera settles on the bus ──
    at(haze, { autoAlpha: INTRO.haze }, { autoAlpha: 0, duration: s.headlights + 0.5 - s.cover, ease: "power1.out" }, s.cover);
    at(camera, { scale: C.charge }, { scale: 1, duration: s.rest - s.headlights, ease: "power3.out" }, s.headlights);
    this.glows(at);

    // 4 ── Branding once the film has come to rest; the CTAs come last ──
    this.brandAndCtas(at, false);
    this.handoff(at);
    return tl;
  }

  /** Reduced motion / Save-Data / no film: the same story as calm crossfades of the stills, on a shorter scroll. */
  private stillTimeline() {
    const q = this.q;
    const s = this.story;
    const { tl, at } = this.timeline("power1.inOut");
    at(q('[data-intro-hint="scroll"], [data-intro-wordmark]'), { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3 }, 0);
    this.caption(at);
    at(q('[data-still="cover"]'), { opacity: 0 }, { opacity: 1, duration: 0.8 }, s.swallowed - 0.6);
    at(q('[data-still="rest"]'), { opacity: 0 }, { opacity: 1, duration: 0.8 }, s.headlights);
    this.glows(at);
    this.brandAndCtas(at, true);
    this.handoff(at);
    return tl;
  }

  /**
   * A last beat to take it in before the stage unpins: the bottom of the
   * stage fades into the page's background, so the film flows into the
   * section below instead of ending on a hard edge.
   */
  private handoff(at: At) {
    const { end } = this.story;
    at(this.q("[data-stage-fade]"), { opacity: 0 }, { opacity: 1, duration: T.dwell, ease: "power1.in" }, end - T.dwell);
  }

  private caption(at: At) {
    const caption = this.q("[data-caption]");
    at(caption, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: "power3.out" }, T.captionAt);
    at(caption, { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -12, duration: 0.35, ease: "power2.in" }, T.captionAt + T.captionFor);
  }

  /**
   * The glow around a banded film follows the story: each one fades in over
   * the one before it, finishing as the film reaches the moment it was taken
   * from. Opacity only; invisible behind a film that fills the frame.
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
    // Nothing left to skip once the branding is in: gone before the header returns over its spot.
    at(q('[data-intro-hint="skip"]'), { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.2, ease: "power1.out" }, brand - 0.3);
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
    at(q('[data-intro-hint="explore"]'), { autoAlpha: 0 }, { autoAlpha: 1, duration: length * 0.6 }, ctas + length * 0.5);
  }
}
