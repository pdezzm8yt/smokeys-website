import { SKY, SKY_KEYS, type Period } from "@/content/sky";
import { css, skyColors } from "./sky-color";
import { SkyClouds } from "./sky-clouds";
import { paintMoon, paintStars } from "./sky-paint";

/**
 * Runs the living sky behind the site. Everything follows ONE number, the
 * phase: 0 = day, 1 = night. Changing period animates it (day → sunset →
 * twilight → night, or back through sunrise), and every layer reads it: the
 * gradient keyframes, the sun (it sets and rises), the moon, the stars, the
 * rays, the clouds' colours and light, the bus photo's light (--night on
 * [data-sky-follow]), and the page's day or night theme (html[data-sky],
 * switched halfway inside a View Transition).
 *
 * Cost control: during a change only opacity and a few transforms move in the
 * DOM; per-frame CSS variables go only to [data-sky-follow] elements, never
 * to html (that restyles the whole page). The clouds are the only per-frame
 * drawing (a small shader, its buffer capped), at SKY.idleFps while only the
 * wind moves them and at full rate while scrolling or changing; nothing is
 * drawn while the intro film covers the sky or the tab is hidden. Reduced
 * motion: the sun and moon stay put and fade (no travel), no drift, parallax,
 * twinkle or shooting stars; a change is a short crossfade. No React.
 */

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Elements the engine drives (data-sky-* attributes inside the sky layer). */
type Layers = {
  clouds: HTMLCanvasElement | null;
  stars: HTMLElement | null;
  starCanvases: HTMLCanvasElement[];
  sun: HTMLElement | null;
  rays: HTMLElement | null;
  moon: HTMLElement | null;
  moonCanvas: HTMLCanvasElement | null;
  shooting: HTMLElement | null;
};

export type SkyEngineOptions = {
  /** The visitor clicked the sun or the moon in the sky. */
  onPick: (period: Period) => void;
};

/** Browser chrome (mobile address bar) colour per theme: the top of that sky. */
const THEME_COLOUR: Record<Period, string> = { day: SKY_KEYS[0]?.top ?? "#2f74d0", night: SKY_KEYS.at(-1)?.top ?? "#040a26" };

export class SkyEngine {
  private readonly layers: Layers;
  /** The gradient keyframe layers, the sun's warm (sunset) versions, the moon's halo: all faded by opacity only. */
  private readonly keys: HTMLElement[];
  private readonly sunWarm: HTMLElement[];
  private readonly moonGlow: HTMLElement | null;
  private readonly html = document.documentElement;
  private clouds: SkyClouds | null = null;
  private phase: number;
  private from = 0;
  private to = 0;
  private startedAt = 0;
  private duration = 0;
  private raf = 0;
  private lastDraw = 0;
  private lastFrame = 0;
  /** Seconds of wind the clouds have drifted (only advances while they're drawn: no jump after a hidden tab). */
  private skyTime = 0;
  private dirty = true;
  private scroll = 0;
  private visible = true;
  private reduced: boolean;
  private readonly tier: "desktop" | "phone" | "low";
  private size = { w: 0, h: 0 };
  /** The star canvases' painted size (repainted only when the width changes or the height grows). */
  private starsFor = { w: 0, h: 0 };
  private shootingTimer = 0;
  private observer: IntersectionObserver | null = null;
  private resizeTimer = 0;
  private hoverFrame = 0;
  private readonly motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  constructor(
    private readonly root: HTMLElement,
    period: Period,
    private readonly opts: SkyEngineOptions,
  ) {
    const q = <T extends Element>(s: string) => root.querySelector<T>(s);
    this.layers = {
      clouds: q<HTMLCanvasElement>("[data-sky-clouds]"),
      stars: q("[data-sky-stars]"),
      starCanvases: [...root.querySelectorAll<HTMLCanvasElement>("[data-sky-stars] canvas")],
      sun: q("[data-sky-sun]"),
      rays: q("[data-sky-rays]"),
      moon: q("[data-sky-moon]"),
      moonCanvas: q<HTMLCanvasElement>("[data-sky-moon] canvas"),
      shooting: q("[data-sky-shooting]"),
    };
    this.keys = [...root.querySelectorAll<HTMLElement>("[data-sky-key]")];
    this.sunWarm = [...root.querySelectorAll<HTMLElement>("[data-sky-sun-warm]")];
    this.moonGlow = root.querySelector<HTMLElement>("[data-sky-moon-glow]");
    this.reduced = this.motionQuery.matches;
    const phone = window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
    const nav = navigator as Navigator & { deviceMemory?: number };
    const low = (navigator.hardwareConcurrency || 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
    this.tier = low ? "low" : phone ? "phone" : "desktop";
    this.phase = period === "night" ? 1 : 0;
    this.to = this.phase;
  }

  start() {
    const { clouds } = this.layers;
    if (clouds) {
      this.clouds = SkyClouds.create(clouds, this.tier === "desktop" ? 4 : 3);
      // The GPU can drop the context (driver reset, memory pressure, a backgrounded tab on a phone):
      // stop drawing, and rebuild the clouds when the browser hands it back.
      clouds.addEventListener("webglcontextlost", this.onContextLost);
      clouds.addEventListener("webglcontextrestored", this.onContextRestored);
    }
    if (!this.clouds) clouds?.style.setProperty("display", "none");
    this.measure();
    if (this.layers.moonCanvas) paintMoon(this.layers.moonCanvas);
    this.apply(this.phase);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOUR[this.phase < 0.5 ? "day" : "night"]);
    this.root.dataset.ready = "";
    window.addEventListener("resize", this.onResize);
    window.addEventListener("scroll", this.onScroll, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);
    document.addEventListener("click", this.onClick);
    document.addEventListener("pointermove", this.onPointerMove, { passive: true });
    this.motionQuery.addEventListener("change", this.onMotion);
    this.observeMain();
    this.onScroll();
    this.scheduleShootingStar();
    this.schedule();
  }

  /**
   * The intro film covers the sky while it plays: no work until the page below
   * it shows. Watches this page's #main; call again after a navigation (each
   * page renders its own), and a removed #main is swapped for the new one.
   */
  observeMain() {
    this.observer?.disconnect();
    this.observer = null;
    const main = document.querySelector("#main");
    this.visible = true;
    this.root.removeAttribute("data-paused");
    if (!main) return;
    this.observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => !e.target.isConnected)) {
        // The page changed under us (client-side navigation, an error reset): watch its new #main.
        queueMicrotask(() => this.observeMain());
        return;
      }
      this.visible = entries.some((e) => e.isIntersecting);
      this.root.toggleAttribute("data-paused", !this.visible);
      this.dirty = true;
      this.schedule();
    });
    this.observer.observe(main);
    this.dirty = true;
    this.schedule();
  }

  /** Change period: animated through sunset/twilight (or twilight/sunrise). */
  setPeriod(period: Period, animate = true) {
    const target = period === "night" ? 1 : 0;
    if (target === this.to && (this.phase === target || this.duration > 0)) return;
    this.from = this.phase;
    this.to = target;
    // A partial change (reversed half-way) takes a share of the full time.
    const span = Math.abs(target - this.phase);
    this.duration = !animate ? 0 : (this.reduced ? SKY.reducedTransitionMs : SKY.transitionMs) * span;
    this.startedAt = performance.now();
    if (this.duration > 0) this.html.dataset.skyChanging = "";
    if (this.duration === 0) {
      this.phase = target;
      this.apply(target);
    }
    this.dirty = true;
    this.schedule();
  }

  /** Current position on the day → night line. */
  get value() {
    return this.phase;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.hoverFrame);
    window.clearTimeout(this.shootingTimer);
    window.clearTimeout(this.resizeTimer);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("scroll", this.onScroll);
    document.removeEventListener("visibilitychange", this.onVisibility);
    document.removeEventListener("click", this.onClick);
    document.removeEventListener("pointermove", this.onPointerMove);
    this.motionQuery.removeEventListener("change", this.onMotion);
    this.layers.clouds?.removeEventListener("webglcontextlost", this.onContextLost);
    this.layers.clouds?.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.observer?.disconnect();
    // Not loseContext(): React may mount the same canvas again (StrictMode, a remount), and a lost context can't be reused.
    this.clouds?.release();
    this.clouds = null;
    document.body.style.removeProperty("cursor");
    delete this.html.dataset.skyChanging;
  }

  // ---------------------------------------------------------------------------
  // The phase → every layer
  // ---------------------------------------------------------------------------

  /**
   * Sun and moon centres (fractions of the screen) at a phase, and how much of
   * each is up. Reduced motion: they never travel (the sun at its day place,
   * the moon at its night place); only their visibility changes.
   */
  private bodies(p: number) {
    const sunUp = 1 - smooth(0.5, 0.66, p);
    const moonUp = smooth(0.42, 0.8, p);
    if (this.reduced) return { sun: SKY.sun.day, moon: SKY.moon.night, sunUp, moonUp };
    const set = easeInOut(clamp01(p / 0.62)); // the sun is down by early twilight
    const sun = {
      x: lerp(SKY.sun.day.x, SKY.sun.set.x, set),
      y: lerp(SKY.sun.day.y, SKY.sun.set.y, set) + smooth(0.55, 0.7, p) * 0.25,
    };
    const rise = easeInOut(clamp01((p - 0.35) / 0.65));
    const moon = { x: lerp(SKY.moon.low.x, SKY.moon.night.x, rise), y: lerp(SKY.moon.low.y, SKY.moon.night.y, rise) };
    return { sun, moon, sunUp, moonUp };
  }

  /**
   * The sky's colours for what follows it. Every frame of a change: only the
   * [data-sky-follow] elements (the bus photo's panel). The page root (html)
   * gets them only at rest: a custom property changed on html restyles the
   * WHOLE page, which every frame would cost smoothness.
   */
  private paint(c: ReturnType<typeof skyColors>, p: number, everywhere: boolean) {
    const targets: HTMLElement[] = [...document.querySelectorAll<HTMLElement>("[data-sky-follow]")];
    if (everywhere) targets.push(this.html);
    const vars: [string, string][] = [
      ["--sky-top", css(c.top)],
      ["--sky-mid", css(c.mid)],
      ["--sky-horizon", css(c.horizon)],
      ["--sky-light", css(c.light)],
      ["--night", p.toFixed(3)],
    ];
    for (const el of targets) for (const [k, v] of vars) el.style.setProperty(k, v);
  }

  private apply(p: number) {
    const c = skyColors(p);
    this.paint(c, p, this.duration === 0);
    // The page's theme (readable panels and text) switches halfway, under cover of the change.
    const theme = p < 0.5 ? "day" : "night";
    if (this.html.dataset.sky !== theme) this.flipTheme(theme);
    const { sun, moon, sunUp, moonUp } = this.bodies(p);
    const { sun: sunEl, rays, moon: moonEl, stars } = this.layers;
    // The gradient: each keyframe layer fades in over the one below as the phase passes it.
    this.keys.forEach((el, i) => {
      if (i === 0) return;
      const prev = SKY_KEYS[i - 1]?.at ?? 0;
      const at = SKY_KEYS[i]?.at ?? 1;
      el.style.opacity = clamp01((p - prev) / Math.max(0.0001, at - prev)).toFixed(3);
    });
    if (sunEl) {
      sunEl.style.setProperty("--x", String(sun.x));
      sunEl.style.setProperty("--y", String(sun.y));
      sunEl.style.opacity = sunUp.toFixed(3);
      const warm = smooth(0.15, 0.45, p).toFixed(3);
      for (const el of this.sunWarm) el.style.opacity = warm;
    }
    // Nothing turns or twinkles while it can't be seen (no compositor work for invisible layers).
    this.root.toggleAttribute("data-sunless", sunUp === 0);
    this.root.toggleAttribute("data-starry", p > 0.5);
    if (rays) rays.style.opacity = ((1 - smooth(0.3, 0.58, p)) * 0.55 + smooth(0.2, 0.42, p) * (1 - smooth(0.42, 0.6, p)) * 0.4).toFixed(3);
    if (moonEl) {
      moonEl.style.setProperty("--x", String(moon.x));
      moonEl.style.setProperty("--y", String(moon.y));
      // A pale daytime moon (clickable: it picks night), bright with a halo at night.
      moonEl.style.opacity = (0.32 + 0.68 * moonUp).toFixed(3);
      if (this.moonGlow) this.moonGlow.style.opacity = moonUp.toFixed(3);
    }
    if (stars) {
      // Painted the first time the sky heads for night (none of their memory by day).
      if (p > 0.4) this.ensureStars();
      stars.style.opacity = smooth(0.55, 0.95, p).toFixed(3);
    }
    this.uniforms = { colors: c, source: p < 0.55 ? sun : moon, glow: p < 0.55 ? 0.9 * sunUp : 0.5 * moonUp };
  }

  private uniforms: { colors: ReturnType<typeof skyColors>; source: { x: number; y: number }; glow: number } | null = null;

  /**
   * Day theme ↔ night theme for the page (light/dark glass and text). During
   * an animated change it crossfades: a View Transition snapshots the page,
   * flips, and blends the two pictures on the GPU (animating the colours of
   * every element instead drops frames). Without View Transitions, or with
   * reduced motion: an instant flip, at mid-twilight.
   */
  private flipTheme(theme: Period) {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const flip = () => {
      this.html.dataset.sky = theme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOUR[theme]);
    };
    if (this.duration > 0 && !this.reduced && this.visible && !document.hidden && doc.startViewTransition) doc.startViewTransition(flip);
    else flip();
  }

  /** Paint the star field if it isn't painted for this size yet. */
  private ensureStars() {
    const { starCanvases } = this.layers;
    if (!starCanvases.length) return;
    // A phone's toolbar showing/hiding changes the height: repaint only if it grew past what's painted.
    if (this.starsFor.w === this.size.w && this.starsFor.h >= this.size.h) return;
    paintStars(starCanvases, this.tier === "desktop" ? SKY.stars.desktop : SKY.stars.phone);
    this.starsFor = { ...this.size };
  }

  // ---------------------------------------------------------------------------
  // The frame loop: only while something changes or the wind blows
  // ---------------------------------------------------------------------------

  private readonly schedule = () => {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  };

  private readonly frame = (now: number) => {
    this.raf = 0;
    const changing = this.duration > 0;
    if (changing) {
      const t = clamp01((now - this.startedAt) / this.duration);
      this.phase = lerp(this.from, this.to, easeInOut(t));
      this.apply(this.phase);
      if (t >= 1) {
        this.duration = 0;
        this.phase = this.to;
        this.apply(this.phase); // at rest: the page root gets the final colours too
        delete this.html.dataset.skyChanging;
        this.scheduleShootingStar();
      }
      this.dirty = true;
    }
    const active = this.visible && !document.hidden;
    const drifting = !this.reduced;
    // The wind only blows while the clouds are on screen (a capped step: no jump after a pause).
    if (active && drifting) this.skyTime += Math.min(0.1, Math.max(0, (now - (this.lastFrame || now)) / 1000));
    this.lastFrame = now;
    if (active && this.clouds && this.uniforms) {
      const due = now - this.lastDraw >= 1000 / SKY.idleFps - 2;
      if (this.dirty || (drifting && due)) {
        const { colors, source, glow } = this.uniforms;
        this.clouds.draw({
          time: drifting ? this.skyTime : 0,
          scroll: this.reduced ? 0 : this.scroll,
          lit: colors.cloudLit,
          shade: colors.cloudShade,
          light: colors.light,
          opacity: colors.cloudOpacity,
          source,
          glow,
        });
        this.lastDraw = now;
        this.dirty = false;
      }
    }
    // Keep going while there's motion to show (a change, or the wind); otherwise sleep until poked.
    if (changing || (active && this.clouds && drifting)) this.schedule();
    else this.lastFrame = 0;
  };

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  private measure() {
    const r = this.root.getBoundingClientRect();
    this.size = { w: r.width, h: r.height };
    this.clouds?.resize(SKY.cloudScale[this.tier], SKY.cloudMaxPixels[this.tier]);
    if (this.starsFor.w || this.phase > 0.4) this.ensureStars();
    this.dirty = true;
  }

  private readonly onResize = () => {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      this.measure();
      this.schedule();
    }, 150);
  };

  private readonly onScroll = () => {
    // Scroll in screen heights: each cloud layer drifts by its own share of it (parallax).
    this.scroll = window.scrollY / Math.max(1, window.innerHeight);
    if (!this.reduced) {
      this.dirty = true;
      this.schedule();
    }
  };

  private readonly onVisibility = () => {
    this.dirty = true;
    this.schedule();
    if (!document.hidden) this.scheduleShootingStar();
  };

  private readonly onMotion = () => {
    this.reduced = this.motionQuery.matches;
    this.apply(this.phase); // the sun and moon go to (or leave) their fixed places
    this.dirty = true;
    this.schedule();
  };

  private readonly onContextLost = (e: Event) => {
    e.preventDefault(); // ask for it back
    this.clouds = null;
  };

  private readonly onContextRestored = () => {
    const { clouds } = this.layers;
    if (!clouds) return;
    this.clouds = SkyClouds.create(clouds, this.tier === "desktop" ? 4 : 3);
    this.clouds?.resize(SKY.cloudScale[this.tier], SKY.cloudMaxPixels[this.tier]);
    this.dirty = true;
    this.schedule();
  };

  /** Over the sun or the moon, on the bare sky (not on content)? */
  private bodyAt(x: number, y: number, target: EventTarget | null): Period | null {
    if (!(target instanceof Element)) return null;
    // Only the sky itself: anything with content, controls or a panel keeps its own clicks.
    if (target.closest("a,button,input,select,textarea,label,summary,details,dialog,header,footer,[data-panel],p,h1,h2,h3,h4,li,dt,dd,img,picture,video,svg,canvas,#top")) return null;
    const { sun, moon, sunUp, moonUp } = this.bodies(this.phase);
    const hit = (b: { x: number; y: number }, radius: number) => Math.hypot(x - b.x * this.size.w, y - b.y * this.size.h) <= radius;
    const big = this.size.w >= 768;
    if (sunUp > 0.4 && hit(sun, big ? 70 : 50)) return "day";
    if (hit(moon, big ? 60 : 44) && moonUp + 0.32 > 0.3) return "night";
    return null;
  }

  private readonly onClick = (e: MouseEvent) => {
    if (!this.visible) return;
    const period = this.bodyAt(e.clientX, e.clientY, e.target);
    if (period) this.opts.onPick(period);
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || this.hoverFrame) return;
    const { clientX, clientY, target } = e;
    this.hoverFrame = requestAnimationFrame(() => {
      this.hoverFrame = 0;
      const over = this.visible && this.bodyAt(clientX, clientY, target) !== null;
      if (over) document.body.style.cursor = "pointer";
      else document.body.style.removeProperty("cursor");
    });
  };

  /** Now and then, at night, a shooting star crosses the upper sky. */
  private scheduleShootingStar() {
    window.clearTimeout(this.shootingTimer);
    const [min, max] = SKY.shootingStarEvery;
    this.shootingTimer = window.setTimeout(() => {
      this.shootingStar();
      this.scheduleShootingStar();
    }, (min + Math.random() * (max - min)) * 1000);
  }

  private shootingStar() {
    const el = this.layers.shooting;
    if (!el || this.reduced || !this.visible || document.hidden || this.phase < 0.9 || !el.animate) return;
    const { w, h } = this.size;
    const leftward = Math.random() < 0.5;
    const angle = (leftward ? 180 + 22 + Math.random() * 14 : -22 - Math.random() * 14) * (Math.PI / 180);
    const x = (leftward ? 0.45 + Math.random() * 0.5 : 0.05 + Math.random() * 0.5) * w;
    const y = (0.04 + Math.random() * 0.3) * h;
    const travel = Math.min(w, h) * (0.35 + Math.random() * 0.25);
    const deg = (angle * 180) / Math.PI;
    const dx = Math.cos(angle) * travel;
    const dy = -Math.sin(angle) * travel;
    el.animate(
      [
        { transform: `translate(${x}px, ${y}px) rotate(${-deg}deg) scaleX(0.2)`, opacity: 0 },
        { transform: `translate(${x + dx * 0.25}px, ${y + dy * 0.25}px) rotate(${-deg}deg) scaleX(1)`, opacity: 1, offset: 0.25 },
        { transform: `translate(${x + dx}px, ${y + dy}px) rotate(${-deg}deg) scaleX(0.6)`, opacity: 0 },
      ],
      { duration: 900 + Math.random() * 500, easing: "cubic-bezier(0.3, 0, 0.6, 1)" },
    );
  }
}
