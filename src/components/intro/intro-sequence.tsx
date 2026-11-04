"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { SampleTag } from "@/components/ui/sample-tag";
import { currentAxis, keepTravel, worldElement, worldScroll } from "@/components/world/world-axis";
import { useWorldAxis } from "@/components/world/world-scene";
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
  /** What leads the stage in when the world's loop comes back round to it (OpeningLead). */
  lead: ReactNode;
};

type EngineModule = typeof import("./intro-engine");
let engineModule: Promise<EngineModule> | null = null;

/** GSAP and the engine load on demand, in parallel with the footage: never on the hydration path. */
function loadEngine() {
  engineModule ??= import("./intro-engine").catch((error: unknown) => {
    engineModule = null;
    throw error;
  });
  return engineModule;
}

const html = () => document.documentElement;

/** Reduced motion, Save-Data or a 2G connection: the story as stills (the film isn't downloaded). */
function introStill() {
  const net = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const slow = net?.effectiveType === "slow-2g" || net?.effectiveType === "2g";
  return net?.saveData === true || slow || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function setScrollLock(locked: boolean) {
  if (locked) html().dataset.scrollLock = "";
  else delete html().dataset.scrollLock;
}

/** The scene's place along the world's scroll, and its scroll length (px), in either layout. */
function span(section: HTMLElement) {
  const w = worldElement();
  if (w) {
    const r = section.getBoundingClientRect();
    return { from: r.left - w.getBoundingClientRect().left, to: r.right - w.getBoundingClientRect().left, view: w.clientWidth, w };
  }
  const r = section.getBoundingClientRect();
  return { from: r.top, to: r.bottom, view: window.innerHeight, w: null };
}

/**
 * Change the scene's scroll length (still mode, or the finished hero after a
 * failure) without moving what the visitor sees: at or past its end (after a
 * nav jump, a deep link) they keep their place relative to its end; part-way
 * through, they keep their progress; at the start nothing moves.
 */
function keepPlace(section: HTMLElement, change: () => void) {
  // Sideways, round the loop: the visitor stays put, and so does their journey (nothing that moves with it jumps).
  keepTravel(() => keepPlaceNow(section, change));
}

function keepPlaceNow(section: HTMLElement, change: () => void) {
  const before = span(section);
  const range = before.to - before.from - before.view;
  const progress = range > 0 ? Math.min(1, Math.max(0, -before.from / range)) : 0;
  const pastEnd = before.to <= before.view + 8;
  change();
  const after = span(section); // (forces the new layout)
  const by = (d: number) => (after.w ? after.w.scrollBy({ left: d, behavior: "instant" }) : window.scrollBy({ top: d, behavior: "instant" }));
  if (pastEnd) by(after.to - before.to);
  // Part-way through: the same progress through the new length (the section's start ends up at -progress × range).
  else if (-before.from > 8) by(after.from + progress * Math.max(0, after.to - after.from - after.view));
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
 * The tunnel scene, the first scene of the world: a long section whose stage
 * stays pinned (CSS sticky) while scrolling scrubs ONE film with ONE GSAP
 * timeline (see ./intro-engine): the roadrunner runs into the tunnel, the dark
 * hides the change, the black party bus drives out, branding — and back again
 * when scrolling back. Then the stage lets go and the world carries on
 * sideways, with no break: it is the website, not something before it.
 *
 * This component only handles the life cycle: the branded loader (until the
 * film's opening frame is on screen), holding the world at the start until the
 * film is in memory (so scrubbing can never stall or flash), and starting the
 * engine — again if the world changes direction (a phone turned on its side).
 * Nothing here re-renders while scrolling. The layers are Server Components
 * passed in as slots.
 */
export function IntroSequence({ film, copy, lead }: IntroSequenceProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const engine = useRef<IntroEngine | null>(null);
  /** Starts the engine on the current axis (set once the film is ready): the world turning restarts it. */
  const restart = useRef<(() => void) | null>(null);
  // Effects only: the first render is the same on the server and the client.
  const axis = useWorldAxis();

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;
    // The boot script's failsafe already showed the finished hero (JS arrived very late): keep it.
    if (html().hasAttribute("data-intro-failed")) return;
    const still = introStill();
    // (Save-Data and 2G have no CSS media query: the section shortens now.)
    if (still) keepPlace(section, () => (html().dataset.introStill = ""));
    // Sideways the world is a loop: until the scene is ready to carry on (its engine running, or the finished
    // hero instead), a journey coming back round to it waits at its opening frame, as it waits at the start.
    html().dataset.loopHold = "";
    // At the start, the story waits for its film; a restored or linked position doesn't.
    const atStart = worldScroll() < 8 && (!window.location.hash || window.location.hash === "#top");
    if (atStart) {
      html().dataset.introLoading = "js"; // JS owns the loader now (the boot script's failsafe stands down)
      setScrollLock(true); // (the boot script already holds it from first paint)
    } else {
      html().removeAttribute("data-intro-loading");
      setScrollLock(false);
    }

    /**
     * Until the engine runs, a visitor at or past the scene's end (a nav jump, a
     * deep link, a restored place) sees the finished hero (the bus, the
     * branding), not the opening frame; the engine takes over from that frame.
     */
    const placeHero = () => {
      if (engine.current || html().hasAttribute("data-intro-failed")) return;
      const at = span(section);
      if (at.to <= at.view + 8) html().dataset.introFinal = "";
      else delete html().dataset.introFinal;
    };
    placeHero();

    const media = new FilmMedia(stage, still, section.querySelector<HTMLElement>(".intro-lead"));
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

    // While the world holds still at the start, any move away from it is navigation (the "Skip to
    // content" link, the header's nav, find-in-page): let it go and stop holding. (Capturing: the world's
    // scroll events, sideways, and the page's, in the column.)
    const onScroll = () => {
      placeHero();
      // The journey is coming back round to the scene (the world has moved it round to its end) and its stage is
      // arriving, but its film still isn't in memory: the stills tell the story this time (rather than holding
      // the visitor at the join for the rest of the download).
      if (!engine.current && !media.ready && section.hasAttribute("data-round") && section.getBoundingClientRect().left < window.innerWidth) media.cancel();
      if (worldScroll() < 8 || !html().hasAttribute("data-scroll-lock")) return;
      setScrollLock(false);
      html().removeAttribute("data-intro-loading");
    };
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });

    let cancelled = false;
    Promise.all([
      within(loadEngine(), INTRO.engineTimeoutMs),
      within(media.stillReady("start"), 3000, { value: undefined }),
      within(document.fonts.ready.then(() => undefined), 3000, { value: undefined }),
    ])
      .then(async ([mod]) => {
        if (cancelled) return;
        if (!media.cut) throw new Error("The tunnel scene has no film.");
        // The opening frame is on screen: the loader lifts, and the hint shows the film's
        // download progress until it's in memory.
        if (!still && !media.ready) html().dataset.introPending = "";
        html().removeAttribute("data-intro-loading");
        const ready = await film;
        if (cancelled) return;
        // No film (still mode, or it couldn't load in time): the stills tell the story, on the shorter scroll.
        if (!ready) keepPlace(section, () => (html().dataset.introStill = ""));
        window.removeEventListener("resize", onResize);
        const create = () => {
          const w = worldElement();
          const eng = new mod.IntroEngine(section, stage, media, { still: !ready, scroller: w ? { axis: "x", element: w } : { axis: "y" } });
          engine.current = eng;
          return eng.start();
        };
        // The world turned (a phone on its side): a new engine on the new axis, from the same place (the
        // world kept it) and the same film frame (the film itself is kept, not reloaded or rewound).
        restart.current = () => {
          engine.current?.destroy({ keepFilm: true });
          engine.current = null;
          void create();
        };
        const landed = create();
        delete html().dataset.loopHold;
        // After a nav jump past the scene the finished hero is showing: keep it up until the film shows the same frame.
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
        delete html().dataset.loopHold;
        setScrollLock(false);
      });

    return () => {
      cancelled = true;
      restart.current = null;
      media.cancel();
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onResize);
      engine.current?.destroy();
      engine.current = null;
      setScrollLock(false);
      html().removeAttribute("data-intro-loading");
      for (const key of ["introPending", "introStill", "introFinal", "introStage", "introFailed", "loopHold"]) delete html().dataset[key];
    };
  }, []);

  // The world changed axis: the running engine moves over to it (nothing to do before it runs).
  useEffect(() => {
    if (engine.current && axis === currentAxis()) restart.current?.();
  }, [axis]);

  return (
    <section
      ref={sectionRef}
      id="top"
      data-scene
      data-pinned
      aria-label={`${site.name}: the roadrunner and the tunnel`}
      className="intro-scroll relative"
      style={{ "--intro-screens": INTRO.scroll.screens, "--intro-still-screens": INTRO.scroll.stillScreens } as CSSProperties}
    >
      {/* Sideways, when the world's loop comes back round to the scene: its edge in mirror image leads it in. */}
      <div aria-hidden="true" className="intro-lead">
        {lead}
      </div>
      {/* Where the film comes to rest (bus, ROADRUNNING, CTAs): the header's home link and deep links land here. */}
      <span id="intro-end" aria-hidden="true" className="intro-end pointer-events-none absolute" />
      {/*
        The pinned stage: its layers stay mounted while the scroll plays the timeline. Down the page it's
        as tall as the LARGE viewport (the film still fills the screen once a phone's toolbar hides); in the
        sideways world it fills the screen. The film and controls are placed within the small viewport.
      */}
      <div ref={stageRef} className="intro-stage theme-night sticky top-0 left-0 isolate h-lvh w-full overflow-hidden bg-black world:h-full world:w-screen">
        {/* Measures the small viewport for the engine (the frame the film is placed in). */}
        <div data-frame aria-hidden="true" className="pointer-events-none invisible absolute inset-x-0 top-0 h-svh" />
        <div aria-hidden="true" className="absolute inset-0">
          {film}
        </div>

        {/* The tunnel's darkness: it closes over everything as he runs in and hides the change (intro-engine.ts). */}
        <div data-fx="dark" aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 bg-black opacity-0" />

        {copy}

        {/* Branded loader until the film's opening frame is on screen (only when JS set data-intro-loading). */}
        <div data-intro-loader aria-hidden="true" className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black">
          <p className="font-display text-sm font-bold tracking-[0.6em] text-white/80 motion-safe:animate-pulse">{site.name.toUpperCase()}</p>
        </div>

        {/* "Ride along": which way to go (sideways, or down on a short landscape screen), and the film's
            download progress until it's in memory. */}
        {/* Centred by its outer box; the timeline fades and moves the inner one (left to GSAP, the centring
            itself could be lost: it folds a CSS translate into its own transform, rounded). */}
        <div className="intro-bottom-ui pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 text-xs font-semibold tracking-[0.25em] whitespace-nowrap text-white/85 uppercase [text-shadow:0_1px_10px_rgb(0_0_0/0.6)]">
          <div data-intro-hint="scroll" role="status" className="flex flex-col items-center gap-1.5">
            <span data-label className="flex items-center gap-1.5">
              <span className="pointer-coarse:hidden">Scroll to ride along</span>
              <span className="hidden pointer-coarse:inline">Swipe to ride along</span>
              <ChevronRight aria-hidden="true" className="size-5 motion-safe:animate-pulse short:rotate-90" />
            </span>
            <span data-pending className="flex flex-col items-center gap-2 text-white/70">
              Loading the ride&hellip;
              <span className="h-0.5 w-28 overflow-hidden rounded-full bg-white/15">
                <span data-intro-progress className="block h-full origin-left scale-x-0 bg-primary transition-transform duration-200" />
              </span>
            </span>
          </div>
        </div>

        {hasPlaceholderFootage ? (
          // Readable over the brightest frame, clear of the centred hint on narrow phones, never in the way
          // of a tap, and on screen in every layout while the footage isn't Roadrunning's own bus.
          <SampleTag
            label="Placeholder footage"
            className="intro-bottom-ui pointer-events-none absolute right-4 z-30 bg-black/75 text-white/90 max-sm:mb-14"
          />
        ) : null}
      </div>
    </section>
  );
}
