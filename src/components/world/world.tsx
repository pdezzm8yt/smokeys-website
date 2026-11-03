"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { GuideBus } from "./guide-bus";
import { resetLaps, setAxis, SHORT_SCREEN, worldLapPosition } from "./world-axis";
import { setScene, useWorldAxis } from "./world-scene";
import { WorldScroll } from "./world-scroll";

/** Where the visitor was in the world (a reload, or back from another page, returns them there). */
const PLACE_KEY = "smokeys:world-place";

type Place = { scene: HTMLElement; p: number };

/**
 * Where the visitor is, on whichever axis: the scene in view, and how far
 * through its scroll range (a scene no longer than the screen: its start).
 */
function placeNow(world: HTMLElement): Place | null {
  const x = document.documentElement.dataset.axis === "x";
  const at = x ? world.scrollLeft : window.scrollY;
  const view = x ? world.clientWidth : window.innerHeight;
  const origin = x ? world.getBoundingClientRect().left - world.scrollLeft : -window.scrollY;
  const all = [...world.querySelectorAll<HTMLElement>("[data-scene]")];
  const startOf = (s: HTMLElement) => (x ? s.getBoundingClientRect().left : s.getBoundingClientRect().top) - origin;
  // The one starting last at or before the middle of the screen (by where it is: the tunnel scene may have been
  // moved round to the end of the world, CSS order, while it's first in the page).
  const scene = all.filter((s) => startOf(s) <= at + view / 2).reduce<HTMLElement | null>((best, s) => (!best || startOf(s) > startOf(best) ? s : best), null) ?? all[0];
  if (!scene) return null;
  const size = x ? scene.offsetWidth : scene.offsetHeight;
  const p = size > view ? Math.min(1, Math.max(0, (at - startOf(scene)) / (size - view))) : 0;
  return { scene, p };
}

/** Back to a place, on the current axis. */
function goToPlace(world: HTMLElement, place: Place) {
  const x = document.documentElement.dataset.axis === "x";
  const view = x ? world.clientWidth : window.innerHeight;
  const r = place.scene.getBoundingClientRect();
  const start = x ? r.left - world.getBoundingClientRect().left + world.scrollLeft : r.top + window.scrollY;
  const size = x ? place.scene.offsetWidth : place.scene.offsetHeight;
  const to = start + place.p * Math.max(0, size - view);
  if (x) world.scrollTo({ left: to, behavior: "instant" });
  else window.scrollTo({ top: to, behavior: "instant" });
}

/** The "you are here" mark on the loop (sideways): its width, as a share of the screen. */
const MARK = 0.12;

/**
 * The homepage as ONE continuous world: the tunnel scene first, then every
 * scene of the site, side by side, then the footer, after which the journey
 * comes straight back round to the tunnel: sideways, the world is a loop
 * that only goes forward. It's a horizontal scroll container filling the
 * screen (not the page itself: a page wider than the screen makes phones zoom
 * out), moved by ./world-scroll.ts (wheel, trackpad, touch, drag, keys, the
 * "Next stop" button, one lap after another); keyboard focus, find-in-page
 * and assistive tech still bring what they land on into view. In-page links
 * (/#bus) travel to their scene, ahead.
 *
 * On short landscape screens (and without JavaScript) the same scenes stack
 * as a column and the page scrolls down instead (see ./world-axis.ts): an
 * ordinary page with a start and an end.
 */
export function World({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const marks = useRef<(HTMLDivElement | null)[]>([]);
  const next = useRef<HTMLButtonElement>(null);
  /** Where the visitor was when the world started turning (sideways ↔ column). */
  const turning = useRef<Place | null>(null);
  const axis = useWorldAxis();

  // The world has turned and re-rendered (components that differ per axis included): back to the same place,
  // before the tunnel scene's engine restarts (a passive effect), so it starts from there too.
  useLayoutEffect(() => {
    const world = ref.current;
    const place = turning.current;
    turning.current = null;
    if (world && place) goToPlace(world, place);
  }, [axis]);

  useEffect(() => {
    const world = ref.current;
    if (!world) return;
    const input = new WorldScroll(world, () => document.documentElement.hasAttribute("data-scroll-lock"));
    input.start();
    const onNext = () => input.next();
    const nextButton = next.current;
    nextButton?.addEventListener("click", onNext);

    // A panel whose content overflows it keeps vertical swipes for that content (globals.css); elsewhere a
    // vertical swipe moves the world, as the wheel does.
    const overflows = new ResizeObserver((entries) => {
      for (const e of entries) {
        const panel = e.target.closest<HTMLElement>("[data-panel]");
        if (panel) panel.toggleAttribute("data-overflows", panel.scrollHeight > panel.clientHeight + 1);
      }
    });
    for (const panel of world.querySelectorAll<HTMLElement>("[data-panel]")) {
      overflows.observe(panel);
      if (panel.firstElementChild) overflows.observe(panel.firstElementChild);
    }
    // The world is running (the boot script's failsafe stands down: it would fall back to the column).
    document.documentElement.dataset.worldReady = "";

    /**
     * Where the visitor is, kept up to date as they MOVE (never on a resize: by
     * the time a resize is heard, the scenes have already changed size, so the
     * same scroll position may be a different scene).
     */
    let lastPlace: Place | null = null;

    // Sideways, or a column on a short screen. Turning between them keeps the visitor where they were (the
    // same scene, as far through it): gone back to once the turned world has rendered (above).
    const short = window.matchMedia(SHORT_SCREEN);
    const layout = () => {
      const next = short.matches ? "y" : "x";
      const was = document.documentElement.dataset.axis;
      if (was && was !== next) turning.current = lastPlace ?? placeNow(world);
      setAxis(next);
    };
    layout();
    short.addEventListener("change", layout);

    // In-page links (the nav, the CTAs, the logo) travel to the START of their scene, the next time the journey
    // gets there (the loop only goes forward): the browser's own jump would go back, and line up whichever
    // edge is nearest. Focus moves there too, as with a native jump. Travelling isn't a new page: the
    // address and the history stay as they are.
    const sideways = () => document.documentElement.dataset.axis === "x";
    const target = (hash: string) => {
      if (hash.length < 2) return null;
      // A stray "%" in a shared link (#50%off) can't be decoded: that's simply no target, never an error.
      let id = hash.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        // (kept as it is)
      }
      const el = document.getElementById(id);
      return el && world.contains(el) ? el : null;
    };
    const focusOn = (el: HTMLElement) => {
      const focusable = el.matches("[tabindex], a, button, input, select, textarea") ? el : (el.closest<HTMLElement>("[data-scene]") ?? el);
      if (!focusable.hasAttribute("tabindex") && !focusable.matches("a, button, input, select, textarea")) focusable.tabIndex = -1;
      focusable.focus({ preventScroll: true });
    };
    const arrive = (el: HTMLElement, instant: boolean) => {
      input.goToElement(el, instant);
      focusOn(el);
    };
    const onClick = (e: MouseEvent) => {
      if (!sideways() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[href*='#']") : null;
      if (!a || (a.target && a.target !== "_self")) return;
      const url = new URL(a.href);
      if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) return;
      const el = target(url.hash);
      if (!el) return;
      e.preventDefault();
      // "Skip to content" skips the tunnel scene: from inside it, on to the content (its story passed by);
      // anywhere else the visitor is already among the content, so focus goes to the scene in view and
      // nothing moves (never round the whole loop).
      if (a.hash === "#main" && !world.contains(a)) {
        const here = sceneInView();
        if (here && here.id !== "top") return focusOn(here);
      }
      arrive(el, false);
    };
    // The address's #place changed some other way (typed, or an entry from before): travel on to it.
    const onPopState = () => {
      if (!sideways()) return;
      const el = target(window.location.hash);
      if (el) arrive(el, false);
    };
    document.addEventListener("click", onClick);
    window.addEventListener("popstate", onPopState);

    const linked = sideways() ? target(window.location.hash) : null;
    if (linked) {
      input.goToElement(linked, true);
      // There now: the address forgets it (the same entry, no new one), so a reload comes back to where the
      // visitor has got to by then (their saved place), not to this scene.
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
    // A reload or a return visit lands where the visitor was, unless a link asked for a place.
    else if (!window.location.hash) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(PLACE_KEY) ?? "null") as { id: string; f: number } | null;
        const scene = saved && document.getElementById(saved.id);
        if (scene && world.scrollWidth > world.clientWidth) {
          const origin = world.getBoundingClientRect().left - world.scrollLeft;
          const left = scene.getBoundingClientRect().left - origin + saved.f * scene.offsetWidth;
          world.scrollTo({ left, behavior: "instant" });
        }
      } catch {
        // (storage blocked: start at the beginning)
      }
    }

    // Progress along the world, and which scene is in view (the header's nav follows it).
    const scenes = () => [...world.querySelectorAll<HTMLElement>("[data-scene]")];
    function sceneInView() {
      const sideways = document.documentElement.dataset.axis === "x";
      const probe = sideways ? window.innerWidth / 2 : window.innerHeight / 2;
      return (
        scenes().find((s) => {
          const r = s.getBoundingClientRect();
          return sideways ? r.left <= probe && r.right > probe : r.top <= probe && r.bottom > probe;
        }) ?? null
      );
    }
    let frame = 0;
    let moved = true;
    const update = () => {
      frame = 0;
      if (moved) lastPlace = placeNow(world);
      moved = false;
      const sideways = document.documentElement.dataset.axis === "x";
      if (sideways) {
        // Where the visitor is on the loop: a mark that runs off the right edge as it comes back in on the left
        // (copies a lap apart), like a point going round a ring, never back to a start.
        const lap = input.lap;
        const f = lap > 0 ? (((worldLapPosition() % lap) + lap) % lap) / lap : 0;
        marks.current.forEach((m, i) => m?.style.setProperty("translate", `${((f + 1 - i) / MARK - 0.5) * 100}% 0`));
        // The "Next stop" button sits on the road; the tunnel's stage, where it's in the way of the placeholder
        // footage tag, has the hint (and the nav) instead.
        const top = document.getElementById("top");
        const r = top?.getBoundingClientRect();
        const corner = window.innerWidth - 40;
        const hide = !!r && r.left <= corner && r.right > corner;
        // Never hidden while it has focus (focus would be lost): it moves first to the scene arriving, the tunnel.
        if (hide && top && next.current && document.activeElement === next.current) {
          if (!top.hasAttribute("tabindex")) top.tabIndex = -1;
          top.focus({ preventScroll: true });
        }
        if (next.current) next.current.hidden = hide;
      } else if (bar.current) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        bar.current.style.scale = `${max > 0 ? Math.min(1, window.scrollY / max) : 0} 1`;
      }
      // The scene under the middle of the screen.
      setScene(sceneInView()?.id ?? null);
    };
    const onScroll = () => {
      moved = true;
      frame ||= requestAnimationFrame(update);
    };
    // Sideways, a resize changes the scenes' widths (several follow the screen's height): the visitor stays
    // in the same scene, as far through it, rather than wherever the old scroll position now falls.
    let resizing = 0;
    const onResize = () => {
      cancelAnimationFrame(resizing);
      resizing = requestAnimationFrame(() => {
        if (document.documentElement.dataset.axis === "x" && lastPlace) goToPlace(world, lastPlace);
        frame ||= requestAnimationFrame(update);
      });
    };
    world.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    update();

    const savePlace = () => {
      const sideways = document.documentElement.dataset.axis === "x";
      const at = sideways ? world.scrollLeft : window.scrollY;
      const origin = sideways ? world.getBoundingClientRect().left - world.scrollLeft : -window.scrollY;
      const all = scenes();
      const startOf = (s: HTMLElement) => (sideways ? s.getBoundingClientRect().left : s.getBoundingClientRect().top) - origin;
      // (By where each scene is, as in placeNow: not page order.)
      const scene = all.filter((s) => startOf(s) <= at + 1).reduce<HTMLElement | null>((best, s) => (!best || startOf(s) > startOf(best) ? s : best), null);
      if (!scene?.id) return;
      const start = startOf(scene);
      const size = sideways ? scene.offsetWidth : scene.offsetHeight;
      try {
        sessionStorage.setItem(PLACE_KEY, JSON.stringify({ id: scene.id, f: size > 0 ? (at - start) / size : 0 }));
      } catch {
        // (storage blocked)
      }
    };
    window.addEventListener("pagehide", savePlace);

    return () => {
      savePlace();
      short.removeEventListener("change", layout);
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPopState);
      nextButton?.removeEventListener("click", onNext);
      overflows.disconnect();
      input.destroy();
      world.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(resizing);
      window.removeEventListener("pagehide", savePlace);
      cancelAnimationFrame(frame);
      setScene(null);
      setAxis(null);
      resetLaps();
      delete document.documentElement.dataset.worldReady;
    };
  }, []);

  return (
    <>
      <div ref={ref} data-world className="world">
        {children}
      </div>
      <GuideBus />
      {/*
        A tap on to the next stop (Page Down's move): travelling never needs a swipe or a drag (WCAG 2.5.1,
        2.5.7). Sideways only, at the right end of the road, once the world is running.
      */}
      <button
        ref={next}
        type="button"
        aria-label="Next stop"
        className={cn(
          "fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(calc(var(--road-h)/2-1.375rem),env(safe-area-inset-bottom))] z-30 hidden size-11 place-items-center rounded-full",
          "bg-surface-raised text-foreground shadow-lg ring-1 ring-border backdrop-blur-xl transition-colors hover:bg-muted",
          "world:grid [html:not([data-world-ready])_&]:hidden! [html[data-scroll-lock]_&]:hidden! [&[hidden]]:hidden!",
        )}
      >
        <ChevronRight aria-hidden="true" className="size-6" />
      </button>
      {/* Where you are (the world has no scrollbar): a thin line along the bottom. Sideways, a mark going round
          the loop; down the column, how far down the page. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-0.5 overflow-hidden bg-foreground/10">
        <div ref={bar} className="h-full origin-left bg-primary world:hidden" style={{ scale: "0 1" }} />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            ref={(el) => {
              marks.current[i] = el;
            }}
            data-loop-mark
            className="absolute inset-y-0 left-0 hidden w-[12%] bg-primary world:block"
            style={{ translate: `${((1 - i) / MARK - 0.5) * 100}% 0` }}
          />
        ))}
      </div>
    </>
  );
}
