import { useEffect, useRef, type RefObject } from "react";

type IntroInputOptions = {
  scope: RefObject<HTMLElement | null>;
  /** True while the intro owns the screen (scroll locked). Blocking listeners exist only then. */
  active: boolean;
  onAdvance: () => void;
  /** The user left the intro some other way (in-page link, focus or scroll moved on). */
  onSkip: () => void;
};

/**
 * Global inputs while the intro plays: wheel, swipe-up and Space/Enter/↓
 * advance it (click/tap is handled on the stage itself). Zoom gestures are
 * left alone. Anything that takes the user past the stage (an in-page link,
 * Shift+Tab into the page, a programmatic scroll) skips the intro instead of
 * fighting the scroll lock.
 */
export function useIntroInput({ scope, active, onAdvance, onSkip }: IntroInputOptions) {
  // Latest callbacks without re-binding listeners on every render.
  const handlers = useRef({ onAdvance, onSkip });
  useEffect(() => {
    handlers.current = { onAdvance, onSkip };
  });

  useEffect(() => {
    if (!active) return; // after the reveal, no blocking (non-passive) listeners remain

    let touchStartY: number | null = null;
    let multiTouch = false;
    // While the page is pinch-zoomed, one-finger drags pan the zoomed view: leave them alone.
    const zoomed = () => (window.visualViewport?.scale ?? 1) > 1.01;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // trackpad pinch / ctrl+wheel = zoom, not "continue"
      e.preventDefault();
      if (e.deltaY > 6) handlers.current.onAdvance();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("a, button, input, textarea, select, dialog, [contenteditable]")) return;
      if ([" ", "Enter", "ArrowDown", "PageDown"].includes(e.key)) {
        e.preventDefault();
        handlers.current.onAdvance();
      }
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 1) multiTouch = true;
      touchStartY = e.touches.length === 1 ? (e.touches[0]?.clientY ?? null) : null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) multiTouch = true;
      if (!multiTouch && !zoomed() && e.cancelable) e.preventDefault(); // pinch-zoom and zoomed panning stay allowed
    };
    const onTouchEnd = (e: TouchEvent) => {
      const endY = e.changedTouches[0]?.clientY;
      if (!multiTouch && !zoomed() && touchStartY !== null && endY !== undefined && touchStartY - endY > 40) handlers.current.onAdvance();
      if (e.touches.length === 0) {
        multiTouch = false;
        touchStartY = null;
      }
    };
    const outsideStage = (el: EventTarget | null) => el instanceof Node && !scope.current?.contains(el);
    const onDocClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement | null)?.closest('a[href^="#"]');
      if (link && outsideStage(link)) handlers.current.onSkip();
    };
    const onFocusIn = (e: FocusEvent) => {
      if ((e.target as HTMLElement | null)?.closest("main, footer")) handlers.current.onSkip();
    };
    const onScroll = () => {
      if (window.scrollY > 40) handlers.current.onSkip(); // focus-induced scroll, find-in-page, late restoration
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onDocClick, true);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [active, scope]);
}
