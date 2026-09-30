"use client";

import { ChevronDown, RotateCcw } from "lucide-react";
import { stagger, useAnimate, type AnimationPlaybackControls, type AnimationSequence } from "motion/react";
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ease } from "@/lib/motion";

type Stage = "real" | "cartoon" | "bus";

const SEEN_KEY = "smokeys:intro-seen";
/** Ignore wheel/keys this long after a scene lands (trackpad inertia). */
const COOLDOWN_MS = 700;
/** The mascot scene is a beat, not a stop: it rolls on by itself. */
const CARTOON_HOLD_MS = 1500;

const BUS_PARTS = "[data-bus-body], [data-bus-headlight], [data-bus-glow], [data-bus-light], [data-bus-copy]";

type IntroSequenceProps = {
  real: ReactNode;
  cartoon: ReactNode;
  bus: ReactNode;
  /** Where "Explore" scrolls to once the bus is revealed. */
  exploreHref: string;
};

const html = () => document.documentElement;
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Phones, touch-first devices and Data Saver get the cheaper effects (no live blur). */
const isLite = () =>
  window.matchMedia("(max-width: 767px), (pointer: coarse)").matches ||
  Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);

function setScrollLock(locked: boolean) {
  if (locked) html().dataset.scrollLock = "";
  else delete html().dataset.scrollLock;
}

/**
 * The signature Roadrunner → Smokey → Party Bus intro.
 *
 * One pinned full-screen stage with three stacked scene layers. Any "advance"
 * intent (click, tap, wheel, swipe up, Space/Enter/↓) plays a fixed-length
 * Motion timeline to the next scene. Timed rather than scroll-scrubbed so the
 * speed gags always land at full speed. Scenes are Server Components passed in
 * as slots, so their markup costs no client JS.
 */
export function IntroSequence({ real, cartoon, bus, exploreHref }: IntroSequenceProps) {
  const [scope, animate] = useAnimate<HTMLElement>();
  const [stage, setStage] = useState<Stage>("real");
  const stageRef = useRef<Stage>("real");
  const busyRef = useRef(false);
  const cooldownUntil = useRef(0);
  const controlsRef = useRef<AnimationPlaybackControls | null>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  const commit = useCallback((next: Stage) => {
    stageRef.current = next;
    busyRef.current = false;
    cooldownUntil.current = performance.now() + COOLDOWN_MS;
    html().dataset.introStage = next;
    setStage(next);
    if (next === "bus") {
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* storage blocked: the intro simply replays next visit */
      }
      // Let trackpad momentum die out before the page can scroll.
      window.setTimeout(() => setScrollLock(false), 450);
    }
  }, []);

  /** Aim the camera push at the bird's head so the mascot match-cuts in its place. */
  const aimCamera = useCallback(() => {
    const root = scope.current;
    const camera = root?.querySelector<HTMLElement>("[data-camera]");
    const target = root?.querySelector("[data-zoom-target]");
    if (!camera) return;
    if (target) {
      const t = target.getBoundingClientRect();
      const c = camera.getBoundingClientRect();
      camera.style.transformOrigin = `${t.left + t.width / 2 - c.left}px ${t.top + t.height / 2 - c.top}px`;
    } else {
      const { focusX = "50", focusY = "45" } = camera.dataset;
      camera.style.transformOrigin = `${focusX}% ${focusY}%`;
    }
  }, [scope]);

  const playToCartoon = useCallback(async () => {
    busyRef.current = true;
    aimCamera();
    const reduce = prefersReducedMotion();
    const lite = isLite();

    const sequence: AnimationSequence = reduce
      ? [
          ['[data-scene="real"]', { opacity: 0 }, { duration: 0.45 }],
          ['[data-scene="cartoon"]', { opacity: 1 }, { duration: 0.45, at: "<" }],
          ["[data-cartoon-copy]", { opacity: 1 }, { duration: 0.3 }],
        ]
      : [
          // Camera pushes in on the bird, accelerating.
          ["[data-camera]", lite ? { scale: 3.4 } : { scale: 3.4, filter: "blur(10px)" }, { duration: 0.62, ease: ease.exit }],
          ['[data-fx="speedlines"]', { opacity: [0, 1, 0], scale: [0.7, 1.6] }, { duration: 0.7, at: 0.2 }],
          ['[data-fx="flash"]', { opacity: [0, 0.95, 0] }, { duration: 0.42, at: 0.46 }],
          // Hard cut hidden inside the flash.
          ['[data-scene="real"]', { opacity: 0 }, { duration: 0.08, at: 0.6 }],
          ['[data-scene="cartoon"]', { opacity: 1 }, { duration: 0.08, at: 0.6 }],
          ["[data-cartoon-bg]", { scale: [1.5, 1] }, { duration: 0.6, at: 0.6, ease: ease.enter }],
          // Squash-and-stretch pop.
          ["[data-mascot]", { scale: [0.25, 1.18, 0.95, 1], rotate: [-10, 4, 0] }, { duration: 0.6, at: 0.62, ease: "easeOut" }],
          ["[data-cartoon-copy]", { opacity: [0, 1], y: [18, 0] }, { duration: 0.35, at: 1.0, ease: ease.enter }],
        ];

    controlsRef.current = animate(sequence);
    await controlsRef.current;
    if (stageRef.current === "real") commit("cartoon");
  }, [aimCamera, animate, commit]);

  const primeBus = useCallback(() => {
    // Hide the bus parts before its scene becomes visible so the reveal starts from darkness.
    animate(BUS_PARTS, { opacity: 0 }, { duration: 0 });
  }, [animate]);

  const playToBus = useCallback(async () => {
    busyRef.current = true;
    const reduce = prefersReducedMotion();
    primeBus();
    const dash = window.innerWidth * 1.3;

    const sequence: AnimationSequence = reduce
      ? [
          ['[data-scene="cartoon"]', { opacity: 0 }, { duration: 0.45 }],
          ['[data-scene="bus"]', { opacity: 1 }, { duration: 0.45, at: "<" }],
          [BUS_PARTS, { opacity: 1 }, { duration: 0.45, at: "<" }],
        ]
      : [
          ["[data-cartoon-copy]", { opacity: 0 }, { duration: 0.15 }],
          // Anticipation, then gone.
          ["[data-mascot]", { x: -36, scaleX: 0.88 }, { duration: 0.16, ease: "easeOut", at: 0 }],
          ["[data-mascot]", { x: dash, scaleX: 1.6 }, { duration: 0.4, ease: ease.exit }],
          ['[data-fx="trail"]', { opacity: [0, 1], scaleX: [0, 1] }, { duration: 0.34, at: "<" }],
          // Dust cloud swallows the frame and acts as the wipe.
          ['[data-fx="smoke"]', { opacity: [0, 1], scale: [0.5, 2.2] }, { duration: 0.55, at: 0.32 }],
          ['[data-scene="cartoon"]', { opacity: 0 }, { duration: 0.2, at: 0.72 }],
          ['[data-fx="trail"]', { opacity: 0 }, { duration: 0.2, at: 0.72 }],
          ['[data-scene="bus"]', { opacity: 1 }, { duration: 0.01, at: 0.82 }],
          ['[data-fx="smoke"]', { opacity: 0 }, { duration: 0.7, at: 0.9 }],
          // Lights first, then the bus rolls out of the dark.
          ["[data-bus-headlight]", { opacity: [0, 1, 0.9], scale: [0.3, 1.25, 1] }, { duration: 0.55, at: 1.0 }],
          ["[data-bus-body]", { opacity: [0, 1], x: [-80, 0] }, { duration: 0.8, at: 1.05, ease: ease.enter }],
          ["[data-bus-glow]", { opacity: [0, 1] }, { duration: 0.5, at: 1.5 }],
          ["[data-bus-light]", { opacity: [0, 1] }, { duration: 0.22, at: 1.55, delay: stagger(0.07) }],
          ["[data-bus-copy]", { opacity: [0, 1], y: [24, 0] }, { duration: 0.5, at: 1.8, delay: stagger(0.09), ease: ease.enter }],
        ];

    controlsRef.current = animate(sequence);
    await controlsRef.current;
    if (stageRef.current === "cartoon") commit("bus");
  }, [animate, commit, primeBus]);

  /** Jump straight to the finished bus scene (Skip, deep links, returning visitors). */
  const finish = useCallback(
    (duration = 0.35) => {
      controlsRef.current?.stop();
      controlsRef.current = null;
      animate([
        ['[data-scene="real"]', { opacity: 0 }, { duration }],
        ['[data-scene="cartoon"]', { opacity: 0 }, { duration, at: 0 }],
        ['[data-scene="bus"]', { opacity: 1 }, { duration, at: 0 }],
        ["[data-fx]", { opacity: 0 }, { duration, at: 0 }],
        [BUS_PARTS, { opacity: 1, x: 0, y: 0, scale: 1 }, { duration, at: 0 }],
      ]);
      commit("bus");
    },
    [animate, commit],
  );

  const advance = useCallback(() => {
    if (busyRef.current || performance.now() < cooldownUntil.current) return;
    if (stageRef.current === "real") void playToCartoon();
    else if (stageRef.current === "cartoon") void playToBus();
  }, [playToBus, playToCartoon]);

  const replay = useCallback(() => {
    controlsRef.current?.stop();
    delete html().dataset.intro;
    try {
      sessionStorage.removeItem(SEEN_KEY);
    } catch {
      /* ignore */
    }
    animate([
      ["[data-camera]", { scale: 1, filter: "blur(0px)" }, { duration: 0 }],
      ['[data-scene="real"]', { opacity: 1 }, { duration: 0, at: 0 }],
      ['[data-scene="cartoon"]', { opacity: 0 }, { duration: 0, at: 0 }],
      ['[data-scene="bus"]', { opacity: 0 }, { duration: 0, at: 0 }],
      ["[data-mascot]", { x: 0, scale: 1, scaleX: 1, rotate: 0 }, { duration: 0, at: 0 }],
      ["[data-cartoon-copy]", { opacity: 0 }, { duration: 0, at: 0 }],
      ["[data-fx]", { opacity: 0 }, { duration: 0, at: 0 }],
    ]);
    window.scrollTo({ top: 0, behavior: "instant" });
    setScrollLock(true);
    stageRef.current = "real";
    busyRef.current = false;
    cooldownUntil.current = performance.now() + 300;
    html().dataset.introStage = "real";
    setStage("real");
    requestAnimationFrame(() => continueRef.current?.focus());
  }, [animate]);

  // Mount: decide whether to play or skip, then lock scrolling while it plays.
  useEffect(() => {
    const seen = html().dataset.intro === "seen";
    if (seen || window.location.hash || window.scrollY > 40) {
      // One-time sync from browser-only state the server can't see (session flag,
      // hash, restored scroll). CSS already shows the bus, so this can't flash.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      finish(0);
      return;
    }
    html().dataset.introStage = "real";
    setScrollLock(true);
    return () => setScrollLock(false);
  }, [finish]);

  // The mascot beat rolls straight on into the bus reveal.
  useEffect(() => {
    if (stage !== "cartoon") return;
    const id = window.setTimeout(advance, CARTOON_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [stage, advance]);

  // Global inputs while the intro owns the screen.
  useEffect(() => {
    let touchStartY: number | null = null;
    const playing = () => stageRef.current !== "bus";

    const onWheel = (e: WheelEvent) => {
      if (!playing()) return;
      e.preventDefault();
      if (e.deltaY > 6) advance();
    };
    const onKey = (e: KeyboardEvent) => {
      if (!playing() || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("a, button, input, textarea, select, dialog, [contenteditable]")) return;
      if ([" ", "Enter", "ArrowDown", "PageDown"].includes(e.key)) {
        e.preventDefault();
        advance();
      }
    };
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (playing() && e.cancelable) e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      const endY = e.changedTouches[0]?.clientY;
      if (playing() && touchStartY !== null && endY !== undefined && touchStartY - endY > 40) advance();
      touchStartY = null;
    };
    // In-page links (header nav, footer) skip the intro instead of fighting the lock.
    const onDocClick = (e: MouseEvent) => {
      if (!playing()) return;
      const link = (e.target as HTMLElement | null)?.closest('a[href^="#"]');
      if (link && !scope.current?.contains(link)) {
        setScrollLock(false);
        finish(0);
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    document.addEventListener("click", onDocClick, true);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("click", onDocClick, true);
    };
  }, [advance, finish, scope]);

  const onStageClick = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest("a, button")) return;
    advance();
  };

  const playing = stage !== "bus";

  return (
    <section
      ref={scope}
      id="top"
      aria-label="Smokey's intro"
      data-stage={stage}
      onClick={onStageClick}
      // Focus landing on a bus CTA (e.g. Tab) means "take me to the site".
      onFocusCapture={(e) => {
        if (stageRef.current !== "bus" && (e.target as HTMLElement).closest("[data-scene='bus']")) finish();
      }}
      className="relative isolate h-svh min-h-[34rem] w-full overflow-hidden bg-black select-none"
    >
      {/* Scenes, bottom to top */}
      <div data-scene="real" className="absolute inset-0" aria-hidden="true">
        <div data-camera className="absolute inset-0 will-change-transform">
          {real}
        </div>
      </div>
      <div data-scene="cartoon" className="absolute inset-0 opacity-0" aria-hidden="true">
        {cartoon}
      </div>
      <div data-scene="bus" className={cn("absolute inset-0 opacity-0", playing && "pointer-events-none")}>
        {bus}
      </div>

      {/* Transition effects */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20">
        <div
          data-fx="speedlines"
          className="absolute inset-[-25%] opacity-0 [background:repeating-conic-gradient(from_0deg,transparent_0deg_2.6deg,rgb(255_255_255/0.7)_2.6deg_3.1deg)] [mask-image:radial-gradient(circle,transparent_16%,black_52%)]"
        />
        <div data-fx="flash" className="absolute inset-0 bg-[radial-gradient(circle,#fffaf0_0%,oklch(0.85_0.14_75)_55%,oklch(0.6_0.2_350)_100%)] opacity-0" />
        <div
          data-fx="trail"
          className="absolute top-1/2 right-0 left-1/2 h-[22vh] origin-left -translate-y-1/2 opacity-0 [background:linear-gradient(90deg,transparent,var(--neon-pink)_35%,var(--primary))] [mask-image:repeating-linear-gradient(180deg,black_0_10px,transparent_10px_18px)]"
        />
        <div
          data-fx="smoke"
          className="absolute inset-[-10%] opacity-0 [background:radial-gradient(40%_45%_at_30%_55%,#cfc6d8_0%,transparent_70%),radial-gradient(45%_40%_at_70%_45%,#b9aec9_0%,transparent_70%),radial-gradient(60%_60%_at_50%_50%,#8f84a3_0%,#1b1622_85%)]"
        />
      </div>

      {/* Controls */}
      {playing ? (
        <>
          <button
            ref={continueRef}
            type="button"
            data-intro-hint
            onClick={advance}
            className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-30 flex min-h-11 -translate-x-1/2 flex-col items-center gap-1 rounded-full px-5 py-2 text-sm font-medium whitespace-nowrap text-white/85 transition-colors hover:text-white"
          >
            <span className="pointer-coarse:hidden">Click or scroll to continue</span>
            <span className="hidden pointer-coarse:inline">Tap or swipe up to continue</span>
            <ChevronDown aria-hidden="true" className="size-5 motion-safe:animate-pulse-soft" />
          </button>
          <button
            type="button"
            data-intro-hint
            onClick={() => finish()}
            className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 z-30 min-h-11 rounded-full bg-black/35 px-4 text-xs font-semibold tracking-wider text-white/80 uppercase ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-black/55 hover:text-white"
          >
            Skip intro
          </button>
        </>
      ) : (
        <>
          <a
            href={exploreHref}
            className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-30 flex min-h-11 -translate-x-1/2 flex-col items-center gap-0.5 px-4 text-xs font-semibold tracking-[0.2em] text-white/70 uppercase transition-colors hover:text-white"
          >
            Explore
            <ChevronDown aria-hidden="true" className="size-5 motion-safe:animate-pulse-soft" />
          </a>
          <button
            type="button"
            onClick={replay}
            className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-30 flex min-h-11 items-center gap-2 rounded-full px-3 text-xs font-medium text-white/60 transition-colors hover:text-white"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Replay intro
          </button>
        </>
      )}
    </section>
  );
}
