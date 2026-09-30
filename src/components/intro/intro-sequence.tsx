"use client";

import { ChevronDown, RotateCcw } from "lucide-react";
import { useAnimate, type AnimationPlaybackControls, type AnimationSequence } from "motion/react";
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
import { INTRO } from "./intro-config";
import { DustCloud } from "./parts";
import { finalState, initialState, primeBus, toBus, toCartoon, type TimelineOptions } from "./timelines";
import { useIntroInput } from "./use-intro-input";

type Stage = "real" | "cartoon" | "bus";

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

const html = () => document.documentElement;

function timelineOptions(): TimelineOptions {
  return {
    reduce: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    // Phones, touch-first devices and Data Saver skip live blur filters.
    lite:
      window.matchMedia("(max-width: 767px), (pointer: coarse)").matches ||
      Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData),
  };
}

function setScrollLock(locked: boolean) {
  if (locked) html().dataset.scrollLock = "";
  else delete html().dataset.scrollLock;
}

/**
 * The signature intro: real roadrunner → cartoon roadrunner → black party bus.
 *
 * One full-viewport stage with three stacked scene layers. Every subject
 * stands on the same anchor point, so each swap reads as a transformation.
 * A click/tap (or wheel, swipe, Space/Enter/↓) starts the run; the cartoon
 * beat then rolls into the dust storm and bus reveal by itself.
 * Choreography lives in ./timelines, timing in ./intro-config, layout in
 * globals.css (.intro-stage). Scenes are Server Components passed in as slots,
 * so their markup costs no client JS.
 */
export function IntroSequence({ real, cartoon, bus, busAspect, exploreHref }: IntroSequenceProps) {
  const [scope, animate] = useAnimate<HTMLElement>();
  const [stage, setStage] = useState<Stage>("real");
  /** Scenes whose loops should run (the current one, plus the next during a transition). */
  const [live, setLive] = useState<Stage[]>(["real"]);
  /** A transition is playing (hides the "continue" prompt once the run starts). */
  const [running, setRunning] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  /** The run has started at least once: fetch the dust sprites (never for skip-straight-to-bus visitors). */
  const [dustArmed, setDustArmed] = useState(false);
  const stageRef = useRef<Stage>("real");
  const busyRef = useRef(false);
  const cooldownUntil = useRef(0);
  const unlockTimer = useRef<number | undefined>(undefined);
  const controlsRef = useRef<AnimationPlaybackControls | null>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  /** Where focus should go once React has committed the next stage (never via rAF: it may not run). */
  const pendingFocus = useRef<"headline" | "continue" | null>(null);

  /** When the reveal lands, put keyboard/screen-reader focus on the headline (next Tab = CTAs). */
  const focusHeadline = useCallback(() => {
    const active = document.activeElement;
    if (active && active !== document.body && !scope.current?.contains(active)) return; // user is elsewhere
    scope.current?.querySelector<HTMLElement>("#intro-title")?.focus({ preventScroll: true });
  }, [scope]);

  const commit = useCallback(
    (next: Stage, { keepLive = false, moveFocus = true }: { keepLive?: boolean; moveFocus?: boolean } = {}) => {
      stageRef.current = next;
      busyRef.current = false;
      cooldownUntil.current = performance.now() + INTRO.cooldownMs;
      html().dataset.introStage = next;
      setStage(next);
      setRunning(false);
      if (!keepLive) setLive([next]);
      if (next === "bus") {
        try {
          sessionStorage.setItem(SEEN_KEY, "1");
        } catch {
          /* storage blocked: the intro simply replays next visit */
        }
        window.clearTimeout(unlockTimer.current);
        unlockTimer.current = window.setTimeout(() => setScrollLock(false), INTRO.unlockDelayMs);
        pendingFocus.current = moveFocus ? "headline" : null;
      }
    },
    [],
  );

  const play = useCallback(
    async (from: Stage, to: Stage, build: (o: TimelineOptions) => AnimationSequence) => {
      busyRef.current = true;
      // The prompt is about to unmount: park focus on the stage itself (not on Skip,
      // where a repeated Enter/Space would skip the reveal; the stage still hears ↓/Space).
      if (document.activeElement === continueRef.current) scope.current?.focus({ preventScroll: true });
      setRunning(true);
      setDustArmed(true);
      setLive([from, to]);
      const controls = animate(build(timelineOptions()));
      controlsRef.current = controls;
      await controls;
      // Skip/replay may have taken over mid-flight; only commit our own ending.
      if (controlsRef.current === controls && stageRef.current === from) commit(to);
    },
    [animate, commit, scope],
  );

  /** Jump to the finished bus scene (Skip, deep links, returning visitors). */
  const finish = useCallback(
    (duration = 0.35, moveFocus = true) => {
      controlsRef.current?.stop();
      const controls = animate(finalState(duration));
      controlsRef.current = controls;
      if (duration > 0) {
        // Keep whatever is on screen visible while it crossfades to the bus.
        setLive((prev) => (prev.includes("bus") ? prev : [...prev, "bus"]));
        commit("bus", { keepLive: true, moveFocus });
        void controls.then(() => {
          if (controlsRef.current === controls) setLive(["bus"]);
        });
      } else {
        commit("bus", { moveFocus });
      }
    },
    [animate, commit],
  );

  const advance = useCallback(
    (force = false) => {
      if (busyRef.current || (!force && performance.now() < cooldownUntil.current)) return;
      if (stageRef.current === "real") {
        void play("real", "cartoon", toCartoon);
      } else if (stageRef.current === "cartoon") {
        void play("cartoon", "bus", (o) => [...primeBus(o), ...toBus(o)]);
      }
    },
    [play],
  );

  const replay = useCallback(() => {
    if (performance.now() < cooldownUntil.current) return; // e.g. a double-press that just skipped
    controlsRef.current?.stop();
    controlsRef.current = null;
    window.clearTimeout(unlockTimer.current);
    delete html().dataset.intro;
    try {
      sessionStorage.removeItem(SEEN_KEY);
    } catch {
      /* ignore */
    }
    animate(initialState());
    window.scrollTo({ top: 0, behavior: "instant" });
    setScrollLock(true);
    stageRef.current = "real";
    busyRef.current = false;
    cooldownUntil.current = performance.now() + 300;
    html().dataset.introStage = "real";
    setStage("real");
    setLive(["real"]);
    setRunning(false);
    pendingFocus.current = "continue";
  }, [animate]);

  // Move focus after the stage change commits (e.g. the bus scene is no longer inert).
  useEffect(() => {
    const target = pendingFocus.current;
    if (stage === "bus" && target === "headline") focusHeadline();
    else if (stage === "real" && target === "continue") continueRef.current?.focus();
    else return;
    pendingFocus.current = null;
  }, [stage, focusHeadline]);

  // Mount: decide whether to play or skip, then lock scrolling while it plays.
  useEffect(() => {
    const seen = html().dataset.intro === "seen";
    if (seen || window.location.hash || window.scrollY > 40) {
      // One-time sync from browser-only state the server can't see (session flag,
      // hash, restored scroll). CSS already shows the bus, so this can't flash.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      finish(0, false);
      return;
    }
    html().dataset.introStage = "real";
    setScrollLock(true);
  }, [finish]);

  // Unmount (e.g. client navigation away mid-intro): never leave the page locked or the header hidden.
  useEffect(
    () => () => {
      window.clearTimeout(unlockTimer.current);
      setScrollLock(false);
      delete html().dataset.introStage;
    },
    [],
  );

  // The cartoon runs for a beat, then the dust storm rolls in by itself.
  useEffect(() => {
    if (stage !== "cartoon") return;
    const id = window.setTimeout(() => advance(true), INTRO.cartoonHoldMs);
    return () => window.clearTimeout(id);
  }, [stage, advance]);

  // Pause every loop once the stage scrolls out of view.
  useEffect(() => {
    const el = scope.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setOffscreen(!entry?.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [scope]);

  // The hero CTAs stay out of the Tab order until the reveal. Only the buttons are
  // inert: the H1 stays in the accessibility tree for screen-reader users throughout.
  useEffect(() => {
    const ctas = scope.current?.querySelector<HTMLElement>("[data-bus-ctas]");
    if (ctas) ctas.inert = stage !== "bus";
  }, [stage, scope]);

  // Size the bus to the space left under the headline + CTAs (see --w-bus in globals.css).
  // Layout effect: measured before the first client paint, so the bus never visibly resizes.
  useLayoutEffect(() => {
    const section = scope.current;
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
  }, [scope]);

  useIntroInput({
    scope,
    active: stage !== "bus",
    onAdvance: () => advance(),
    // Release the lock now, before the browser follows the anchor / keeps scrolling.
    onSkip: () => {
      window.clearTimeout(unlockTimer.current);
      setScrollLock(false);
      finish(0, false);
    },
  });

  const onStageClick = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest("a, button")) return;
    advance();
  };

  const playing = stage !== "bus";
  const liveAttr = (s: Stage) => (live.includes(s) ? "" : undefined);

  return (
    <section
      ref={scope}
      id="top"
      aria-label="Smokey's intro"
      data-stage={stage}
      data-offscreen={offscreen ? "" : undefined}
      onClick={onStageClick}
      style={{ "--bus-aspect": busAspect } as CSSProperties}
      tabIndex={-1}
      className="intro-stage relative isolate h-svh w-full cursor-pointer overflow-hidden bg-black outline-none select-none data-[stage=bus]:cursor-auto"
    >
      {/* Scenes, bottom to top */}
      <div data-scene="real" data-live={liveAttr("real")} className="absolute inset-0" aria-hidden="true">
        {real}
      </div>
      <div data-scene="cartoon" data-live={liveAttr("cartoon")} className="absolute inset-0 opacity-0" aria-hidden="true">
        {cartoon}
      </div>
      <div data-scene="bus" data-live={liveAttr("bus")} className={cn("absolute inset-0 opacity-0", playing && "pointer-events-none")}>
        {bus}
      </div>

      {/* Transition effects */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        <div data-fx="haze" className="absolute inset-0 bg-[radial-gradient(circle_at_50%_72%,#ecd6b2_0%,#d2b089_45%,#a9845f_100%)] opacity-0" />
        <DustCloud armed={dustArmed} />
        <div
          data-fx="flash"
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_72%,#fffaf0_0%,rgb(255_222_168/0.92)_35%,rgb(255_166_96/0.65)_75%)] opacity-0"
        />
      </div>

      {/* Controls (stable keys: Skip must never be recycled into Replay under the user's focus) */}
      {playing ? (
        <>
          {stage === "real" && !running && (
            <button
              key="continue"
              ref={continueRef}
              type="button"
              data-intro-hint
              onClick={() => advance()}
              className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-30 min-h-11 -translate-x-1/2 rounded-full bg-black/40 px-6 py-2 text-sm font-semibold tracking-wide whitespace-nowrap text-white ring-1 ring-white/25 backdrop-blur-md transition-colors hover:bg-black/60"
            >
              <span className="pointer-coarse:hidden">Click to continue</span>
              <span className="hidden pointer-coarse:inline">Tap to continue</span>
            </button>
          )}
          <button
            key="skip"
            type="button"
            data-intro-hint
            onClick={() => finish()}
            className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 z-30 min-h-11 rounded-full bg-black/40 px-4 text-xs font-semibold tracking-wider text-white/85 uppercase ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-black/60 hover:text-white"
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
            onClick={replay}
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
