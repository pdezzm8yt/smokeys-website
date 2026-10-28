"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { SampleTag } from "@/components/ui/sample-tag";
import { site } from "@/content/site";
import { INTRO } from "./intro-config";
import type { IntroEngine } from "./intro-engine";
import { hasPlaceholderFootage } from "./intro-film";
import { FilmMedia } from "./intro-media";

type IntroSequenceProps = {
  /** The film and everything that moves with it (intro-layers.tsx). */
  film: ReactNode;
  /** The headline and CTAs the film comes to rest under. */
  copy: ReactNode;
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

/** Reduced motion or Save-Data: the story as stills (the film isn't downloaded). */
function introStill() {
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  return saveData || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function setScrollLock(locked: boolean) {
  if (locked) html().dataset.scrollLock = "";
  else delete html().dataset.scrollLock;
}

/**
 * Change the intro's scroll length (still mode, or the finished hero after a
 * failure) without moving what the visitor sees: at or past the end of the
 * intro (after Skip, a deep link) they keep their place relative to its end;
 * part-way through, they keep their progress; at the top nothing moves.
 */
function keepPlace(section: HTMLElement, change: () => void) {
  const before = section.getBoundingClientRect();
  const range = section.offsetHeight - window.innerHeight;
  const progress = range > 0 ? Math.min(1, Math.max(0, -before.top / range)) : 0;
  const pastEnd = before.bottom <= window.innerHeight + 8;
  change();
  const after = section.getBoundingClientRect(); // (forces the new layout)
  if (pastEnd) window.scrollBy({ top: after.bottom - before.bottom, behavior: "instant" });
  else if (-before.top > 8) {
    window.scrollTo({ top: section.offsetTop + progress * Math.max(0, section.offsetHeight - window.innerHeight), behavior: "instant" });
  }
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
 * pinned (CSS sticky) while scrolling scrubs ONE film with ONE GSAP timeline
 * (see ./intro-engine): the roadrunner runs into the dust, the black party
 * bus drives out of it, branding, and back again when scrolling up. Then the
 * stage unpins and the page carries on.
 *
 * This component only handles the life cycle: the branded loader (until the
 * film's opening frame is on screen), holding the page at the top until the
 * film is in memory (so scrubbing can never stall or flash), starting the
 * engine, and Skip. Nothing here re-renders while scrolling. The layers are
 * Server Components passed in as slots.
 */
export function IntroSequence({ film, copy, exploreHref }: IntroSequenceProps) {
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
    // (Save-Data has no CSS media query: the section shortens now, maybe after a pre-JS Skip.)
    if (still) keepPlace(section, () => (html().dataset.introStill = ""));
    // At the top, the story waits for its film; a restored or linked scroll position doesn't.
    const atTop = window.scrollY < 8 && (!window.location.hash || window.location.hash === "#top");
    if (atTop) {
      html().dataset.introLoading = "js"; // JS owns the loader now (the boot script's failsafe stands down)
      html().dataset.introStage ??= "film"; // (set by the boot script, except after a client-side navigation)
      setScrollLock(true); // (the boot script already holds it from first paint)
    } else {
      html().removeAttribute("data-intro-loading");
      setScrollLock(false);
    }

    const media = new FilmMedia(stage, still);
    const progress = stage.querySelector<HTMLElement>("[data-intro-progress]");
    const onProgress = (f: number) => {
      // `scale`, not `transform`: Tailwind 4's scale-x-0 is the `scale` property, which multiplies with any transform.
      if (progress) progress.style.scale = `${f} 1`;
    };
    // Until the engine re-measures on its own, keep the film's band (feathered edges) right on resize.
    const onResize = () => media.band();
    window.addEventListener("resize", onResize);
    // The film downloads from the start, alongside the engine code, the opening still and the fonts.
    const film = media.load(onProgress, INTRO.filmTimeoutMs);

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
      within(loadEngine(), INTRO.engineTimeoutMs),
      within(media.stillReady("start"), 3000, { value: undefined }),
      within(document.fonts.ready.then(() => undefined), 3000, { value: undefined }),
    ])
      .then(async ([mod]) => {
        if (cancelled) return;
        if (!media.cut) throw new Error("The intro has no film.");
        // The opening frame is on screen: the loader lifts, and the scroll hint shows the film's
        // download progress until it's in memory.
        if (!still && !media.ready) html().dataset.introPending = "";
        html().removeAttribute("data-intro-loading");
        const ready = await film;
        if (cancelled) return;
        // No film (still mode, or it couldn't load in time): the stills tell the story, on the shorter scroll.
        if (!ready) keepPlace(section, () => (html().dataset.introStill = ""));
        window.removeEventListener("resize", onResize);
        const eng = new mod.IntroEngine(section, stage, media, { still: !ready });
        engine.current = eng;
        const landed = eng.start();
        // After a Skip the finished hero is showing: keep it up until the film shows the same frame.
        if (html().hasAttribute("data-intro-final")) await landed;
        if (cancelled) return;
        delete html().dataset.introFinal; // the timeline owns the stage from here
        delete html().dataset.introPending;
        setScrollLock(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // The engine couldn't load (offline, blocked script) or failed, or there's no film: show the finished hero instead.
        console.error("[intro] showing the finished hero instead:", error);
        media.cancel();
        keepPlace(section, () => {
          html().dataset.introFinal = "";
          html().dataset.introFailed = "";
        });
        html().removeAttribute("data-intro-loading");
        delete html().dataset.introPending;
        delete html().dataset.introStage;
        setScrollLock(false);
      });

    return () => {
      cancelled = true;
      media.cancel();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
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
      html().dataset.introStage = "end";
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
        The pinned stage: its layers stay mounted while the scroll plays the timeline. It's as tall
        as the LARGE viewport (the film still fills the screen once a phone's toolbar hides); the
        film and controls are placed within the small viewport (never under the toolbar).
      */}
      <div ref={stageRef} className="intro-stage sticky top-0 isolate h-lvh w-full overflow-hidden bg-black">
        {/* Measures the small viewport for the engine (the frame the film is placed in). */}
        <div data-frame aria-hidden="true" className="pointer-events-none invisible absolute inset-x-0 top-0 h-svh" />
        <div aria-hidden="true" className="absolute inset-0">
          {film}
        </div>

        {/* A dust-coloured haze over the film where the roadrunner becomes the bus (the film's own dust does most of the hiding). */}
        <div
          data-fx="haze"
          aria-hidden="true"
          className="pointer-events-none invisible absolute inset-0 z-20 bg-[radial-gradient(circle_at_50%_55%,#d0a06a_0%,#a5713f_50%,#5e3b1f_100%)] opacity-0"
        />

        {/* The handoff: the bottom of the stage fades into the page's background as the film comes to rest. */}
        <div data-stage-fade aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[28%] bg-linear-to-t from-background via-background/70 to-transparent opacity-0" />

        {copy}

        {/* Branded loader until the film's opening frame is on screen (only when JS set data-intro-loading). */}
        <div data-intro-loader aria-hidden="true" className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#0b0a10]">
          <p className="font-display text-sm font-bold tracking-[0.6em] text-white/80 motion-safe:animate-pulse">{site.name.toUpperCase()}</p>
        </div>

        {/* "Scroll to start": shows the film's download progress until it's in memory. */}
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
              <span data-intro-progress className="block h-full origin-left scale-x-0 bg-primary transition-transform duration-200" />
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
          // Readable over the brightest frame, clear of the centred controls on narrow phones, never in the way
          // of a tap, and on screen in every layout while the footage isn't Smokey's own bus.
          <SampleTag
            label="Placeholder footage"
            className="intro-bottom-ui pointer-events-none absolute right-4 z-30 bg-black/75 text-white/90 max-sm:mb-14"
          />
        ) : null}
      </div>
    </section>
  );
}
