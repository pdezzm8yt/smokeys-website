/**
 * Moving through the sideways world (./world.tsx) with every kind of input,
 * on top of the world's own native horizontal scrolling (touch swipes,
 * horizontal trackpad swipes, scrollbar-free keyboard and focus scrolling,
 * in-page links all work without this):
 *
 * - a mouse wheel or a vertical trackpad swipe moves the world sideways —
 *   a stepped wheel eased (unless the visitor prefers less motion), a
 *   trackpad 1:1 (its deltas are already smooth) — except over something
 *   that scrolls vertically and still can (a panel's own content goes first),
 *   with Ctrl (zoom) or while pinch-zoomed, or a mostly horizontal swipe
 *   (native already);
 * - dragging with the mouse (never from a control or from text, so links and
 *   text selection still work), with a little momentum on release;
 * - keys: arrows step along, Page Down / Space go to the next scene (or a
 *   screen on, in a long one), Page Up / Shift+Space back, Home / End.
 *
 * Nothing here is needed to reach any content: it's all a convenience over
 * the native scroller (WCAG 2.5.7: dragging is never the only way).
 */
import { currentAxis } from "./world-axis";

const INTERACTIVE = "a, button, input, select, textarea, label, summary, video, audio, iframe, [contenteditable], [role=button], [role=tab], [role=radio], [role=slider], [role=switch], [role=option], [draggable=true], [data-no-drag]";
/** Where a mouse drag would get in the way of selecting text. */
const TEXT = "p, h1, h2, h3, h4, h5, h6, li, dt, dd, blockquote, figcaption, pre, code";
/** Keys belong to whatever has focus here (form fields, composite widgets that use arrows, dialogs). */
const KEY_OWNERS = "input, select, textarea, [contenteditable], [role=radio], [role=tab], [role=slider], [role=listbox], [role=menu], [role=grid], dialog";

/** How long the eased wheel takes to settle (time constant, ms). */
const EASE_MS = 110;

export class WorldScroll {
  /** Where the eased movement is heading (px), or null when idle. */
  private target: number | null = null;
  /** The last position this module wrote: anything else moving the world takes over from it. */
  private written = -1;
  private frame = 0;
  private last = 0;
  private drag: { id: number; x: number; left: number; moved: boolean; v: number; t: number } | null = null;
  private readonly reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  constructor(
    private readonly world: HTMLElement,
    /** True while the world must stay where it is (the tunnel scene waiting for its film). */
    private readonly locked: () => boolean,
  ) {}

  start() {
    window.addEventListener("wheel", this.onWheel, { passive: false });
    this.world.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("keydown", this.onKeyDown);
  }

  destroy() {
    window.removeEventListener("wheel", this.onWheel);
    this.world.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("keydown", this.onKeyDown);
    this.endDrag();
    cancelAnimationFrame(this.frame);
  }

  private get max() {
    return this.world.scrollWidth - this.world.clientWidth;
  }

  /** Move to `left` (px): eased, or at once with reduced motion (or `instant`). */
  moveTo(left: number, instant = false) {
    const to = Math.min(this.max, Math.max(0, left));
    if (instant || this.reduced.matches) {
      this.stop();
      this.world.scrollTo({ left: to, behavior: "instant" });
      return;
    }
    this.target = to;
    if (!this.frame) {
      this.last = performance.now();
      this.written = this.world.scrollLeft;
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  private moveBy(dx: number) {
    this.moveTo((this.target ?? this.world.scrollLeft) + dx);
  }

  private stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.target = null;
  }

  private readonly tick = (now: number) => {
    this.frame = 0;
    if (this.target === null) return;
    const at = this.world.scrollLeft;
    // Something else moved the world (a swipe, a key, an in-page link): it takes over.
    if (Math.abs(at - this.written) > 2) return this.stop();
    const dt = Math.min(64, now - this.last);
    this.last = now;
    const k = 1 - Math.exp(-dt / EASE_MS);
    let next = at + (this.target - at) * k;
    if (Math.abs(this.target - next) < 0.5) next = this.target;
    this.world.scrollTo({ left: next, behavior: "instant" });
    this.written = this.world.scrollLeft;
    if (next === this.target || this.written === at) {
      // Arrived (or can't go further).
      this.target = null;
      return;
    }
    this.frame = requestAnimationFrame(this.tick);
  };

  // ---------------------------------------------------------------------------
  // Wheel
  // ---------------------------------------------------------------------------

  private readonly onWheel = (e: WheelEvent) => {
    if (currentAxis() !== "x" || e.ctrlKey || e.defaultPrevented || !e.cancelable) return;
    if (window.visualViewport && window.visualViewport.scale > 1.01) return; // pinch-zoomed: let the page pan
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest("dialog")) return; // a modal's own content
    // Line mode (Firefox reading deltaMode first, some mice): ~1/6 of a 100px notch per line.
    const unit = e.deltaMode === 1 ? 100 / 6 : e.deltaMode === 2 ? this.world.clientWidth : 1;
    const dx = e.deltaX * unit;
    const dy = (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * unit;
    if (this.locked()) {
      e.preventDefault();
      return;
    }
    // A mostly sideways swipe: the browser already moves the world (or an inner sideways scroller).
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (this.target !== null) this.stop();
      return;
    }
    if (target && scrollsVertically(target, dy, this.world)) return;
    e.preventDefault();
    // A stepped mouse wheel (lines, or big whole-pixel notches) is eased; a trackpad's deltas are already
    // smooth (and carry the OS's momentum): applied as they come, easing them again would only add lag.
    const stepped = e.deltaMode === 1 || (Math.abs(dy) >= 50 && Number.isInteger(e.deltaY) && e.deltaX === 0);
    if (stepped) this.moveBy(dy);
    else {
      this.stop();
      this.world.scrollBy({ left: dy, behavior: "instant" });
    }
  };

  // ---------------------------------------------------------------------------
  // Mouse drag
  // ---------------------------------------------------------------------------

  private readonly onPointerDown = (e: PointerEvent) => {
    if (currentAxis() !== "x" || e.pointerType !== "mouse" || e.button !== 0 || this.locked()) return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target || target.closest(INTERACTIVE) || target.closest(TEXT)) return;
    this.stop();
    this.drag = { id: e.pointerId, x: e.clientX, left: this.world.scrollLeft, moved: false, v: 0, t: e.timeStamp };
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    if (!d.moved) {
      if (Math.abs(dx) < 6) return;
      d.moved = true;
      this.world.dataset.dragging = "";
      window.getSelection()?.removeAllRanges();
    }
    const before = this.world.scrollLeft;
    this.world.scrollTo({ left: d.left - dx, behavior: "instant" });
    const dt = Math.max(1, e.timeStamp - d.t);
    d.v = 0.8 * ((this.world.scrollLeft - before) / dt) + 0.2 * d.v; // px/ms, smoothed
    d.t = e.timeStamp;
  };

  private readonly onPointerUp = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.endDrag();
    if (!d.moved) return;
    // The click that ends a drag isn't a click on whatever was under the pointer.
    const swallow = (c: MouseEvent) => {
      c.preventDefault();
      c.stopPropagation();
    };
    window.addEventListener("click", swallow, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    // A little momentum, as if it was thrown.
    if (Math.abs(d.v) > 0.2 && e.timeStamp - d.t < 80) this.moveBy(d.v * 220);
  };

  private endDrag() {
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    delete this.world.dataset.dragging;
    this.drag = null;
  }

  // ---------------------------------------------------------------------------
  // Keys
  // ---------------------------------------------------------------------------

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (currentAxis() !== "x" || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const focus = document.activeElement;
    if (focus instanceof Element && focus.closest(KEY_OWNERS)) return;
    if (document.querySelector("dialog[open]")) return;
    const w = this.world.clientWidth;
    const at = this.target ?? this.world.scrollLeft;
    let to: number | null = null;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        to = at + w * 0.2;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        to = at - w * 0.2;
        break;
      case "PageDown":
        to = this.nextStop(at, 1);
        break;
      case "PageUp":
        to = this.nextStop(at, -1);
        break;
      case " ":
        // Space on a button or link activates it.
        if (focus instanceof Element && focus.closest("a, button, summary, [role=button]")) return;
        to = this.nextStop(at, e.shiftKey ? -1 : 1);
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = this.max;
        break;
      default:
        return;
    }
    if (this.locked()) return;
    e.preventDefault();
    this.moveTo(to);
  };

  /** Where a scene starts along the world (px). */
  sceneStart(scene: Element) {
    return scene.getBoundingClientRect().left - this.world.getBoundingClientRect().left + this.world.scrollLeft;
  }

  /**
   * The next scene's start in `dir` from `at`, but never more than a screen
   * away (a long scene, like the tunnel, goes a screen at a time).
   */
  private nextStop(at: number, dir: 1 | -1) {
    const w = this.world.clientWidth;
    const origin = this.world.getBoundingClientRect().left - this.world.scrollLeft;
    const starts = [...this.world.querySelectorAll<HTMLElement>("[data-scene]")].map((s) => s.getBoundingClientRect().left - origin);
    if (dir > 0) {
      const next = starts.find((s) => s > at + 8);
      return Math.min(next ?? this.max, at + w);
    }
    const prev = [...starts].reverse().find((s) => s < at - 8);
    return Math.max(prev ?? 0, at - w);
  }
}

/** Would a vertical wheel of `dy` scroll something between `from` and the world (a panel's own content)? */
function scrollsVertically(from: Element, dy: number, world: HTMLElement) {
  for (let el: Element | null = from; el && el !== world; el = el.parentElement) {
    if (el.scrollHeight <= el.clientHeight + 1) continue;
    const overflow = getComputedStyle(el).overflowY;
    if (overflow !== "auto" && overflow !== "scroll") continue;
    if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
  }
  return false;
}
