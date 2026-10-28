import { SKY, SKY_KEYS, type Period } from "@/content/sky";
import { css, skyColors } from "./sky-color";
import { SkyClouds } from "./sky-clouds";
import { paintMoon, paintStars } from "./sky-paint";

/**
 * Runs the living sky behind the site. Everything follows ONE number, the
 * phase: 0 = day, 1 = night. Changing period animates it (day → sunset →
 * twilight → night, or back through sunrise), and every layer reads it: the
 * gradient, the sun (it sets and rises), the moon, the stars, the rays, the
 * clouds' colours and light, the bus photos' grade (--night), and the page's
 * day or night theme (html[data-sky], switched halfway).
 *
 * Cost control: the clouds are the only per-frame work (a small shader at a
 * fraction of the resolution), drawn at SKY.idleFps while only the wind moves
 * them and at full rate while scrolling or changing; nothing is drawn while
 * the intro film covers the sky or the tab is hidden. Reduced motion: no
 * drift, no parallax, no twinkle, no shooting stars; a period change is a
 * short crossfade. No React: nothing re-renders.
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
  private dirty = true;
  private scroll = 0;
  private visible = true;
  private reduced: boolean;
  private readonly tier: "desktop" | "phone" | "low";
  private size = { w: 0, h: 0 };
  private shootingTimer = 0;
  private observer: IntersectionObserver | null = null;
  private resizeTimer = 0;
  private hoverFrame = 0;
  private readonly motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  private readonly startTime = performance.now();

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
    if (clouds) this.clouds = SkyClouds.create(clouds, this.tier === "desktop" ? 4 : 3);
    if (!this.clouds) clouds?.remove();
    this.measure();
    if (this.layers.moonCanvas) paintMoon(this.layers.moonCanvas);
    this.apply(this.phase);
    this.root.dataset.ready = "";
    window.addEventListener("resize", this.onResize);
    window.addEventListener("scroll", this.onScroll, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);
    document.addEventListener("click", this.onClick);
    document.addEventListener("pointermove", this.onPointerMove, { passive: true });
    this.motionQuery.addEventListener("change", this.onMotion);
    // The intro film covers the sky while it plays: no work until the page below it shows.
    const main = document.querySelector("#main");
    if (main) {
      this.observer = new IntersectionObserver((entries) => {
        this.visible = entries.some((e) => e.isIntersecting);
        this.root.toggleAttribute("data-paused", !this.visible);
        this.dirty = true;
        this.schedule();
      });
      this.observer.observe(main);
    }
    this.onScroll();
    this.scheduleShootingStar();
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

  /** Current position on the day → night line (tests and the UI read it). */
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
    this.observer?.disconnect();
    this.clouds?.destroy();
    document.body.style.removeProperty("cursor");
    delete this.html.dataset.skyChanging;
  }

  // ---------------------------------------------------------------------------
  // The phase → every layer
  // ---------------------------------------------------------------------------

  /** Sun and moon centres (fractions of the screen) at a phase. */
  private bodies(p: number) {
    const set = easeInOut(clamp01(p / 0.62)); // the sun is down by early twilight
    const sun = {
      x: lerp(SKY.sun.day.x, SKY.sun.set.x, set),
      y: lerp(SKY.sun.day.y, SKY.sun.set.y, set) + smooth(0.55, 0.7, p) * 0.25,
    };
    const rise = easeInOut(clamp01((p - 0.35) / 0.65));
    const moon = { x: lerp(SKY.moon.low.x, SKY.moon.night.x, rise), y: lerp(SKY.moon.low.y, SKY.moon.night.y, rise) };
    return { sun, moon, sunUp: 1 - smooth(0.5, 0.66, p), moonUp: smooth(0.42, 0.8, p) };
  }

  /**
   * Where the sky's colours go. Every frame of a change: only the sky layer and
   * the few elements that follow it (data-sky-follow: the bus photo's panel).
   * The page root (html) gets them only at rest: a custom property changed on
   * html makes the browser restyle the WHOLE page, which every frame would cost
   * smoothness.
   */
  private paint(c: ReturnType<typeof skyColors>, p: number, everywhere: boolean) {
    const targets: HTMLElement[] = [this.root, ...document.querySelectorAll<HTMLElement>("[data-sky-follow]")];
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
    if (rays) rays.style.opacity = ((1 - smooth(0.3, 0.58, p)) * 0.55 + smooth(0.2, 0.42, p) * (1 - smooth(0.42, 0.6, p)) * 0.4).toFixed(3);
    if (moonEl) {
      moonEl.style.setProperty("--x", String(moon.x));
      moonEl.style.setProperty("--y", String(moon.y));
      // A pale daytime moon (clickable: it picks night), bright with a halo at night.
      moonEl.style.opacity = (0.32 + 0.68 * moonUp).toFixed(3);
      if (this.moonGlow) this.moonGlow.style.opacity = moonUp.toFixed(3);
    }
    if (stars) stars.style.opacity = smooth(0.55, 0.95, p).toFixed(3);
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
  private flipTheme(theme: "day" | "night") {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const flip = () => {
      this.html.dataset.sky = theme;
    };
    if (this.duration > 0 && !this.reduced && this.visible && !document.hidden && doc.startViewTransition) doc.startViewTransition(flip);
    else flip();
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
    if (active && this.clouds && this.uniforms) {
      const drifting = !this.reduced;
      const due = now - this.lastDraw >= 1000 / SKY.idleFps - 2;
      if (this.dirty || (drifting && due)) {
        const { colors, source, glow } = this.uniforms;
        this.clouds.draw({
          time: drifting ? (now - this.startTime) / 1000 : 0,
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
    if (changing || (active && this.clouds && !this.reduced)) this.schedule();
  };

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  private measure() {
    const r = this.root.getBoundingClientRect();
    this.size = { w: r.width, h: r.height };
    this.clouds?.resize(SKY.cloudScale[this.tier]);
    if (this.layers.starCanvases.length) paintStars(this.layers.starCanvases, this.tier === "desktop" ? SKY.stars.desktop : SKY.stars.phone);
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
