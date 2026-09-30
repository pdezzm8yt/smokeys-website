import gsap from "gsap";
import { INTRO } from "./intro-config";

/**
 * The intro's animation engine (GSAP). One continuous shot:
 *
 *   real roadrunner running ─tap→ both birds overlap in the same pose while the
 *   worlds cross-dissolve → cartoon runs, the world accelerates, dust forms
 *   behind him → the cloud swallows him → (bus already waiting) → dust clears,
 *   the bus rolls forward → lights → branding → CTAs.
 *
 * Everything that moves reads one shared `world.speed`: parallax layers, stride
 * bob, speed lines and dust emission play at `speed × their own rate`, so a
 * single tween of `world.speed` accelerates the whole world smoothly.
 *
 * DOM hooks (rendered by scenes.tsx / parts.tsx / intro-sequence.tsx):
 *   [data-scene]  [data-camera]  [data-subject]  [data-bob]  [data-trail]
 *   [data-loop="<seconds>"]  [data-speedlines] [data-streak="<seconds>"]
 *   [data-whoosh]  [data-emitter] [data-particle]  [data-caption]
 *   [data-dust]  [data-fx="haze|flash"]  [data-intro-hint] [data-intro-wordmark]
 *   [data-intro-loader]  [data-bus-world] [data-bus-shade] [data-bus-flare]
 *   [data-bus-pool] [data-bus-sweep]  [data-bus-copy] [data-bus-ctas]
 *
 * The timeline and every fade are created inside one gsap.context, so
 * `destroy()` reverts the inline styles they wrote; the per-frame writers
 * (loops, trails, dust puffs) are cleared explicitly, and the DOM is back to
 * its server-rendered state.
 *
 * This module (and GSAP with it) is loaded on demand by intro-sequence.tsx.
 */

export type IntroOptions = {
  /** prefers-reduced-motion: crossfades only, no loops, no particles. */
  reduce: boolean;
};

export type IntroHooks = {
  /** Branding starts landing: reveal the header. */
  onBrand: () => void;
  /** The CTAs have landed. */
  onComplete: () => void;
};

type Scene = "real" | "cartoon";
/** A looping animation whose speed follows the world, up to `max`. */
type Loop = { scene: Scene; anim: gsap.core.Animation; max: number };
type EmitterConfig = { interval: number; life: number; travelX: number; travelY: number; grow: number; peak: number };
type Setter = (value: number) => void;

const T = INTRO.timeline;
const S = INTRO.speed;
const SCENES: Scene[] = ["real", "cartoon"];

const EMITTERS: Record<Scene, { cfg: EmitterConfig; seed: number }> = {
  real: { cfg: { interval: 0.2, life: 0.8, travelX: 260, travelY: 55, grow: 1, peak: 0.75 }, seed: 7 },
  cartoon: { cfg: { interval: 0.12, life: 0.55, travelX: 190, travelY: 55, grow: 0.8, peak: 0.6 }, seed: 23 },
};

/** Own opacity, or 0 if the element (or an ancestor) is visibility:hidden. */
function alpha(el: HTMLElement) {
  const cs = getComputedStyle(el);
  return cs.visibility === "hidden" ? 0 : Number(cs.opacity);
}

/** Emits dust sprites from a point behind the runner; rate and size follow the world. */
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
      // Never outrun the pool: a puff is reused only once it has finished its life, so none
      // is ever cut off mid-flight. The storm shows as bigger puffs, not more of them.
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

export class IntroEngine {
  private readonly ctx: gsap.Context;
  private readonly q: (selector: string) => HTMLElement[];
  private readonly world = { speed: S.idle as number, dust: 0 };
  private loops: Loop[] = [];
  private running = new Set<Scene>();
  private emitters = new Map<Scene, DustEmitter>();
  /** Visible particles per scene (measured once, so starting a scene mid-shot reads no styles). */
  private particles = new Map<Scene, HTMLElement[]>();
  private master: gsap.core.Timeline | null = null;
  private prompt: gsap.core.Tween | null = null;
  private hooks: IntroHooks = { onBrand: () => {}, onComplete: () => {} };
  /** Stage width for the speed lines, kept current without reading layout mid-shot. */
  private width: number;
  private readonly resize: ResizeObserver;
  /**
   * Ghost images behind each runner. Written with quickSetters every frame of a
   * speed ramp: no tween objects, nothing for the context to record.
   */
  private readonly trails: { i: number; opacity: Setter; xPercent: Setter }[];

  constructor(
    private readonly root: HTMLElement,
    private readonly opts: IntroOptions,
  ) {
    this.q = gsap.utils.selector(root) as (selector: string) => HTMLElement[];
    this.ctx = gsap.context(() => {}, root);
    this.trails = this.q("[data-trail]").map((el) => ({
      i: Number(el.dataset.trail) || 1,
      opacity: gsap.quickSetter(el, "opacity") as Setter,
      xPercent: gsap.quickSetter(el, "xPercent") as Setter,
    }));
    this.width = root.clientWidth;
    this.resize = new ResizeObserver(([entry]) => {
      if (entry) this.width = entry.contentRect.width;
    });
    this.resize.observe(root);
  }

  // ---------------------------------------------------------------------------
  // World speed
  // ---------------------------------------------------------------------------

  /** Push the current world speed into every loop and the speed trails. */
  private readonly applySpeed = () => {
    const { speed } = this.world;
    for (const l of this.loops) l.anim.timeScale(Math.max(0.001, Math.min(speed, l.max)));
    // Ghost trails behind the runner: faint at the kick, a full motion smear in the storm.
    const strength = gsap.utils.clamp(0, 1, (speed - 1.6) / 1.8);
    for (const t of this.trails) {
      t.opacity((0.32 * strength) / t.i);
      t.xPercent(-2.2 * t.i * (0.6 + strength));
    }
  };

  private speedTo(tl: gsap.core.Timeline, speed: number, duration: number, ease: string, at: gsap.Position) {
    tl.to(this.world, { speed, duration, ease, onUpdate: this.applySpeed }, at);
  }

  // ---------------------------------------------------------------------------
  // Per-scene loops (parallax, stride, speed lines, dust)
  // ---------------------------------------------------------------------------

  /**
   * Create a scene's loops, paused. Done for both scenes while scene 1 idles,
   * so the morph only has to press play (no tween creation mid-shot).
   */
  private prepareScene(scene: Scene) {
    if (this.opts.reduce || this.loops.some((l) => l.scene === scene)) return;
    this.ctx.add(() => {
      const add = (anim: gsap.core.Animation, max = Infinity) => this.loops.push({ scene, anim, max });

      // Parallax: each layer holds 3 copies of its tile and slides exactly one copy per loop.
      // fromTo: every run starts from the seam, whatever an earlier run left behind.
      for (const el of this.q(`[data-scene="${scene}"] [data-loop]`)) {
        add(gsap.fromTo(el, { xPercent: 0 }, { xPercent: -100 / 3, duration: Number(el.dataset.loop), ease: "none", repeat: -1, paused: true }));
      }
      // Stride: the body dips on each footfall and pitches forward slightly.
      for (const el of this.q(`[data-subject="${scene}"] [data-bob]`)) {
        const real = scene === "real";
        add(
          gsap.fromTo(
            el,
            { yPercent: 0, rotation: 0 },
            {
              yPercent: real ? -2.2 : -4,
              rotation: real ? -0.7 : -2,
              duration: real ? 0.17 : 0.1,
              ease: "sine.inOut",
              yoyo: true,
              repeat: -1,
              paused: true,
            },
          ),
          S.strideMax,
        );
      }
      // Speed lines rushing past the camera: from just off the right edge (left: 100%) to
      // fully off the left, i.e. the stage width in px plus the streak's own width in %.
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
      // Cartoon "whoosh" lines.
      this.q(`[data-scene="${scene}"] [data-whoosh]`).forEach((el, i) => {
        const anim = gsap.to(el, {
          keyframes: { opacity: [0, 1, 0], scaleX: [0.3, 0.8, 1], xPercent: [0, -18, -35], easeEach: "power1.out" },
          duration: 0.36,
          repeat: -1,
          paused: true,
        });
        anim.progress((i * 0.25) % 1);
        add(anim, S.strideMax);
      });
    });
  }

  private startScene(scene: Scene) {
    if (this.opts.reduce || this.running.has(scene)) return;
    this.prepareScene(scene);
    this.running.add(scene);
    for (const l of this.loops) if (l.scene === scene) l.anim.play();

    // Dust kicked up from the feet. Outside the context: the emitter makes a tween per
    // puff for as long as the scene runs and cleans up after itself in stop().
    const particles = this.particles.get(scene) ?? [];
    if (particles.length) {
      const { cfg, seed } = EMITTERS[scene];
      const emitter = new DustEmitter(particles, this.world, cfg, seed);
      this.ctx.ignore(() => emitter.start());
      this.emitters.set(scene, emitter);
    }
    this.applySpeed();
  }

  private stopScene(scene: Scene) {
    for (const l of this.loops.filter((x) => x.scene === scene)) l.anim.kill();
    this.loops = this.loops.filter((x) => x.scene !== scene);
    this.running.delete(scene);
    this.emitters.get(scene)?.stop();
    this.emitters.delete(scene);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Scene 1 idles: the real roadrunner runs in place while the world streams
   * past. Everything the shot needs is measured and built now, while nothing is
   * moving yet, so the tap and the morph only start animations (no style reads).
   */
  startIdle() {
    for (const scene of SCENES) {
      this.particles.set(
        scene,
        this.q(`[data-emitter="${scene}"] [data-particle]`).filter((p) => getComputedStyle(p).display !== "none"),
      );
    }
    for (const scene of SCENES) this.prepareScene(scene);
    this.startScene("real");
    this.buildMaster();
  }

  /**
   * The loader lifts off the idling scene. The prompt fades in, unless a tap is
   * already waiting (then it stays hidden: the shot is about to start).
   * Resolves once the loader is gone.
   */
  enter(queued: boolean) {
    return new Promise<void>((resolve) => {
      this.ctx.add(() => {
        const hint = this.q('[data-intro-hint="continue"]');
        if (queued) gsap.set(hint, { autoAlpha: 0 });
        else {
          this.prompt = gsap.fromTo(
            hint,
            { autoAlpha: 0, y: this.opts.reduce ? 0 : 8 },
            { autoAlpha: 1, y: 0, duration: 0.5, delay: 0.25, ease: "power2.out" },
          );
        }
        gsap.to(this.q("[data-intro-loader]"), { autoAlpha: 0, duration: 0.45, ease: "power2.out", onComplete: () => resolve() });
      });
    });
  }

  /** The tap: play the one continuous shot. */
  play(hooks: IntroHooks) {
    this.hooks = hooks;
    this.prompt?.kill(); // a prompt still fading in must not come back mid-shot
    (this.master ?? this.buildMaster()).play(0);
  }

  /**
   * Skip / deep links: go to the finished reveal without a cut.
   * - Once the bus is on screen (past the hidden swap), fast-forward the rest.
   * - Before that, jump the timeline to its end underneath, and fade out
   *   whatever is on screen from exactly how it looks right now.
   */
  finish(duration: number) {
    const master = this.master ?? this.buildMaster();
    this.prompt?.kill();
    if (duration > 0 && master.isActive() && master.time() >= (master.labels.swap ?? Infinity)) {
      const toLanded = (master.labels.landed ?? master.duration()) - master.time();
      master.timeScale(gsap.utils.clamp(1, 4, toLanded / duration)); // eased back to 1 at "landed"
      return;
    }

    const q = this.q;
    const fading = q('[data-scene="real"], [data-scene="cartoon"], [data-dust], [data-fx]');
    const fadeFrom = fading.map(alpha);
    const dust = q("[data-dust]")[0];
    const dustP = dust ? Number(gsap.getProperty(dust, "--p")) || 0 : 0;
    // The leaving layers keep their current pose instead of snapping to the shot's end state.
    const posed = q(
      '[data-camera="real"], [data-camera="cartoon"], [data-subject="real"], [data-subject="cartoon"], [data-caption], [data-intro-wordmark]',
    );
    const poses = posed.map((el) => ({
      xPercent: gsap.getProperty(el, "xPercent"),
      yPercent: gsap.getProperty(el, "yPercent"),
      scale: gsap.getProperty(el, "scale"),
      rotation: gsap.getProperty(el, "rotation"),
      opacity: gsap.getProperty(el, "opacity"),
      visibility: el.style.visibility === "hidden" ? "hidden" : "inherit",
    }));
    const bus = q('[data-scene="bus"]');
    const busFrom = bus[0] ? alpha(bus[0]) : 0;

    this.stopScene("real");
    this.stopScene("cartoon");
    master.timeScale(1).progress(1, true).pause();
    if (duration <= 0) return;

    this.ctx.add(() => {
      posed.forEach((el, i) => gsap.set(el, poses[i] ?? {}));
      fading.forEach((el, i) => {
        const from = fadeFrom[i] ?? 0;
        if (from < 0.01) return;
        const isDust = el === dust;
        gsap.fromTo(
          el,
          { autoAlpha: from, ...(isDust && { "--p": dustP }) },
          { autoAlpha: 0, ...(isDust && { "--p": dustP + 0.4 }), duration, ease: "power1.inOut" },
        );
      });
      if (busFrom < 0.99) gsap.fromTo(bus, { opacity: busFrom }, { opacity: 1, duration, ease: "power1.inOut" });
    });
  }

  /** Put the DOM back exactly as the server rendered it (Replay / unmount). */
  destroy() {
    this.resize.disconnect();
    this.stopScene("real");
    this.stopScene("cartoon");
    // revert (not kill): the timeline and every fade restore the styles they changed.
    this.ctx.revert();
    this.master = null;
    this.prompt = null;
    // Stopped loops and quickSetter trails aren't in the context's bookkeeping: clear them too.
    gsap.set(this.q("[data-scene], [data-loop], [data-bob], [data-streak], [data-whoosh], [data-trail]"), {
      clearProps: "opacity,visibility,transform",
    });
  }

  // ---------------------------------------------------------------------------
  // The master timeline
  // ---------------------------------------------------------------------------

  private buildMaster() {
    if (this.master) return this.master;
    let tl!: gsap.core.Timeline;
    this.ctx.add(() => {
      tl = this.opts.reduce ? this.reducedTimeline() : this.cinematicTimeline();
    });
    this.master = tl;
    return tl;
  }

  private cinematicTimeline() {
    const q = this.q;
    const tl = gsap.timeline({ paused: true, defaults: { ease: "power2.inOut" } });

    const realScene = q('[data-scene="real"]');
    const cartoonScene = q('[data-scene="cartoon"]');
    const busScene = q('[data-scene="bus"]');
    const realSubject = q('[data-subject="real"]');
    const cartoonSubject = q('[data-subject="cartoon"]');
    const busSubject = q('[data-subject="bus"]');
    const cartoonCamera = q('[data-camera="cartoon"]');
    const caption = q('[data-caption="cartoon"]');
    const dust = q("[data-dust]");
    const haze = q('[data-fx="haze"]');
    const flash = q('[data-fx="flash"]');
    /** When the cartoon's forward push (and the final speed ramp) begins. */
    const pushAt = T.morphAt + T.morph + 0.5;

    // 1 ── Tap: the world surges, both birds lunge together ─────────────────────
    tl.addLabel("go", 0);
    tl.to(q('[data-intro-hint="continue"]'), { autoAlpha: 0, duration: 0.25, ease: "power1.out" }, "go");
    tl.to(q("[data-intro-wordmark]"), { autoAlpha: 0, yPercent: -60, duration: 0.5, ease: "power2.in" }, "go");
    // World speed only ever rises: an instant surge, a steady climb, then flat out into the storm.
    this.speedTo(tl, S.kick, T.accelerate, "power2.out", "go");
    this.speedTo(tl, S.run, pushAt - T.accelerate, "none", T.accelerate);
    this.speedTo(tl, S.storm, T.run - 0.5, "power2.in", pushAt);
    // The (still invisible) cartoon rides the same lunge and the same camera push as the real
    // bird, so the two stay registered through the dissolve instead of drifting apart.
    tl.to([...realSubject, ...cartoonSubject], { xPercent: 4, scale: 1.05, duration: T.accelerate + 0.2 }, "go");
    tl.to(q('[data-camera="real"], [data-camera="cartoon"]'), { scale: 1.06, duration: T.accelerate + T.morph }, "go");
    tl.to(q('[data-speedlines="real"]'), { opacity: 1, duration: 0.4 }, "go");

    // 2 ── Morph: both birds overlap in the same pose while the worlds dissolve ──
    //      (the cartoon is fully visible before the real bird has faded out)
    tl.addLabel("morph", T.morphAt);
    tl.call(() => this.startScene("cartoon"), [], "morph");
    tl.fromTo(cartoonScene, { autoAlpha: 0 }, { autoAlpha: 1, duration: T.morph, ease: "power1.inOut" }, "morph");
    tl.to(realScene, { autoAlpha: 0, duration: T.morph, ease: "power1.inOut" }, `morph+=${T.morph * 0.4}`);
    tl.fromTo(flash, { opacity: 0 }, { keyframes: { opacity: [0, 0.3, 0] }, duration: T.morph + 0.15, ease: "none" }, "morph");
    tl.call(() => this.stopScene("real"), [], `morph+=${T.morph * 1.4 + 0.05}`);
    // With the real world gone, the camera eases back out to the cartoon's own framing.
    tl.to(cartoonCamera, { scale: 1, duration: 1.4 }, T.accelerate + T.morph + 0.05);

    // 3 ── The cartoon runs; the world accelerates; dust gathers behind him ─────
    tl.addLabel("run", `morph+=${T.morph}`);
    tl.fromTo(caption, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.55, ease: "power3.out" }, "run+=0.15");
    tl.to(q('[data-speedlines="cartoon"]'), { opacity: 1, duration: 0.5 }, "run");
    tl.to(cartoonSubject, { xPercent: 8, rotation: -3, duration: T.run - 0.5, ease: "power2.in" }, pushAt);
    tl.to(this.world, { dust: 1, duration: T.run - T.dustFormsAt + 0.3, ease: "power1.in" }, `run+=${T.dustFormsAt}`);
    tl.to(caption, { autoAlpha: 0, y: -12, duration: 0.35, ease: "power2.in" }, `run+=${T.run - 0.45}`);

    // 4 ── Storm: the cloud grows out of the running dust and swallows him ──────
    tl.addLabel("storm", `run+=${T.run}`);
    tl.fromTo(dust, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25, ease: "power1.out" }, "storm");
    tl.fromTo(dust, { "--p": 0 }, { "--p": 1, duration: T.dustBuild, ease: "power2.out" }, "storm");
    // Fully opaque by the swap, so nothing of the change can show through.
    tl.fromTo(haze, { autoAlpha: 0 }, { autoAlpha: 1, duration: T.dustBuild - 0.2, ease: "power2.in" }, "storm+=0.2");
    tl.to(cartoonSubject, { autoAlpha: 0, scale: 0.92, duration: 0.35, ease: "power2.in" }, `storm+=${T.dustBuild - 0.4}`);
    tl.to(this.world, { dust: 0, duration: 0.3 }, `storm+=${T.dustBuild - 0.2}`);

    // 5 ── Hidden swap: the bus is already waiting behind the dust ──────────────
    tl.addLabel("swap", `storm+=${T.dustBuild}`);
    tl.call(() => this.stopScene("cartoon"), [], "swap");
    tl.set(cartoonScene, { autoAlpha: 0 }, "swap");
    tl.set(busScene, { opacity: 1 }, "swap");

    // 6 ── Clear: the dust thins and the bus rolls forward out of it ────────────
    tl.addLabel("clear", `swap+=${T.hold}`);
    // One --p tween across hold and clear: the cover keeps drifting (it never freezes), then
    // accelerates outward and settles. It starts at rest, just as the build ended: no lurch.
    tl.to(dust, { "--p": 1.6, duration: T.hold + T.clear, ease: "power2.inOut" }, "swap");
    tl.to(dust, { autoAlpha: 0, duration: T.clear * 0.75, ease: "power1.inOut" }, "clear+=0.1");
    tl.to(haze, { autoAlpha: 0, duration: T.clear * 0.7, ease: "power2.inOut" }, "clear");
    tl.fromTo(busSubject, { xPercent: -5, scale: 0.95 }, { xPercent: 0, scale: 1, duration: T.clear + 0.2, ease: "power3.out" }, "clear");
    // Emerging from shadow: a bus-shaped black overlay fading out (= brightness 0.45 → 1, but opacity-only).
    tl.fromTo(q("[data-bus-shade]"), { opacity: 0.55 }, { opacity: 0, duration: T.clear, ease: "power2.out" }, "clear");
    // …and keeps creeping forward so the reveal feels alive, while the camera tracks it.
    tl.to(busSubject, { xPercent: 1.2, scale: 1.02, duration: 2.6, ease: "sine.out" }, `clear+=${T.clear + 0.1}`);
    tl.fromTo(q("[data-bus-world]"), { xPercent: 2.5, scale: 1.04 }, { xPercent: 0, scale: 1, duration: T.clear + 1.2, ease: "power2.out" }, "clear");
    tl.fromTo(
      q("[data-bus-flare]"),
      { autoAlpha: 0, scale: 0.2 },
      { autoAlpha: 0.85, scale: 1, duration: 0.7, ease: "expo.out", stagger: 0.08 },
      `clear+=${T.clear * 0.5}`,
    );
    tl.fromTo(q("[data-bus-pool]"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.9, ease: "power1.inOut" }, `clear+=${T.clear * 0.55}`);
    const sweepAt = T.clear * 0.75;
    tl.fromTo(q("[data-bus-sweep]"), { xPercent: -100, autoAlpha: 1 }, { xPercent: 170, duration: 1.1, ease: "power2.inOut" }, `clear+=${sweepAt}`);
    tl.set(q("[data-bus-sweep]"), { autoAlpha: 0 }, `clear+=${sweepAt + 1.1}`);

    // 7 ── Branding lands after the reveal; the CTAs come last ──────────────────
    this.brandAndCtas(tl, `clear+=${T.brandAfterClear}`, 0.7);
    return tl;
  }

  /** prefers-reduced-motion: the same story as calm crossfades, no movement. */
  private reducedTimeline() {
    const q = this.q;
    const tl = gsap.timeline({ paused: true, defaults: { ease: "power1.inOut" } });
    tl.to(q('[data-intro-hint="continue"], [data-intro-wordmark]'), { autoAlpha: 0, duration: 0.3 }, 0);
    tl.fromTo(q('[data-scene="cartoon"]'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, 0.2);
    tl.to(q('[data-scene="real"]'), { autoAlpha: 0, duration: 0.6 }, 0.35);
    tl.fromTo(q('[data-caption="cartoon"]'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, 0.7);
    tl.fromTo(q('[data-fx="haze"]'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 }, 2.2);
    tl.addLabel("swap", 2.7);
    tl.set(q('[data-scene="cartoon"]'), { autoAlpha: 0 }, "swap");
    tl.set(q('[data-scene="bus"]'), { opacity: 1 }, "swap");
    tl.to(q('[data-fx="haze"]'), { autoAlpha: 0, duration: 0.6 }, 2.9);
    tl.fromTo(q("[data-bus-flare]"), { autoAlpha: 0 }, { autoAlpha: 0.85, duration: 0.4 }, 3.1);
    tl.fromTo(q("[data-bus-pool]"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, 3.1);
    this.brandAndCtas(tl, 3.3, 0.5, true);
    return tl;
  }

  private brandAndCtas(tl: gsap.core.Timeline, at: gsap.Position, duration: number, reduce = false) {
    const q = this.q;
    tl.addLabel("brand", at);
    tl.call(() => this.hooks.onBrand(), [], "brand");
    // Nothing left to skip, and the revealed header now sits where Skip was.
    tl.to(q('[data-intro-hint="skip"]'), { autoAlpha: 0, duration: 0.2, ease: "power1.out" }, "brand");
    // opacity (not autoAlpha): the H1 must stay in the accessibility tree throughout.
    tl.fromTo(
      q("[data-bus-copy]:not([data-bus-ctas])"),
      { opacity: 0, y: reduce ? 0 : 24 },
      { opacity: 1, y: 0, duration, ease: "power3.out", stagger: 0.12 },
      "brand",
    );
    const ctaDuration = duration * 0.85;
    tl.fromTo(
      q("[data-bus-ctas]"),
      { opacity: 0, y: reduce ? 0 : 16 },
      { opacity: 1, y: 0, duration: ctaDuration, ease: "power3.out" },
      `brand+=${T.ctaAfterBrand}`,
    );
    tl.addLabel("landed", `brand+=${T.ctaAfterBrand + ctaDuration}`);
    // A Skip fast-forward ends here: the bus's slow creep after this plays at normal speed.
    tl.call(
      () => {
        tl.timeScale(1);
        this.hooks.onComplete();
      },
      [],
      "landed",
    );
  }
}
