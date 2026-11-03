/**
 * Moving through the sideways world (./world.tsx): a loop that only goes
 * FORWARD. The world is one lap long (the tunnel scene, every scene, the
 * footer); travelling on past the footer comes straight back round to the
 * tunnel's opening frame and on into the next lap, with no join to see:
 *
 * - once the end of the lap is in sight (and the tunnel is off the screen),
 *   the tunnel scene is moved round to the END of the world (CSS `order`,
 *   the scroll position moved back by its width in the same moment: nothing
 *   on the screen changes), so the journey travels on into the real thing,
 *   its stage arriving from the right and coming to rest pinned, as it does
 *   at the very start;
 * - once the visitor is in it (its stage pinned and covering the screen,
 *   where it looks the same either way), it goes back to the start of the
 *   world, the scroll position with it, and a new lap begins.
 *
 * world-axis.ts keeps counting the journey (`worldTravel()`), so nothing that
 * moves with it jumps, and every move here is made along the journey, so
 * velocity and momentum carry straight on round.
 *
 * The browser never scrolls the world on the visitor's say (sideways swipes
 * are taken here, wheels and keys too); keyboard focus, find-in-page and
 * assistive tech still move it (and it follows), as does the browser's own
 * panning while pinch-zoomed in.
 *
 * - The mouse wheel and the trackpad (either axis) move it forward: a stepped
 *   wheel eased (unless the visitor prefers less motion), a trackpad 1:1 (its
 *   deltas are already smooth and carry the OS's momentum). A panel that can
 *   still scroll vertically gets a vertical wheel first; Ctrl (zoom) and
 *   pinch-zoom are left alone.
 * - Touch swipes (and pen) and mouse drags: the world follows the finger
 *   forward and carries on when thrown; a vertical swipe moves it too (up is
 *   on), except on a panel whose content overflows it (that content scrolls,
 *   data-overflows). Never a mouse drag from a control or from text (links and
 *   text selection still work).
 * - Keys: → / ↓ step forward, Page Down / Space to the next scene (or a
 *   screen on, in a long one), Home to where the header's home link goes,
 *   End to the last stop (the footer).
 * - Anything that asks to go BACK (wheel up, a swipe or drag the other way,
 *   ← / ↑ / Page Up / Shift+Space) only tugs the world back a little and lets
 *   it spring forward again: the journey goes one way.
 * - In-page links (./world.tsx) travel to their scene ahead: a trip past the
 *   tunnel scene passes its stage by (it stays as it is: pinned, it looks the
 *   same all the way), one that ends in it plays its story on the way in.
 */
import { addLap, currentAxis, lapShift, lapStart, setShift } from "./world-axis";

const INTERACTIVE = "a, button, input, select, textarea, label, summary, video, audio, iframe, [contenteditable], [role=button], [role=tab], [role=radio], [role=slider], [role=switch], [role=option], [draggable=true], [data-no-drag]";
/** Where a mouse drag would get in the way of selecting text. */
const TEXT = "p, h1, h2, h3, h4, h5, h6, li, dt, dd, blockquote, figcaption, pre, code";
/** A touch swipe moves the world from anywhere but these (they use the finger themselves). */
const TOUCH_OWNERS = "input, select, textarea, video, audio, iframe, [contenteditable], [role=slider], [draggable=true], [data-no-drag]";
/** Keys belong to whatever has focus here (form fields, composite widgets that use arrows, dialogs). */
const KEY_OWNERS = "input, select, textarea, [contenteditable], [role=radio], [role=tab], [role=slider], [role=listbox], [role=menu], [role=grid], dialog";

/** How long the eased wheel takes to settle (time constant, ms). */
const EASE_MS = 110;
/** A throw carries on like a native fling: its speed decays with this time constant (ms). */
const THROW_MS = 325;
/** How far back the world gives at most when asked to go back (px; smaller on narrow screens). */
const TUG_MAX = 120;
/** How fast a tug springs back once the visitor lets go (time constant, ms). */
const TUG_RETURN_MS = 160;
/** How much slower a trip goes through the tunnel's story than elsewhere: the dark reads as a tunnel, not a flash. */
const STORY_PACE = 4;

/** Ease in and out: a long trip accelerates, cruises and settles. */
const easeInOut = (f: number) => (f < 0.5 ? 4 * f * f * f : 1 - (-2 * f + 2) ** 3 / 2);

/**
 * A trip's stretches, each with how much of the trip's time it takes per px:
 * 1 normally, 0 for a stretch passed at once (it looks the same all the way:
 * the tunnel's stage, pinned and left as it is), more for one taken slowly
 * (the tunnel's story, played on the way into it).
 */
type Leg = { length: number; weight: number };
type Travel = { kind: "travel"; from: number; to: number; t0: number; ms: number; legs: Leg[]; effort: number; trip: "past" | "story" | null };
/** An eased move: `at` is where it has got to (kept exactly, not read back from the snapped scroll position). */
type Ease = { kind: "ease"; to: number; tau: number; at: number };
type Motion = Ease | Travel;

export class WorldScroll {
  /** The move under way (eased toward a place, or a timed trip), or null when idle. */
  private motion: Motion | null = null;
  /**
   * How far the world is tugged back (px) from where the journey has got to:
   * shown as `position − tug`, springing back to 0 when the visitor lets go.
   */
  private tug = 0;
  /** Where the tug is heading (it eases there while held, then home to 0). */
  private tugAim = 0;
  /** Until when (performance.now) the tug is held: the visitor is still asking to go back. */
  private tugHeld = 0;
  /** The last scrollLeft this module wrote: anything else moving the world takes over from it. */
  private written = -1;
  /** Where the world was at the last scroll event (to tell a jump round the loop from a step back). */
  private seen = 0;
  /**
   * Where this module last put the journey, exactly (the scroll position it
   * wrote is snapped to device pixels): read back while nothing else has
   * moved the world, so a tug springs back, and a trackpad's small deltas
   * add up, to the very pixel.
   */
  private placed: number | null = null;
  private frame = 0;
  private last = -1;
  /** How long a frame takes on this screen (ms, measured: 60, 90, 120 Hz…): a move's first frame counts as one. */
  private frameMs = 1000 / 60;
  /** The pointer that touched the world while it was moving: it stopped it, and its tap isn't a click. */
  private stopper = -1;
  private drag: {
    id: number;
    touch: boolean;
    /** Which way it goes: sideways, or (touch) up and down, decided as it starts moving. */
    axis: "x" | "y";
    x: number;
    y: number;
    /** Where the journey was when the drag started. */
    from: number;
    /** How far the drag had to make up before moving forward (the tug it caught, as finger travel). */
    owed: number;
    /** The furthest forward it has got (px past `from`). */
    best: number;
    moved: boolean;
    /** Forward finger speed, px/ms (smoothed), and when it was last measured. */
    v: number;
    t: number;
    lastForward: number;
    /** Text was selected already when it started (a long press that selects text isn't a swipe; a swipe after one is). */
    selected: boolean;
  } | null = null;
  private readonly reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  constructor(
    private readonly world: HTMLElement,
    /** True while the world must stay where it is (the tunnel scene waiting for its film). */
    private readonly locked: () => boolean,
  ) {}

  start() {
    window.addEventListener("wheel", this.onWheel, { passive: false });
    this.world.addEventListener("pointerdown", this.onPointerDown);
    this.world.addEventListener("mousedown", this.onMouseDown);
    this.world.addEventListener("dragstart", this.onDragStart);
    window.addEventListener("keydown", this.onKeyDown);
    this.world.addEventListener("focusin", this.onFocusIn);
    this.world.addEventListener("scroll", this.onScroll, { passive: true });
    window.visualViewport?.addEventListener("resize", this.onZoom);
    this.seen = this.world.scrollLeft;
    this.onZoom();
  }

  destroy() {
    window.removeEventListener("wheel", this.onWheel);
    this.world.removeEventListener("pointerdown", this.onPointerDown);
    this.world.removeEventListener("mousedown", this.onMouseDown);
    this.world.removeEventListener("dragstart", this.onDragStart);
    window.removeEventListener("keydown", this.onKeyDown);
    this.world.removeEventListener("focusin", this.onFocusIn);
    this.world.removeEventListener("scroll", this.onScroll);
    window.visualViewport?.removeEventListener("resize", this.onZoom);
    delete document.documentElement.dataset.zoomed;
    this.endDrag();
    this.setMotion(null);
    cancelAnimationFrame(this.frame);
    this.turn(false);
  }

  // ---------------------------------------------------------------------------
  // Where the world is, and placing it
  // ---------------------------------------------------------------------------

  /** The scene the loop comes back round to: the world's first (the tunnel). */
  private get opening() {
    return this.world.firstElementChild instanceof HTMLElement ? this.world.firstElementChild : null;
  }

  /** One lap of the loop (px): every scene of the world, end to end. */
  get lap() {
    let length = 0;
    for (const child of this.world.children) length += (child as HTMLElement).offsetWidth;
    return length;
  }

  /** Where the journey has got to (px, continuous across laps; a tug back isn't counted). */
  get position() {
    this.resync();
    if (this.placed !== null && !this.takenOver()) return this.placed;
    return lapStart() + lapShift() + this.world.scrollLeft + this.tug;
  }

  /**
   * While the tunnel scene is round at the end, the shift is its width: if
   * that has changed meanwhile (a resize; its story switched to stills),
   * the shift follows it without the journey moving (the laps made up for).
   */
  private resync() {
    const shift = lapShift();
    const width = shift > 0 ? (this.opening?.offsetWidth ?? 0) : 0;
    if (!shift || !width || width === shift) return;
    addLap(shift - width);
    setShift(width);
    this.world.style.setProperty("--road-shift", `${width}px`);
  }

  /** Where in the lap an element starts (px, in the world's own order: 0 = the start of the tunnel scene). */
  sceneStart(el: Element) {
    this.resync();
    const at = el.getBoundingClientRect().left - this.world.getBoundingClientRect().left + this.world.scrollLeft + lapShift();
    const lap = this.lap;
    return lap > 0 ? ((at % lap) + lap) % lap : at;
  }

  /**
   * The tunnel scene round at the end of the world (`round`), or back at its
   * start. Only ever while that changes nothing on the screen (see place()).
   */
  private turn(round: boolean) {
    const opening = this.opening;
    if (!opening || round === lapShift() > 0) return;
    const width = round ? opening.offsetWidth : 0;
    opening.style.order = round ? "1" : "";
    opening.toggleAttribute("data-round", round);
    setShift(width);
    // The road's dashes are drawn from the world's start: they keep their place on the screen (globals.css).
    this.world.style.setProperty("--road-shift", `${width}px`);
  }

  /**
   * Show the journey at `position` (minus the tug): the place in the lap, the
   * tunnel scene where it needs to be for it (moved round to the end once
   * the end of the lap is in sight, back at the start once its stage is
   * pinned in the next lap: both moments when the swap shows nothing), and
   * the scroll position for that. Returns true when it was held at the join
   * (html[data-loop-hold]: the tunnel scene isn't ready to carry on from yet;
   * the journey waits at its opening frame, as it does at the very start).
   */
  private place(position: number) {
    this.resync();
    const lap = this.lap;
    const view = this.world.clientWidth;
    const opening = this.opening;
    // A tug never takes the world back past the start of the lap (the tunnel's opening frame): it gives no further.
    const into = Math.max(0, position - lapStart());
    if (this.tug > into) {
      this.tug = into;
      this.tugAim = Math.min(this.tugAim, into);
    }
    // Where in the lap (the world's own order).
    let a = Math.max(0, position - this.tug - lapStart());
    let held = false;
    let wrapped = false;
    if (!opening || lap <= view) {
      this.write(0);
      this.placed = null;
      return held;
    }
    const first = opening.offsetWidth;
    const last = this.world.lastElementChild instanceof HTMLElement ? this.world.lastElementChild.offsetWidth : 0;
    // Into the next lap: its start is the tunnel's opening frame (pinned, it covers the screen there).
    const hold = document.documentElement.hasAttribute("data-loop-hold");
    while (a >= lap) {
      if (hold) {
        a = lap;
        held = true;
        break;
      }
      addLap(lap);
      a -= lap;
      wrapped = true;
    }
    this.turn(this.roundAt(a, lap, view, first, last));
    this.write(a - lapShift());
    this.placed = lapStart() + a + this.tug;
    // Round into a new lap (and not on a trip, whose destination already has focus): see refocus().
    if (wrapped && this.motion?.kind !== "travel") this.refocus();
    return held;
  }

  /**
   * Whether the tunnel scene belongs round at the end of the world for lap
   * position `a`: from a screen before the last scene comes in (the tunnel
   * off the screen either way); back at the start a screen before that (a
   * little give, so a tug or a focus move doesn't swap it to and fro), and
   * always in the tunnel itself, where it's pinned at the start of a lap.
   */
  private roundAt(a: number, lap: number, view: number, first: number, last: number) {
    const roundFrom = Math.min(lap - view, Math.max(first, lap - last - view));
    const round = a >= roundFrom || (lapShift() > 0 && a >= Math.max(first, roundFrom - view));
    return round && a >= first;
  }

  private write(left: number) {
    this.world.scrollTo({ left, behavior: "instant" });
    this.written = this.seen = this.world.scrollLeft;
  }

  /**
   * The journey has come round into a new lap: keyboard focus left on
   * something far off the screen (in the last lap) moves to the tunnel scene
   * in view, without scrolling, so the next Tab carries on from what's on the
   * screen rather than jumping a lap away to it.
   */
  private refocus() {
    const focus = document.activeElement;
    if (!(focus instanceof HTMLElement) || !this.world.contains(focus) || focus.closest("dialog")) return;
    const r = focus.getBoundingClientRect();
    const view = this.world.clientWidth;
    if (r.right > -view && r.left < 2 * view) return;
    const opening = this.opening;
    if (!opening) return;
    if (!opening.hasAttribute("tabindex")) opening.tabIndex = -1;
    opening.focus({ preventScroll: true });
  }

  /** Something else moved the world (focus, find in page, a link, a resize): it takes over. */
  private takenOver() {
    return Math.abs(this.world.scrollLeft - this.written) > 2;
  }

  // ---------------------------------------------------------------------------
  // Moves
  // ---------------------------------------------------------------------------

  /** Ease to `position` along the journey (or go at once with reduced motion, or `instant`). */
  moveTo(position: number, instant = false, tau = EASE_MS) {
    if (instant || this.reduced.matches) {
      this.halt();
      this.place(position);
      return;
    }
    const m = this.motion;
    this.setMotion({ kind: "ease", to: position, tau, at: m?.kind === "ease" ? m.at : this.position });
    this.run();
  }

  /**
   * A trip to `position` (nav links, Home, End): eased in and out, taking
   * longer the further it is. Past the tunnel scene, its stage (pinned) is
   * left as it is and passed at once, so the trip never plays its story; a
   * trip that ends in it plays the story on the way in, at a steady pace.
   */
  travelTo(position: number, instant = false) {
    const from = this.position;
    if (instant || this.reduced.matches || Math.abs(position - from) < 1) {
      this.halt();
      this.place(position);
      return;
    }
    const legs: Leg[] = [];
    let trip: "past" | "story" | null = null;
    const pinned = this.pinnedAhead(from);
    if (pinned && position > pinned.from && pinned.to > from) {
      const into = Math.max(from, pinned.from);
      if (into > from) legs.push({ length: into - from, weight: 1 });
      if (position > pinned.to + 0.5) {
        trip = "past";
        legs.push({ length: pinned.to - into, weight: 0 });
        legs.push({ length: position - pinned.to, weight: 1 });
      } else {
        trip = "story";
        legs.push({ length: position - into, weight: STORY_PACE });
      }
    } else legs.push({ length: position - from, weight: 1 });
    const effort = legs.reduce((sum, leg) => sum + Math.abs(leg.length) * leg.weight, 0);
    const screens = effort / Math.max(1, this.world.clientWidth);
    this.setMotion({ kind: "travel", from, to: position, t0: -1, ms: Math.min(2400, 450 + 260 * Math.sqrt(screens)), legs, effort, trip });
    this.run();
  }

  /** Where a trip is `f` (0–1, eased) of the way along: its legs in turn, a weightless one passed at once. */
  private along(m: Travel, f: number) {
    let left = m.effort * f;
    let at = m.from;
    for (const leg of m.legs) {
      const cost = Math.abs(leg.length) * leg.weight;
      if (leg.weight > 0 && left < cost) return at + Math.sign(leg.length) * (left / leg.weight);
      left -= cost;
      at += leg.length;
    }
    return m.to;
  }

  /**
   * The next stretch of the journey (px) where the pinned scene (the tunnel's
   * stage, [data-pinned]) stays put, from `from` on: from where the scene
   * starts to where its stage starts moving off.
   */
  private pinnedAhead(from: number) {
    const scene = this.world.querySelector<HTMLElement>("[data-pinned]");
    const lap = this.lap;
    if (!scene || lap <= 1) return null;
    const span = scene.offsetWidth - this.world.clientWidth;
    let at = lapStart() + this.sceneStart(scene);
    while (at + span <= from) at += lap;
    while (at - lap + span > from) at -= lap;
    return { from: at, to: at + span };
  }

  /** Go to an element's place (where its scene starts, or where it is, for a mark inside one), as a nav link does. */
  goToElement(el: HTMLElement, instant = false) {
    const scene = el.closest<HTMLElement>("[data-scene]") ?? el;
    const from = this.sceneStart(scene);
    this.goToPlace(this.sceneStart(el), instant, { from, to: from + scene.offsetWidth });
  }

  /**
   * Go to a place in the lap (px, the world's own order), the NEXT time the
   * journey gets there: unless the visitor is in the very scene it's in
   * (`scene`, from its start), or it's just behind (within a screen): then
   * back to it, lined up again.
   */
  goToPlace(inLap: number, instant = false, scene?: { from: number; to: number }) {
    const a = this.position - lapStart();
    const inside = scene && a >= scene.from - 1 && a < scene.to && inLap <= a + 1;
    this.travelTo(inside ? lapStart() + inLap : this.ahead(inLap, this.world.clientWidth), instant);
  }

  /** The first time the journey reaches `inLap` from `slack` px behind where it is now. */
  private ahead(inLap: number, slack: number) {
    const lap = this.lap;
    const at = this.position;
    let to = lapStart() + inLap;
    if (lap <= 1) return to;
    while (to < at - slack) to += lap;
    while (to - lap >= at - slack) to -= lap;
    return to;
  }

  /** On to the next stop (Page Down's move, for the "Next stop" button). */
  next() {
    if (this.locked() || currentAxis() !== "x") return;
    this.release();
    const m = this.motion;
    this.moveTo(this.nextStop(m ? m.to : this.position));
  }

  private moveBy(dx: number) {
    const m = this.motion;
    this.moveTo((m ? m.to : this.position) + dx);
  }

  /** Forward at once by `dx` (a trackpad's own smooth deltas). */
  private stepBy(dx: number) {
    this.setMotion(null);
    this.place(this.position + dx);
  }

  /**
   * Stop any move and let go of any tug where it is: what's on the screen
   * becomes where the journey is (nothing jumps when the next move starts).
   */
  private halt() {
    if (this.takenOver()) this.placed = null;
    else if (this.tug) this.placed = this.position - this.tug;
    this.setMotion(null);
    this.tug = 0;
    this.tugAim = 0;
  }

  /** The move under way, and what a trip asks of the tunnel scene meanwhile (html[data-trip], intro-engine.ts). */
  private setMotion(motion: Motion | null) {
    this.motion = motion;
    const trip = motion?.kind === "travel" ? motion.trip : null;
    if (trip) document.documentElement.dataset.trip = trip;
    else delete document.documentElement.dataset.trip;
  }

  /**
   * Asked to go back by `by` px: the world gives a little (less and less the
   * further it's pushed) and springs forward again once the asking stops.
   */
  private tugBack(by: number) {
    if (this.reduced.matches || by <= 0) return;
    const max = this.tugMax();
    const raw = max * -Math.log(1 - Math.min(0.999, this.tugAim / max)) + by;
    this.tugAim = max * (1 - Math.exp(-raw / max));
    this.tugHeld = performance.now() + 140;
    this.run();
  }

  private tugMax() {
    return Math.min(TUG_MAX, this.world.clientWidth * 0.08);
  }

  /** Let go of a tug (it springs back). */
  private release() {
    this.tugHeld = 0;
    this.tugAim = 0;
    if (this.tug > 0) this.run();
  }

  private run() {
    if (this.frame) return;
    // The clock starts at the first frame (rAF timestamps can be earlier than performance.now() here).
    this.last = -1;
    this.written = this.world.scrollLeft;
    this.frame = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number) => {
    this.frame = 0;
    if (this.drag?.moved) return; // the drag places the world itself
    // Something else moved the world, or a dialog opened over it: it stops where it is.
    if (this.takenOver() || document.querySelector("dialog[open]")) {
      this.halt();
      return;
    }
    // The first frame of a move counts as one frame's worth; never a negative step (it would start backwards).
    const dt = this.last < 0 ? this.frameMs : Math.min(64, Math.max(0, now - this.last));
    if (this.last >= 0 && dt > 4 && dt < 40) this.frameMs += (dt - this.frameMs) * 0.2;
    this.last = now;
    let position = this.position;
    const m = this.motion;
    if (m?.kind === "ease") {
      m.at += (m.to - m.at) * (1 - Math.exp(-dt / m.tau));
      if (Math.abs(m.to - m.at) < 0.5) m.at = m.to;
      position = m.at;
      if (m.at === m.to) this.setMotion(null);
    } else if (m?.kind === "travel") {
      if (m.t0 < 0) m.t0 = now - dt;
      const f = Math.min(1, (now - m.t0) / m.ms);
      position = this.along(m, easeInOut(f));
      if (f >= 1) this.setMotion(null);
    }
    // The tug eases toward where it's asked to be, and home to 0 once it's no longer held.
    if (now > this.tugHeld) this.tugAim = 0;
    if (this.tug !== this.tugAim) {
      const tau = this.tugAim > this.tug ? 60 : TUG_RETURN_MS;
      this.tug += (this.tugAim - this.tug) * (1 - Math.exp(-dt / tau));
      if (Math.abs(this.tugAim - this.tug) < 0.5) this.tug = this.tugAim;
    }
    // Nowhere to go (no lap), or held at the join: the move is over.
    if (this.place(position) || this.lap <= 1) this.setMotion(null);
    if (this.motion || this.tug > 0 || this.tugAim > 0) this.frame = requestAnimationFrame(this.tick);
  };

  // ---------------------------------------------------------------------------
  // Moved by something else
  // ---------------------------------------------------------------------------

  /**
   * The world moved by something other than this module (focus, find in
   * page, a link scrolled into view, a resize putting the visitor back in
   * place; the browser's own panning while pinch-zoomed). A jump back by
   * more than half the lap is the way round the loop forward to it (Tab
   * from the footer to the first scene): the same place a lap on, so the
   * journey carries on rather than going back. Wherever it is, the tunnel
   * scene goes where that place needs it (place()).
   */
  private readonly onScroll = () => {
    const left = this.world.scrollLeft;
    if (Math.abs(left - this.written) <= 2) return;
    const lap = this.lap;
    if (lap > 1 && this.seen - left > lap / 2) addLap(lap);
    this.seen = left;
    if (this.drag?.moved) return; // (a drag places the world itself: it carries on from wherever it is now)
    // The move in hand (if any) stops: whatever moved the world decides where it is.
    this.halt();
    this.placed = null;
    // Placed again only if the tunnel scene must go elsewhere for this place, or it's on past the join: any other
    // time the browser's own move (a smooth scrollIntoView, say) carries on untouched (a write would stop it).
    const opening = this.opening;
    const last = this.world.lastElementChild instanceof HTMLElement ? this.world.lastElementChild.offsetWidth : 0;
    const a = lapShift() + left;
    if (!opening || lap <= this.world.clientWidth) return;
    if (a >= lap || this.roundAt(a, lap, this.world.clientWidth, opening.offsetWidth, last) !== lapShift() > 0) this.place(this.position);
  };

  // ---------------------------------------------------------------------------
  // Keyboard focus
  // ---------------------------------------------------------------------------

  /**
   * Tabbing to something the world has only partly on screen brings ALL of it
   * into view (browsers only scroll to a focused element that's entirely off
   * screen: a card 15px in would stay where it is, its focus ring a sliver).
   * Only keyboard focus (:focus-visible): a click is on something already seen.
   * Either way: focus can go back (Shift+Tab), and it must always be seen.
   */
  private readonly onFocusIn = (e: FocusEvent) => {
    if (currentAxis() !== "x" || this.locked()) return;
    const el = e.target instanceof HTMLElement ? e.target : null;
    if (!el || !el.matches(":focus-visible") || el === this.world || el.matches("[data-scene], main") || el.closest("dialog")) return;
    const r = el.getBoundingClientRect();
    const w = this.world.getBoundingClientRect();
    const margin = Math.min(32, w.width * 0.05);
    if (r.left >= w.left + margin && r.right <= w.right - margin) return;
    // Its left edge in view (with a margin), or its right edge if it's narrower than the screen and to the right.
    const shift = r.right > w.right - margin && r.width < w.width - 2 * margin ? r.right - (w.right - margin) : r.left - (w.left + margin);
    // From what's on screen now (a tug is let go of: focus decides where the world is).
    this.halt();
    this.moveTo(this.position + shift);
  };

  // ---------------------------------------------------------------------------
  // Wheel and trackpad
  // ---------------------------------------------------------------------------

  private readonly onWheel = (e: WheelEvent) => {
    if (currentAxis() !== "x" || e.ctrlKey || e.defaultPrevented || !e.cancelable) return;
    if (zoomed()) return; // pinch-zoomed: the browser pans the page (and the world) itself
    const target = e.target instanceof Element ? e.target : null;
    // Line mode (Firefox reading deltaMode first, some mice): ~1/6 of a 100px notch per line.
    const unit = e.deltaMode === 1 ? 100 / 6 : e.deltaMode === 2 ? this.world.clientWidth : 1;
    // Shift + a vertical wheel is a sideways wheel.
    const shifted = e.shiftKey && !e.deltaX;
    const rawX = shifted ? e.deltaY : e.deltaX;
    const rawY = shifted ? 0 : e.deltaY;
    const dx = rawX * unit;
    const dy = rawY * unit;
    const sideways = Math.abs(dx) >= Math.abs(dy);
    // A modal's own content scrolls (but never the world behind it, sideways).
    if (target?.closest("dialog")) {
      if (sideways && dx) e.preventDefault();
      return;
    }
    if (this.locked()) {
      e.preventDefault();
      return;
    }
    // A vertical wheel over a panel that can still scroll that way scrolls the panel (its own content first).
    if (!sideways && target && scrollsVertically(target, dy, this.world)) return;
    e.preventDefault();
    // Down, or to the right: on. Up, or to the left: the world only gives a little.
    const d = sideways ? dx : dy;
    if (!d) return;
    if (d < 0) return this.tugBack(-d);
    this.release();
    // A stepped mouse wheel (lines, or big whole-pixel notches) is eased; a trackpad's deltas are already
    // smooth (and carry the OS's momentum): applied as they come, easing them again would only add lag.
    const stepped = e.deltaMode === 1 || (Math.abs(d) >= 50 && Number.isInteger(sideways ? rawX : rawY) && !(sideways ? rawY : rawX));
    if (stepped) this.moveBy(d);
    else this.stepBy(d);
  };

  // ---------------------------------------------------------------------------
  // Touch swipes, pen and mouse drags
  // ---------------------------------------------------------------------------

  /** No middle-click autoscroll: the browser would scroll the world either way. */
  private readonly onMouseDown = (e: MouseEvent) => {
    if (e.button === 1 && currentAxis() === "x") e.preventDefault();
  };

  private readonly onPointerDown = (e: PointerEvent) => {
    if (currentAxis() !== "x" || e.button !== 0 || this.locked()) return;
    const touch = e.pointerType !== "mouse";
    const target = e.target instanceof Element ? e.target : null;
    // Never inside a modal over the world (the lightbox has its own swipe).
    if (!target || target.closest("dialog")) return;
    if (touch) {
      // A second finger: a pinch, not a swipe.
      if (this.drag) return this.letGo(null);
      if (zoomed() || target.closest(TOUCH_OWNERS)) return;
    } else if (target.closest(INTERACTIVE) || target.closest(TEXT)) return;
    // Touching the world stops it (as a native fling stops), and that touch isn't a tap on whatever was passing.
    const moving = this.motion !== null;
    this.setMotion(null);
    if (moving) this.stopper = e.pointerId;
    const owed = this.tug > 0 ? this.tugMax() * -Math.log(1 - Math.min(0.999, this.tug / this.tugMax())) : 0;
    const selected = !(window.getSelection()?.isCollapsed ?? true);
    this.drag = { id: e.pointerId, touch, axis: "x", x: e.clientX, y: e.clientY, from: this.position, owed, best: 0, moved: false, v: 0, t: e.timeStamp, lastForward: 0, selected };
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerCancel);
    window.addEventListener("contextmenu", this.onPointerCancel);
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved) {
      // Past a tap's wiggle (the browser's own tap slop is about this), and not a long press selecting text.
      if (Math.max(Math.abs(dx), Math.abs(dy)) < (d.touch ? 12 : 6)) return;
      if (d.touch && !d.selected && !window.getSelection()?.isCollapsed) return this.endDrag();
      // Mostly sideways (with a lean toward it: thumbs swipe in arcs), or up and down; on a panel whose content
      // overflows it, up and down is that content's (the browser scrolls it).
      if (d.touch && Math.abs(dx) <= 0.6 * Math.abs(dy)) {
        const target = document.elementFromPoint(d.x, d.y);
        if (target?.closest("[data-overflows]")) return this.endDrag();
        d.axis = "y";
      }
      d.moved = true;
      // (The grabbing cursor and no text selection: a mouse's. Touch has neither, and the attribute restyles the world.)
      if (!d.touch) this.world.dataset.dragging = "";
      window.getSelection()?.removeAllRanges();
      this.written = this.world.scrollLeft;
    }
    // How far the finger has moved forward (to the left, or up), less the tug it took hold of.
    const forward = (d.axis === "x" ? -dx : -dy) - d.owed;
    d.best = Math.max(d.best, forward);
    // On as far as it has ever gone; dragged back from there, the world only gives (a tug).
    const max = this.tugMax();
    this.tug = this.tugAim = this.reduced.matches ? 0 : max * (1 - Math.exp(-Math.max(0, d.best - forward) / max));
    const dt = Math.max(1, e.timeStamp - d.t);
    d.v = 0.8 * ((forward - d.lastForward) / dt) + 0.2 * d.v; // px/ms, smoothed
    d.t = e.timeStamp;
    d.lastForward = forward;
    this.place(d.from + Math.max(0, d.best));
  };

  private readonly onPointerUp = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.letGo(e);
  };

  private readonly onPointerCancel = (e: Event) => {
    const d = this.drag;
    if (!d || (e instanceof PointerEvent && e.pointerId !== d.id)) return;
    this.letGo(null);
  };

  /** The drag ends: a tug springs back; a throw forward carries on (`up`: the pointer was lifted, not cancelled). */
  private letGo(up: PointerEvent | null) {
    const d = this.drag;
    this.endDrag();
    const stopped = d !== null && this.stopper === d.id;
    this.stopper = -1;
    // The click that ends a drag (or the tap that stopped the world) isn't a click on whatever was under it.
    if (up && (d?.moved || stopped)) swallowClick();
    if (!d?.moved) return;
    this.release();
    // Thrown forward: it carries on, its speed decaying like a native fling (the same speed at the moment of
    // release). With reduced motion it stops where the finger left it.
    if (up && d.v > 0.15 && up.timeStamp - d.t < 80 && !this.reduced.matches) this.moveTo(this.position + d.v * THROW_MS, false, THROW_MS);
  }

  private endDrag() {
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerCancel);
    window.removeEventListener("contextmenu", this.onPointerCancel);
    delete this.world.dataset.dragging;
    this.drag = null;
  }

  /** While the world is being dragged, an image under the pointer isn't dragged away (the browser's own drag and drop). */
  private readonly onDragStart = (e: DragEvent) => {
    if (this.drag) e.preventDefault();
  };

  /** Pinch-zoomed in, the page's own panning gets touch back (globals.css) and the world stands back. */
  private readonly onZoom = () => {
    document.documentElement.toggleAttribute("data-zoomed", zoomed());
  };

  // ---------------------------------------------------------------------------
  // Keys
  // ---------------------------------------------------------------------------

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (currentAxis() !== "x" || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const focus = document.activeElement;
    if (focus instanceof Element && focus.closest(KEY_OWNERS)) return;
    // A focused panel (or anything in it) that can still scroll that way keeps its keys: content that overflows
    // a panel stays reachable from the keyboard.
    const dy = { ArrowDown: 1, PageDown: 1, " ": e.shiftKey ? -1 : 1, End: 1, ArrowUp: -1, PageUp: -1, Home: -1 }[e.key];
    if (dy && focus instanceof Element && scrollsVertically(focus, dy, this.world)) return;
    if (document.querySelector("dialog[open]")) return;
    // Space on a button or link activates it.
    if (e.key === " " && focus instanceof Element && focus.closest("a, button, summary, [role=button]")) return;
    const w = this.world.clientWidth;
    const m = this.motion;
    const at = m ? m.to : this.position;
    const back = e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp" || (e.key === " " && e.shiftKey);
    let go: (() => void) | null = null;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        go = () => this.moveTo(at + w * 0.2);
        break;
      case "PageDown":
        go = () => this.moveTo(this.nextStop(at));
        break;
      case " ":
        go = e.shiftKey ? () => this.tugBack(w * 0.1) : () => this.moveTo(this.nextStop(at));
        break;
      case "ArrowLeft":
      case "ArrowUp":
      case "PageUp":
        go = () => this.tugBack(w * 0.1);
        break;
      case "Home":
      case "End": {
        // Home: where the header's home link goes (the bus out of the tunnel, SMOKEY'S); End: the lap's last stop
        // (the footer). Ahead, as a nav link goes (back to it only from within its own scene).
        const el = this.world.querySelector<HTMLElement>(e.key === "Home" ? "#intro-end" : "#footer");
        if (el)
          go = () => {
            this.goToElement(el);
            // Focus goes there too, as with a nav link: the next Tab carries on from where the trip ends.
            const scene = el.closest<HTMLElement>("[data-scene]") ?? el;
            if (!scene.hasAttribute("tabindex")) scene.tabIndex = -1;
            scene.focus({ preventScroll: true });
          };
        break;
      }
      default:
        return;
    }
    if (this.locked() || !go) return;
    // (Back keys only ever tug: never the browser's own scroll back either.)
    e.preventDefault();
    if (!back) this.release();
    go();
  };

  /**
   * The next scene's start ahead of `at` (along the journey), but never more
   * than a screen away (a long scene, like the tunnel, goes a screen at a
   * time). Past the last stop, the next one is the start of the next lap.
   */
  private nextStop(at: number) {
    const w = this.world.clientWidth;
    const lap = this.lap;
    const base = lapStart();
    const starts = [...this.world.querySelectorAll<HTMLElement>("[data-scene]")].map((s) => this.sceneStart(s)).sort((x, y) => x - y);
    // This lap's stops, then the next lap's (the loop carries on).
    const stops = (lap > 1 ? [...starts, ...starts.map((s) => s + lap)] : starts).map((s) => base + s);
    const next = stops.find((s) => s > at + 8);
    return Math.min(next ?? at + w, at + w);
  }
}

/** Pinch-zoomed in (the visual viewport is smaller than the page). */
function zoomed() {
  return (window.visualViewport?.scale ?? 1) > 1.01;
}

/** The click that a pointer's release is about to cause doesn't reach anything (until the next press, at most 400 ms). */
function swallowClick() {
  const swallow = (c: MouseEvent) => {
    c.preventDefault();
    c.stopPropagation();
    done();
  };
  const done = () => {
    window.removeEventListener("click", swallow, { capture: true });
    window.removeEventListener("pointerdown", done, { capture: true });
    window.clearTimeout(timer);
  };
  window.addEventListener("click", swallow, { capture: true });
  window.addEventListener("pointerdown", done, { capture: true });
  const timer = window.setTimeout(done, 400);
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
