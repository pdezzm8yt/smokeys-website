/**
 * Which way the world runs (the homepage is one continuous world, see
 * ./world.tsx): sideways ("x") wherever there's room, or as a column ("y") on
 * short landscape screens (a phone on its side, a desktop at very high zoom),
 * where a sideways page with panels too tall for the screen would mean
 * scrolling in two directions (WCAG 1.4.10). Without JavaScript the world is a
 * column too (nothing would turn the mouse wheel sideways).
 *
 * The pre-paint boot script (src/app/layout.tsx) sets html[data-axis] before
 * the first frame; World keeps it up to date (rotation, resize) and this module
 * lets components follow it.
 */
export type Axis = "x" | "y";

/**
 * Too short for side-by-side scenes: phones on their side, and any screen at
 * high zoom (400% zoom makes a 1280x1024 window 320x256 CSS px).
 */
export const SHORT_SCREEN = "(max-height: 30rem)";

export const html = () => document.documentElement;

/** The axis the page is laid out on right now (no world on this page, or no JS: "y"). */
export function currentAxis(): Axis {
  return html().dataset.axis === "x" ? "x" : "y";
}

/** The world's scroll container while it runs sideways. */
export function worldElement(): HTMLElement | null {
  return currentAxis() === "x" ? document.querySelector<HTMLElement>("[data-world]") : null;
}

const listeners = new Set<() => void>();

/** Lay the page out on `axis` and tell subscribers (World calls this). */
export function setAxis(axis: Axis | null) {
  const before = html().dataset.axis ?? null;
  if (axis) html().dataset.axis = axis;
  else delete html().dataset.axis;
  if (before !== (axis ?? null)) for (const l of listeners) l();
}

export function subscribeAxis(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The scroll position that moves the world along, in either layout: the
 * world's scrollLeft when it runs sideways, the page's scrollY otherwise.
 */
export function worldScroll() {
  const w = worldElement();
  return w ? w.scrollLeft : window.scrollY;
}
