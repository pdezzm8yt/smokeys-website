"use client";

import { ChevronDown, RotateCcw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { site } from "@/content/site";
import { INTRO } from "./intro-config";
import type { IntroEngine, IntroOptions } from "./intro-engine";
import { DustCloud } from "./parts";
import { useIntroInput } from "./use-intro-input";

/** "intro" while the intro owns the screen; "bus" once the site is revealed. */
type Stage = "intro" | "bus";
/** Where the intro is in its life. Kept in a ref: it changes mid-animation and must not re-render. */
type Phase = "loading" | "ready" | "playing" | "done";

const SEEN_KEY = "smokeys:intro-seen";

type IntroSequenceProps = {
  real: ReactNode;
  cartoon: ReactNode;
  bus: ReactNode;
  /** Width / height of the bus image, so it can be sized to the space under the headline. */
  busAspect: number;
  /** Where "Explore" scrolls to once the bus is revealed. */
  exploreHref: string;
};

type EngineModule = typeof import("./intro-engine");
let engineModule: Promise<EngineModule> | null = null;

/**
 * GSAP and the engine load on demand, in parallel with the preload: they are
 * never on the hydration path, and visitors who skip straight to the bus only
 * fetch them in idle time (for Replay).
 */
function loadEngine() {
  engineModule ??= import("./intro-engine").catch((error: unknown) => {
    engineModule = null; // a later attempt (Replay) may retry
    throw error;
  });
  return engineModule;
}

const html = () => document.documentElement;

function introOptions(): IntroOptions {
  // Phones get lighter effects through CSS (fewer particles/puffs), not a JS flag.
  return { reduce: window.matchMedia("(prefers-reduced-motion: reduce)").matches };
}

function setScrollLock(locked: boolean) {
  if (locked) html().dataset.scrollLock = "";
  else delete html().dataset.scrollLock;
}

function whenIdle(fn: () => void) {
  if ("requestIdleCallback" in window) window.requestIdleCallback(fn, { timeout: 2000 });
  else setTimeout(fn, 200);
}

/**
 * Decode every image inside `scopes` (<img>s plus inline-style backgrounds:
 * parallax strips, dust sprites, the bus mask) and the display font, so nothing
 * pops in late. Resolves when all are ready or after the timeout.
 */
async function preload(scopes: Iterable<Element>, onProgress?: (fraction: number) => void) {
  const urls = new Set<string>();
  const imgs: HTMLImageElement[] = [];
  for (const scope of scopes) {
    imgs.push(...scope.querySelectorAll("img"));
    for (const el of scope.querySelectorAll<HTMLElement>("[style*='url(']")) {
      for (const m of (el.getAttribute("style") ?? "").matchAll(/url\(["']?([^"')]+)["']?\)/g)) if (m[1]) urls.add(m[1]);
    }
  }
  const total = imgs.length + urls.size + 1;
  let done = 0;
  const tick = () => onProgress?.(++done / total);
  const tasks = [
    ...imgs.map((img) => img.decode().catch(() => {}).finally(tick)),
    ...[...urls].map((src) => {
      const img = new Image();
      img.src = src;
      return img.decode().catch(() => {}).finally(tick);
    }),
    document.fonts.ready.then(() => {}).catch(() => {}).finally(tick),
  ];
  await Promise.race([Promise.all(tasks), new Promise((resolve) => window.setTimeout(resolve, INTRO.preloadTimeoutMs))]);
}

/** Scene 1: what the loader waits for. Everything else decodes while scene 1 idles. */
const FIRST_SCENE = '[data-scene="real"]';
const LATER_SCENES = '[data-scene="cartoon"], [data-scene="bus"], [data-dust]';

/**
 * The signature intro: real roadrunner → cartoon roadrunner → black party bus,
 * played as ONE continuous GSAP timeline (see ./intro-engine). This component
 * only handles the life cycle around it: preload + branded loader, input,
 * skip/replay, scroll lock and focus. Nothing here re-renders while the shot
 * plays; React state changes only when the reveal lands.
 * Scenes are Server Components passed in as slots, so their markup costs no client JS.
 */
export function IntroSequence({ real, cartoon, bus, busAspect, exploreHref }: IntroSequenceProps) {
  const rootRef = useRef<HTMLElement>(null);
  const [stage, setStage] = useState<Stage>("intro");
  const phase = useRef<Phase>("loading");
  const engine = useRef<IntroEngine | null>(null);
  /**
   * What a start request waits on. `tapped`: the visitor asked to go. `assets`:
   * the cartoon/bus/dust images are decoded. `entered`: the loader is gone (and,
   * for a tap made during the loader, the real bird has been seen running for a beat).
   */
  const gate = useRef({ tapped: false, assets: false, entered: false });
  const cooldownUntil = useRef(0);
  const unlockTimer = useRef<number | undefined>(undefined);
  const continueRef = useRef<HTMLButtonElement>(null);
  /** Move focus to the headline once React has committed the reveal. */
  const focusHeadline = useRef(false);
  /** Replay was pressed: set the intro up again once the "intro" controls are committed. */
  const pendingReplay = useRef<EngineModule | null>(null);

  const createEngine = useCallback((mod: EngineModule) => {
    engine.current?.destroy();
    engine.current = rootRef.current ? new mod.IntroEngine(rootRef.current, introOptions()) : null;
    return engine.current;
  }, []);

  /** Branding is landing: bring the header in with it (a cheap, header-only style change). */
  const revealHeader = useCallback(() => {
    html().dataset.introStage = "bus";
  }, []);

  /**
   * The site is revealed: hand the page back. Releasing the scroll lock makes
   * the browser lay out the whole page, so it waits until the shot is finished
   * and the browser is idle (no hitch while anything is still moving).
   */
  const release = useCallback(() => {
    revealHeader();
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* storage blocked: the intro simply replays next visit */
    }
    window.clearTimeout(unlockTimer.current);
    unlockTimer.current = window.setTimeout(() => {
      const unlock = () => setScrollLock(false);
      if ("requestIdleCallback" in window) window.requestIdleCallback(unlock, { timeout: 500 });
      else unlock();
    }, INTRO.unlockDelayMs);
  }, [revealHeader]);

  const land = useCallback(
    (moveFocus: boolean) => {
      phase.current = "done";
      cooldownUntil.current = performance.now() + INTRO.cooldownMs;
      focusHeadline.current = moveFocus;
      release();
      setStage("bus");
      whenIdle(() => void loadEngine().catch(() => {})); // warm Replay
    },
    [release],
  );

  const start = useCallback(() => {
    if (phase.current === "playing" || phase.current === "done") return;
    const g = gate.current;
    if (phase.current === "loading" || !g.assets || !g.entered) {
      g.tapped = true; // go as soon as everything is ready
      if (phase.current === "ready" && g.entered) html().dataset.introWaiting = ""; // the prompt shows "Loading…"
      return;
    }
    phase.current = "playing";
    g.tapped = false;
    delete html().dataset.introWaiting;
    // The prompt is fading out: park focus on the stage (it still hears ↓/Space, and
    // a repeated Enter can't land on Skip).
    if (document.activeElement === continueRef.current) rootRef.current?.focus({ preventScroll: true });
    engine.current?.play({
      onBrand: revealHeader,
      onComplete: () => {
        if (phase.current === "playing") land(true); // (not after a Skip, which already landed)
      },
    });
  }, [land, revealHeader]);

  const flushStart = useCallback(() => {
    if (gate.current.tapped) start();
  }, [start]);

  /** Decode the cartoon, bus and dust-cloud images behind the idling scene 1. */
  const loadRest = useCallback(
    (root: HTMLElement) => {
      const eng = engine.current;
      html().dataset.introArmed = "full"; // the dust-cloud sprites may load now
      void preload(root.querySelectorAll(LATER_SCENES)).then(() => {
        if (engine.current !== eng) return; // superseded (Replay / unmount)
        gate.current.assets = true;
        flushStart();
      });
    },
    [flushStart],
  );

  /** Jump to the finished reveal (Skip, in-page links). */
  const finish = useCallback(
    (duration = 0.35, moveFocus = true) => {
      if (phase.current === "done") return;
      html().removeAttribute("data-intro-loading");
      delete html().dataset.introWaiting;
      if (engine.current) engine.current.finish(duration);
      else html().dataset.intro = "seen"; // engine not loaded yet: CSS shows the finished reveal
      land(moveFocus);
    },
    [land],
  );

  const replay = useCallback(async () => {
    if (performance.now() < cooldownUntil.current) return; // e.g. a double-press that just skipped
    let mod: EngineModule;
    try {
      mod = await loadEngine();
    } catch {
      return; // offline: stay on the bus
    }
    if (phase.current !== "done") return;
    pendingReplay.current = mod;
    setStage("intro"); // the layout effect below resets the stage in the same commit
  }, []);

  // Mount: skip straight to the site, or preload scene 1 behind the branded loader.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (html().dataset.intro === "seen" || window.location.hash || window.scrollY > 40) {
      // Browser-only state the server can't see (session flag, hash, restored scroll):
      // CSS shows the finished reveal, so this can't flash.
      html().dataset.intro = "seen";
      html().removeAttribute("data-intro-loading");
      // Syncing from browser-only state that the server render can't know (it always renders "intro").
      // eslint-disable-next-line react-hooks/set-state-in-effect
      land(false);
      return;
    }
    html().dataset.introStage = "real";
    html().dataset.introLoading = "js"; // JS owns the loader now (the boot script's failsafe stands down)
    html().dataset.introArmed = "idle";
    setScrollLock(true);
    const progress = root.querySelector<HTMLElement>("[data-intro-progress]");

    let cancelled = false;
    Promise.all([
      loadEngine(),
      preload(root.querySelectorAll(FIRST_SCENE), (f) => {
        if (progress) progress.style.transform = `scaleX(${f})`;
      }),
    ])
      .then(([mod]) => {
        if (cancelled || phase.current !== "loading") return;
        // A tap during the loader (or even before hydration, caught by the boot script).
        const queued = gate.current.tapped || html().hasAttribute("data-intro-queued");
        html().removeAttribute("data-intro-queued");
        gate.current = { tapped: queued, assets: false, entered: !queued };
        const eng = createEngine(mod);
        if (!eng) return;
        eng.startIdle();
        phase.current = "ready";
        loadRest(root);
        void eng.enter(queued).then(() => {
          if (cancelled || engine.current !== eng) return;
          html().removeAttribute("data-intro-loading");
          if (!queued) return;
          // Let the real bird be seen running for a beat before the queued tap starts the shot.
          window.setTimeout(() => {
            if (cancelled || engine.current !== eng) return;
            gate.current.entered = true;
            flushStart();
          }, 350);
        });
      })
      .catch(() => {
        if (!cancelled) finish(0, false); // the engine couldn't load (offline): show the site
      });
    return () => {
      cancelled = true;
    };
  }, [createEngine, finish, flushStart, land, loadRest]);

  // Unmount (e.g. client navigation away mid-intro): never leave the page locked or the header hidden.
  useEffect(
    () => () => {
      engine.current?.destroy();
      engine.current = null;
      window.clearTimeout(unlockTimer.current);
      setScrollLock(false);
      delete html().dataset.introStage;
      delete html().dataset.introWaiting;
      html().removeAttribute("data-intro-loading");
      html().removeAttribute("data-intro-queued");
    },
    [],
  );

  // Replay: reset the stage before the browser paints the new "intro" controls.
  useLayoutEffect(() => {
    const mod = pendingReplay.current;
    const root = rootRef.current;
    if (stage !== "intro" || !mod || !root) return;
    pendingReplay.current = null;
    window.clearTimeout(unlockTimer.current);
    delete html().dataset.intro;
    try {
      sessionStorage.removeItem(SEEN_KEY);
    } catch {
      /* ignore */
    }
    window.scrollTo({ top: 0, behavior: "instant" });
    setScrollLock(true);
    html().dataset.introStage = "real";
    gate.current = { tapped: false, assets: false, entered: true };
    createEngine(mod)?.startIdle(); // reverts the finished shot, then scene 1 idles again
    loadRest(root);
    phase.current = "ready";
    continueRef.current?.focus();
  }, [stage, createEngine, loadRest]);

  // After the reveal commits (the CTAs are no longer inert), move focus to the headline.
  useEffect(() => {
    if (stage !== "bus" || !focusHeadline.current) return;
    focusHeadline.current = false;
    const active = document.activeElement;
    if (!active || active === document.body || rootRef.current?.contains(active)) {
      rootRef.current?.querySelector<HTMLElement>("#intro-title")?.focus({ preventScroll: true });
    }
  }, [stage]);

  // The hero CTAs stay out of the Tab order until the reveal. Only the buttons are
  // inert: the H1 stays in the accessibility tree for screen-reader users throughout.
  useEffect(() => {
    const ctas = rootRef.current?.querySelector<HTMLElement>("[data-bus-ctas]");
    if (ctas) ctas.inert = stage !== "bus";
  }, [stage]);

  // Size the bus to the space left under the headline + CTAs (see --w-bus in globals.css).
  // Layout effect: measured before the first client paint, so the bus never visibly resizes.
  useLayoutEffect(() => {
    const section = rootRef.current;
    const copy = section?.querySelector<HTMLElement>("[data-bus-copyblock]");
    if (!section || !copy) return;
    const measure = () => {
      const bottom = copy.getBoundingClientRect().bottom - section.getBoundingClientRect().top;
      section.style.setProperty("--copy-bottom", `${Math.ceil(bottom)}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(copy);
    ro.observe(section);
    return () => ro.disconnect();
  }, []);

  useIntroInput({
    scope: rootRef,
    active: stage !== "bus",
    onAdvance: start,
    // Release the lock now, before the browser follows the anchor / keeps scrolling.
    onSkip: () => {
      window.clearTimeout(unlockTimer.current);
      setScrollLock(false);
      finish(0, false);
    },
  });

  const onStageClick = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest("a, button")) return;
    start();
  };

  const playing = stage !== "bus";

  return (
    <section
      ref={rootRef}
      id="top"
      aria-label="Smokey's intro"
      data-stage={stage}
      onClick={onStageClick}
      style={{ "--bus-aspect": busAspect } as CSSProperties}
      tabIndex={-1}
      className="intro-stage relative isolate h-svh w-full cursor-pointer overflow-hidden bg-black outline-none select-none data-[stage=bus]:cursor-auto"
    >
      {/* Scenes, bottom to top (visibility is driven by the timeline) */}
      <div data-scene="real" className="absolute inset-0" aria-hidden="true">
        {real}
      </div>
      <div data-scene="cartoon" className="invisible absolute inset-0 opacity-0" aria-hidden="true">
        {cartoon}
      </div>
      <div data-scene="bus" className={cn("absolute inset-0 opacity-0", playing && "pointer-events-none")}>
        {bus}
      </div>

      {/* Transition effects */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        <div data-fx="haze" className="invisible absolute inset-0 bg-[radial-gradient(circle_at_50%_72%,#ecd6b2_0%,#d2b089_45%,#a9845f_100%)] opacity-0" />
        <DustCloud />
        <div
          data-fx="flash"
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_72%,#fffaf0_0%,rgb(255_222_168/0.92)_35%,rgb(255_166_96/0.65)_75%)] opacity-0"
        />
      </div>

      {/* Branded loader while scene 1 decodes (shown only when JS set data-intro-loading) */}
      <div data-intro-loader aria-hidden="true" className="absolute inset-0 z-40 hidden flex-col items-center justify-center gap-5 bg-[#0b0a10]">
        <p className="font-display text-sm font-bold tracking-[0.6em] text-white/80">{site.name.toUpperCase()}</p>
        <div className="h-0.5 w-40 overflow-hidden rounded-full bg-white/10">
          <div data-intro-progress className="h-full origin-left scale-x-0 bg-primary transition-transform duration-200" />
        </div>
      </div>

      {/* Controls (stable keys: Skip must never be recycled into Replay under the user's focus) */}
      {playing ? (
        <>
          <button
            key="continue"
            ref={continueRef}
            type="button"
            data-intro-hint="continue"
            onClick={start}
            className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-30 min-h-11 -translate-x-1/2 rounded-full bg-black/40 px-6 py-2 text-sm font-semibold tracking-wide whitespace-nowrap text-white ring-1 ring-white/25 backdrop-blur-md transition-colors hover:bg-black/60"
          >
            <span data-label className="pointer-coarse:hidden">
              Click to continue
            </span>
            <span data-label className="hidden pointer-coarse:inline">
              Tap to continue
            </span>
            <span data-waiting className="hidden">
              Loading…
            </span>
          </button>
          <button
            key="skip"
            type="button"
            data-intro-hint="skip"
            onClick={() => finish()}
            className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 z-50 min-h-11 rounded-full bg-black/40 px-4 text-xs font-semibold tracking-wider text-white/85 uppercase ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-black/60 hover:text-white"
          >
            Skip intro
          </button>
        </>
      ) : (
        <>
          <a
            key="explore"
            href={exploreHref}
            className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-30 flex min-h-11 -translate-x-1/2 flex-col items-center gap-0.5 px-4 text-xs font-semibold tracking-[0.2em] text-white/70 uppercase transition-colors hover:text-white short:hidden"
          >
            Explore
            <ChevronDown aria-hidden="true" className="size-5 motion-safe:animate-pulse-soft" />
          </a>
          <button
            key="replay"
            type="button"
            onClick={() => void replay()}
            className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-30 flex min-h-11 items-center gap-2 rounded-full px-3 text-xs font-medium text-white/60 transition-colors hover:text-white short:right-4 short:left-auto"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Replay intro
          </button>
        </>
      )}
    </section>
  );
}
