"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { SampleTag } from "@/components/ui/sample-tag";
import { site } from "@/content/site";
import { INTRO } from "./intro-config";
import { hasPlaceholderFootage } from "./intro-clips";
import type { IntroEngine } from "./intro-engine";
import { IntroMedia } from "./intro-media";

type IntroSequenceProps = {
  real: ReactNode;
  cartoon: ReactNode;
  bus: ReactNode;
  dust: ReactNode;
  /** Where "Explore" leads once the bus is revealed. */
  exploreHref: string;
};

type EngineModule = typeof import("./intro-engine");
let engineModule: Promise<EngineModule> | null = null;

/** GSAP, ScrollTrigger and the engine load on demand, in parallel with the footage: never on the hydration path. */
function loadEngine() {
  engineModule ??= import("./intro-engine").catch((error: unknown) => {
    engineModule = null;
    throw error;
  });
  return engineModule;
}

const html = () => document.documentElement;

/** Reduced motion or Save-Data: the story as stills (no clips downloaded). */
function introStill() {
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  return saveData || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function setScrollLock(locked: boolean) {
  if (locked) html().dataset.scrollLock = "";
  else delete html().dataset.scrollLock;
}

/** Resolve with `promise`, or with `fallback` / reject after `ms` (a stalled request must never hold the page). */
function within<T>(promise: Promise<T>, ms: number, fallback?: { value: T }) {
  return Promise.race([
    promise,
    new Promise<T>((resolve, reject) =>
      window.setTimeout(() => (fallback ? resolve(fallback.value) : reject(new Error("timed out"))), ms),
    ),
  ]);
}

/**
 * The signature intro, driven by scroll: a tall section whose stage stays
 * pinned (CSS sticky) while scrolling plays ONE GSAP timeline (see
 * ./intro-engine): real roadrunner → cartoon roadrunner → dust → black party
 * bus → branding, and back again when scrolling up. Then the stage unpins and
 * the page carries on.
 *
 * This component only handles the life cycle: loading the footage behind the
 * branded loader (the page waits at the top until it's all in memory, so
 * nothing can stall or flash), starting the engine, and Skip. Nothing here
 * re-renders while scrolling. Scenes are Server Components passed in as slots.
 */
export function IntroSequence({ real, cartoon, bus, dust, exploreHref }: IntroSequenceProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const engine = useRef<IntroEngine | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;
    // The boot script's failsafe already showed the finished hero (JS arrived very late): keep it.
    if (html().hasAttribute("data-intro-failed")) return;
    const still = introStill();
    if (still) html().dataset.introStill = "";
    html().dataset.introArmed = ""; // feet-dust sprites may load now
    // At the top, the story waits for its footage; a restored or linked scroll position doesn't.
    const atTop = window.scrollY < 8 && (!window.location.hash || window.location.hash === "#top");
    if (atTop) {
      html().dataset.introLoading = "js"; // JS owns the loader now (the boot script's failsafe stands down)
      setScrollLock(true); // (the boot script already holds it from first paint)
    } else {
      html().removeAttribute("data-intro-loading");
      setScrollLock(false);
    }

    const media = new IntroMedia(stage, still);
    const bar = (selector: string) => {
      const el = stage.querySelector<HTMLElement>(selector);
      return (f: number) => {
        if (el) el.style.transform = `scaleX(${f})`;
      };
    };

    // While the page holds still at the top, any scroll away from it is navigation (the "Skip to
    // content" link, find-in-page, an in-page link): let it go and stop holding.
    const onScroll = () => {
      if (window.scrollY < 8 || !html().hasAttribute("data-scroll-lock")) return;
      setScrollLock(false);
      html().removeAttribute("data-intro-loading");
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    let cancelled = false;
    Promise.all([
      within(loadEngine(), INTRO.firstClipTimeoutMs),
      media.load(["real"], bar("[data-intro-progress]"), INTRO.firstClipTimeoutMs),
      within(document.fonts.ready.then(() => undefined), 3000, { value: undefined }),
    ])
      .then(([mod]) => {
        if (cancelled) return;
        const eng = new mod.IntroEngine(section, stage, media, { still });
        engine.current = eng;
        delete html().dataset.introFinal; // the timeline owns the stage from here
        html().dataset.introPending = "";
        eng.start();
        void eng.enter().then(() => {
          if (!cancelled) html().removeAttribute("data-intro-loading");
        });
        return media.load(still ? ["cartoon", "bus"] : ["cartoon", "dust", "bus"], bar("[data-intro-progress-rest]"), INTRO.restClipsTimeoutMs).then(() => {
          if (cancelled) return;
          eng.refresh();
          delete html().dataset.introPending;
          setScrollLock(false);
        });
      })
      .catch(() => {
        if (cancelled) return;
        // The engine couldn't load (offline, blocked script): show the finished hero instead.
        html().dataset.introFinal = "";
        html().dataset.introFailed = "";
        html().removeAttribute("data-intro-loading");
        delete html().dataset.introStage;
        setScrollLock(false);
      });

    return () => {
      cancelled = true;
      window.removeEventListener("scroll", onScroll);
      engine.current?.destroy();
      engine.current = null;
      setScrollLock(false);
      html().removeAttribute("data-intro-loading");
      for (const key of ["introPending", "introStill", "introFinal", "introStage", "introFailed"]) delete html().dataset[key];
    };
  }, []);

  /** Jump to the end of the story (the bus, branding and CTAs), with focus on the headline. */
  const skip = useCallback(() => {
    const section = sectionRef.current;
    if (!section) return;
    setScrollLock(false);
    html().removeAttribute("data-intro-loading");
    if (!engine.current) {
      // Still loading: CSS shows the finished hero (the engine takes over from there once ready).
      html().dataset.introFinal = "";
      html().dataset.introStage = "bus";
    }
    window.scrollTo({ top: section.offsetTop + section.offsetHeight - window.innerHeight, behavior: "instant" });
    section.querySelector<HTMLElement>("#intro-title")?.focus({ preventScroll: true });
  }, []);

  return (
    <section
      ref={sectionRef}
      id="top"
      aria-label="Smokey's intro"
      className="intro-scroll relative"
      style={{ "--intro-screens": INTRO.scroll.screens, "--intro-still-screens": INTRO.scroll.stillScreens } as CSSProperties}
    >
      {/* Where the film comes to rest (bus, SMOKEY'S, CTAs): the header's home link and deep links land here. */}
      <span id="intro-end" aria-hidden="true" className="intro-end pointer-events-none absolute inset-x-0 h-px" />
      {/*
        The pinned stage: one scene whose layers stay mounted while the scroll plays the timeline.
        It's as tall as the LARGE viewport (the film still fills the screen once a phone's toolbar
        hides); clips and controls are placed within the small viewport (never under the toolbar).
      */}
      <div ref={stageRef} className="intro-stage sticky top-0 isolate h-lvh w-full overflow-hidden bg-black">
        {/* Measures the small viewport for the engine (the frame the clips are placed in). */}
        <div data-frame aria-hidden="true" className="pointer-events-none invisible absolute inset-x-0 top-0 h-svh" />
        <div data-scene="real" className="absolute inset-0" aria-hidden="true">
          {real}
        </div>
        <div data-scene="cartoon" className="invisible absolute inset-0 opacity-0" aria-hidden="true">
          {cartoon}
        </div>
        <div data-scene="bus" className="absolute inset-0 opacity-0">
          {bus}
        </div>

        {/* Transition layers: a flat dust-coloured cover, the dust clip (blends into the scenes), a flash. */}
        <div
          data-fx="haze"
          aria-hidden="true"
          className="pointer-events-none invisible absolute inset-0 z-20 bg-[radial-gradient(circle_at_50%_68%,#c9a678_0%,#a9855b_48%,#76583a_100%)] opacity-0"
        />
        {dust}
        <div
          data-fx="flash"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-22 bg-[radial-gradient(circle_at_50%_72%,#fffaf0_0%,rgb(255_222_168/0.92)_35%,rgb(255_166_96/0.65)_75%)] opacity-0"
        />

        {/* Branded loader while scene 1's footage downloads (only when JS set data-intro-loading). */}
        <div data-intro-loader aria-hidden="true" className="absolute inset-0 z-40 hidden flex-col items-center justify-center gap-5 bg-[#0b0a10]">
          <p className="font-display text-sm font-bold tracking-[0.6em] text-white/80">{site.name.toUpperCase()}</p>
          <div className="h-0.5 w-40 overflow-hidden rounded-full bg-white/10">
            <div data-intro-progress className="h-full origin-left scale-x-0 bg-primary transition-transform duration-200" />
          </div>
        </div>

        {/* "Scroll to start": shows download progress until every clip is in memory. */}
        <div
          data-intro-hint="scroll"
          role="status"
          className="intro-bottom-ui pointer-events-none absolute left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1.5 text-xs font-semibold tracking-[0.25em] whitespace-nowrap text-white/85 uppercase [text-shadow:0_1px_10px_rgb(0_0_0/0.6)]"
        >
          <span data-label className="flex flex-col items-center gap-1">
            <span className="pointer-coarse:hidden">Scroll to start</span>
            <span className="hidden pointer-coarse:inline">Swipe up to start</span>
            <ChevronDown aria-hidden="true" className="size-5 motion-safe:animate-bounce" />
          </span>
          <span data-pending className="flex flex-col items-center gap-2 text-white/70">
            Loading footage&hellip;
            <span className="h-0.5 w-28 overflow-hidden rounded-full bg-white/15">
              <span data-intro-progress-rest className="block h-full origin-left scale-x-0 bg-primary transition-transform duration-200" />
            </span>
          </span>
        </div>

        <button
          type="button"
          data-intro-hint="skip"
          onClick={skip}
          className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 z-50 min-h-11 rounded-full bg-black/40 px-4 text-xs font-semibold tracking-wider text-white/85 uppercase ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-black/60 hover:text-white"
        >
          Skip intro
        </button>

        <a
          data-intro-hint="explore"
          href={exploreHref}
          className="intro-bottom-ui invisible absolute left-1/2 z-30 flex min-h-11 -translate-x-1/2 flex-col items-center gap-0.5 px-4 text-xs font-semibold tracking-[0.2em] text-white/70 uppercase opacity-0 transition-colors hover:text-white short:hidden"
        >
          Explore
          <ChevronDown aria-hidden="true" className="size-5" />
        </a>

        {hasPlaceholderFootage ? (
          // Readable over the brightest scene, clear of the centred controls on narrow phones, never in the way of a tap.
          <SampleTag
            label="Placeholder footage"
            className="intro-bottom-ui pointer-events-none absolute right-4 z-30 bg-black/75 text-white/90 max-sm:mb-14 short:hidden"
          />
        ) : null}
      </div>
    </section>
  );
}
