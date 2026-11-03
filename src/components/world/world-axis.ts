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
 * Too short for side-by-side scenes, whose panels would then have to scroll
 * inside themselves: phones on their side, short laptop windows, and any
 * screen at high zoom (400% zoom makes a 1280x1024 window 320x256 CSS px).
 * The pre-paint boot script (layout.tsx) uses the same query.
 */
export const SHORT_SCREEN = "(max-height: 40rem)";

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
 * (Sideways that's the place in the world as it's laid out right now: while
 * the tunnel scene is moved round to its end, the lap position, the world's
 * own order, is `worldLapPosition()`.)
 */
export function worldScroll() {
  const w = worldElement();
  return w ? w.scrollLeft : window.scrollY;
}

/**
 * Sideways, the world is a loop (./world-scroll.ts): the visitor's journey
 * goes on and on, one lap after another, while the world itself is one lap
 * long. Two numbers turn its scrollLeft into the journey:
 * - the length of the laps already completed;
 * - while the tunnel scene has been moved round to the END of the world (the
 *   journey coming back round to it: CSS `order`), its width: everything
 *   else then sits that much further left than in the world's own order.
 * So `worldTravel()` keeps counting on forever, with no jump at the join.
 */
let laps = 0;
let shifted = 0;

/** The journey at the start of the current lap (the tunnel scene's start). */
export const lapStart = () => laps;

/** How far the world's scrollLeft is behind the lap position (the tunnel's width while it's moved round to the end, else 0). */
export const lapShift = () => shifted;

/** Count a lap in (+its length): the journey has come round to the start again. */
export function addLap(length: number) {
  laps += length;
}

/** The tunnel scene moved round to the end of the world (`width`: its width), or back to the start (0). */
export function setShift(width: number) {
  shifted = width;
}

/**
 * Run `change`, which moves the world itself to keep the visitor's place
 * across a layout change (a scene getting shorter), without that counting as
 * travel: the journey stays where it was.
 */
export function keepTravel(change: () => void) {
  const w = worldElement();
  const before = w?.scrollLeft ?? 0;
  change();
  if (w) laps += before - w.scrollLeft;
}

/** A new world (the page was left or the world restarted): its journey starts from nothing. */
export function resetLaps() {
  laps = 0;
  shifted = 0;
}

/**
 * How far the visitor has travelled through the world (px), continuous
 * across the loop's join: what the guide bus's wheels and anything else that
 * moves WITH the travel should follow. In the column, the page's scrollY.
 */
export function worldTravel() {
  const w = worldElement();
  return w ? laps + shifted + w.scrollLeft : window.scrollY;
}

/**
 * Where the visitor is in the current lap (px, in the world's own order:
 * 0 = the start of the tunnel scene). In the column, the page's scrollY.
 */
export function worldLapPosition() {
  const w = worldElement();
  return w ? shifted + w.scrollLeft : window.scrollY;
}
