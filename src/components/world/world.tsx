"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { GuideBus } from "./guide-bus";
import { setAxis, SHORT_SCREEN } from "./world-axis";
import { setScene } from "./world-scene";
import { WorldScroll } from "./world-scroll";

/** Where the visitor was in the world (a reload, or back from another page, returns them there). */
const PLACE_KEY = "smokeys:world-place";

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

  useEffect(() => {
    const world = ref.current;
    if (!world) return;
    const short = window.matchMedia(SHORT_SCREEN);
    const layout = () => setAxis(short.matches ? "y" : "x");
    layout();
    short.addEventListener("change", layout);

    const input = new WorldScroll(world, () => document.documentElement.hasAttribute("data-scroll-lock"));
    input.start();

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
      if (url.hash !== window.location.hash) window.history.pushState(null, "", url.hash);
      arrive(el, false);
    };
    const onPopState = () => {
      const el = sideways() ? target(window.location.hash) : null;
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
    const update = () => {
      frame = 0;
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
      frame ||= requestAnimationFrame(update);
    };
    world.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
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
      window.removeEventListener("resize", onScroll);
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
