"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { GuideBus } from "./guide-bus";
import { setAxis, SHORT_SCREEN } from "./world-axis";
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
  const scene = [...all].reverse().find((s) => startOf(s) <= at + view / 2) ?? all[0];
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

/**
 * The homepage as ONE continuous world: the tunnel scene first, then every
 * scene of the site, side by side. The world is a horizontal scroll container
 * filling the screen (not the page itself: a page wider than the screen makes
 * phones zoom out), so touch swipes, horizontal trackpad swipes, keyboard and
 * focus scrolling and in-page links (/#bus) all move it natively;
 * ./world-scroll.ts adds the eased mouse wheel, mouse drag and scene keys.
 *
 * On short landscape screens (and without JavaScript) the same scenes stack
 * as a column and the page scrolls down instead (see ./world-axis.ts).
 */
export function World({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
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

    // In-page links (the nav, the CTAs, the logo) glide to the START of their scene: the browser's own jump
    // would line up whichever edge is nearest. Focus moves there too, as with a native jump.
    const sideways = () => document.documentElement.dataset.axis === "x";
    const target = (hash: string) => {
      const el = hash.length > 1 ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
      return el && world.contains(el) ? el : null;
    };
    const arrive = (el: HTMLElement, instant: boolean) => {
      input.moveTo(input.sceneStart(el), instant);
      const focusable = el.matches("[tabindex], a, button, input, select, textarea") ? el : (el.closest<HTMLElement>("[data-scene]") ?? el);
      if (!focusable.hasAttribute("tabindex") && !focusable.matches("a, button, input, select, textarea")) focusable.tabIndex = -1;
      focusable.focus({ preventScroll: true });
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
      if (url.hash !== window.location.hash) {
        // Remember where the visitor was on the entry they're leaving (keeping Next's own state): Back returns there.
        window.history.replaceState({ ...(window.history.state as object | null), worldX: world.scrollLeft }, "");
        window.history.pushState(null, "", url.hash);
      }
      arrive(el, false);
    };
    const onPopState = (e: PopStateEvent) => {
      if (!sideways()) return;
      const back = (e.state as { worldX?: unknown } | null)?.worldX;
      if (typeof back === "number") return input.moveTo(back);
      const el = target(window.location.hash);
      if (el) arrive(el, false);
    };
    document.addEventListener("click", onClick);
    window.addEventListener("popstate", onPopState);

    const linked = sideways() ? target(window.location.hash) : null;
    if (linked) input.moveTo(input.sceneStart(linked), true);
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
    let frame = 0;
    let moved = true;
    const update = () => {
      frame = 0;
      if (moved) lastPlace = placeNow(world);
      moved = false;
      const sideways = document.documentElement.dataset.axis === "x";
      const at = sideways ? world.scrollLeft : window.scrollY;
      const max = sideways ? world.scrollWidth - world.clientWidth : document.documentElement.scrollHeight - window.innerHeight;
      if (bar.current) bar.current.style.scale = `${max > 0 ? Math.min(1, at / max) : 0} 1`;
      // The scene under the middle of the screen.
      const probe = sideways ? window.innerWidth / 2 : window.innerHeight / 2;
      const current = scenes().find((s) => {
        const r = s.getBoundingClientRect();
        return sideways ? r.left <= probe && r.right > probe : r.top <= probe && r.bottom > probe;
      });
      setScene(current?.id ?? null);
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
      const scene = [...all].reverse().find((s) => (sideways ? s.getBoundingClientRect().left : s.getBoundingClientRect().top) - origin <= at + 1);
      if (!scene?.id) return;
      const start = (sideways ? scene.getBoundingClientRect().left : scene.getBoundingClientRect().top) - origin;
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
      input.destroy();
      world.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(resizing);
      window.removeEventListener("pagehide", savePlace);
      cancelAnimationFrame(frame);
      setScene(null);
      setAxis(null);
    };
  }, []);

  return (
    <>
      <div ref={ref} data-world className="world">
        {children}
      </div>
      <GuideBus />
      {/* Where you are along the world (its scrollbar is hidden): a thin line along the bottom. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-0.5 bg-foreground/10">
        <div ref={bar} className="h-full origin-left bg-primary" style={{ scale: "0 1" }} />
      </div>
    </>
  );
}
