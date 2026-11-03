#!/usr/bin/env node
/**
 * Checks for the homepage's sideways world (src/components/world) in Chromium, GPU on.
 *
 *   npm run test:world -- [baseUrl] [--only=2,6] [--shots=<dir>]
 *
 * Needs a running production server (`npm run build && npx next start -p 3100`).
 * Each flow runs on a 1280x800 desktop and a 390x844 phone (touch, DPR 2) unless it says otherwise.
 * Sideways the world is a loop that only goes FORWARD (src/components/world/world-scroll.ts): positions here are
 * LAP positions (where in the lap, in the world's own order: 0 = the tunnel scene's start, whichever end of the
 * world it has been moved to; L = one lap). A "tug" is the world giving a little when asked to go back, then
 * springing back to exactly where it was.
 * Prints a JSON report and exits 1 if a check fails or any page throws:
 *   1  the axis: sideways on the desktop and the phone (the world scrolls along x, every scene side by side
 *      in travel order, the page itself never scrolls); a column on short screens (an 844x390 phone on its side, 1280x440): the window scrolls,
 *      nothing overflows sideways; turning between the two keeps the visitor at the scene they were on
 *   2  the wheel: a stepped wheel moves the world on, eased (it carries on for frames after the event); small
 *      fractional (trackpad) deltas move it 1:1 as they come; Ctrl+wheel doesn't move it; a horizontal wheel is
 *      taken too (a notch to the right: on by its delta, eased; a sideways trackpad stream 1:1); wheeling back
 *      (a notch up, a notch to the left, a trackpad stream up) is taken and only tugs; over a panel that can
 *      still scroll vertically the panel scrolls first, then the world; with reduced motion (desktop) a stepped
 *      wheel isn't eased and wheeling back does nothing at all
 *   3  mouse drag (desktop: a phone has no mouse, flow 5 swipes): forward, the world follows the pointer 1:1, a
 *      throw carries on; dragging back only tugs (from rest, and after dragging forward); the click that ends a
 *      drag reaches nothing (the link under it isn't activated) while a plain click on that link still opens it;
 *      a drag started on text doesn't move the world
 *   4  keys: → / ↓ step a fifth of a screen on; Page Down / Space go to the next scene's start (at most a
 *      screen on); ← / ↑ / Page Up / Shift+Space only tug; Home goes to #intro-end (on round the loop from far
 *      along, back to it from inside the tunnel scene past it, on to it from before it), End to the footer's
 *      start (on to it, or back to it from inside the footer); right after a busy moment (a 30 ms task) → still
 *      steps on at the start and at the end of the world's own order (the loop carries on) and ← still tugs;
 *      keys in a form field, on the day/night radios and on the bus tabs are theirs (they act, the world stays);
 *      with reduced motion (desktop) Page Down goes at once and the back keys do nothing
 *   5  phone touch (CDP synthesizeScrollGesture, touch): a swipe left from ON panel content in #bus, #packages,
 *      #faq, #contact and the footer moves the world on with the finger (no click, nothing opens); a swipe right
 *      only tugs; a vertical swipe up moves it on over a panel whose content fits, and scrolls the content of a
 *      panel that overflows (the world stays); a swipe that starts on a booking link (#packages, #contact) moves
 *      on and opens no drawer; a tap while the world is moving stops it and isn't a click
 *   6  nav: every header link (desktop) and every phone drawer link travels FORWARD to its scene's start, marks
 *      the link aria-current="location", moves focus into the scene and never changes the address or adds a
 *      history entry; from #contact, Bus is reached forward round the loop (the lap position wraps once); deep
 *      inside a wide scene its own link goes back to its start in the same lap; the home link goes on round the
 *      loop to the tunnel's branding and its "See the Bus" travels to #bus; "Skip to content" travels to #main
 *      from inside the tunnel scene and anywhere else only moves focus to the scene in view (nothing moves); a
 *      link still travels right after a busy moment (a 30 ms task); Back leaves the page (there is no extra
 *      entry); a deep link (/#packages) opens at that scene and then drops the hash (no new entry); a reload
 *      without a hash comes back to the same place (sessionStorage)
 *   7  keyboard focus: Tab / Shift+Tab to an occasion card or a gallery tile only partly on screen
 *      brings all of it on screen
 *   8  every scene's panel fits without scrolling inside it (scrollHeight - clientHeight <= 1) at
 *      1280x800, 1440x900, 1920x1080, 390x844 and 375x667
 *   9  the progress marks: sideways, a mark going round a ring (centred at lap position / L, copies a lap apart,
 *      back near the start after the join), the fill bar hidden; down the column the fill bar shows how far
 *      down the page (marks hidden); the guide bus is hidden while the tunnel is on screen behind, shows once
 *      past it, drives off ahead (further right, smaller) as the tunnel arrives from the right, never over it,
 *      and is gone before it docks; the header's border shows once moved along, goes at the start, and stays on
 *      after the journey has come round the loop
 *   10 no JavaScript: one vertical column, every scene there, every action a link to /#contact (it works)
 *   11 the booking panel: opens from the header's Book, the tunnel's "Book your ride" (after the home link
 *      to /#intro-end), Contact's Book and Schedule (the date field focused), a package's "Request
 *      pricing" (package preset) and an occasion's "Plan this ride" (occasion preset); every field saves
 *      to localStorage as it's typed, merged with what was there (an unrelated stored key survives);
 *      the preview and the text/email links carry the values; Esc, the backdrop and the close button
 *      close it, focus back on the opener; while it's open the wheel and the keys don't move the world
 *   12 the loop: (a) the join shows nothing (held docked in the tunnel at the end of the lap, its film on its
 *      first frame, then a 0.5px nudge on into the next lap: the tunnel back at the start, scrollLeft ≈ 0, the same
 *      film frame, mean pixel difference < 0.35 levels, the sky hidden and infinite animations frozen); (b) moving
 *      the tunnel scene round to the end (where it happens going forward, a pixel short of the turn: the same lap
 *      position in both arrangements, by way of the give) shows nothing (< 0.05 levels, against a control pair in one arrangement that must be stable)
 *      and --road-shift is the tunnel scene's width; (c) travel carries on across the join (exactly
 *      one wrap, never a frame back, no frame faster than 3x its neighbours' median speed, px per ms) for a stepped
 *      wheel, a trackpad stream, a mouse throw (desktop), a touch fling (phone), Page Down from the footer, the
 *      "Next stop" button and a nav trip from #contact to Bus; (d) on that trip the film never moves while the
 *      tunnel is on screen, and it ends with Bus at the left edge; (e) three laps (Next stop / Page Down) leave
 *      the DOM node count and history.length as they were, with no page errors; (f) a tug at the very start
 *      of the world never takes the lap position below 0 nor moves the tunnel round, and comes back to 0
 */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const URL = args.find((a) => a.startsWith("http")) ?? "http://localhost:3100/";
/** --shots=<dir>: also save flow 12's screenshot pairs there (to see what differs). */
const shotsDir = args.find((a) => a.startsWith("--shots="))?.slice(8);
/** --only=2,6: run just those flows. */
const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",").map(Number);
const want = (n) => !only || only.includes(n);
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"] });
const desktop = { viewport: { width: 1280, height: 800 } };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const sizes = { desktop, phone };
const results = {};
const failures = [];
const uncaught = [];
let checked = 0;
const check = (name, ok, detail) => {
  checked++;
  if (!ok) failures.push(`${name}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  return ok;
};
const watch = (page) => page.on("pageerror", (e) => uncaught.push(e.message));
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const SCENES = ["top", "bus", "features", "gallery", "day-night", "packages", "events", "how", "about", "faq", "contact", "footer"];
/** How far a tug gives for a push back of `by` px (world-scroll.ts: at most min(120px, 8% of the width), easing off). */
const tugFor = (by, max) => max * (1 - Math.exp(-by / max));
/**
 * Half a frame of the tunnel's film (its fastest cut): the engine counts a film within that of a moment as showing
 * it (intro-engine.ts seek()), so "on its first frame" means a time under this.
 */
const FILM_HALF_FRAME = (() => {
  try {
    const cuts = Object.values(JSON.parse(readFileSync(new globalThis.URL("../../src/content/intro-video.generated.json", import.meta.url), "utf8")));
    return 0.5 / Math.max(...cuts.map((c) => c?.fps).filter((f) => f > 0));
  } catch {
    return 0.5 / 30; // (≤ 30 fps: CLAUDE.md)
  }
})();
/**
 * Chromium's synthetic touch gesture moves the finger its touch slop (15px) further than the gesture's distance
 * (the browser's own scrolling would start after it); the world follows the finger from where it touched down.
 */
const SLOP = 20;

/** In-page helpers (window.__t), installed before the page's own scripts on every document. */
function helpers() {
  const w = () => document.querySelector("[data-world]");
  const top = () => document.getElementById("top");
  const sideways = () => document.documentElement.dataset.axis === "x";
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const t = {
    sideways,
    /** One lap: the world's children end to end. */
    lap: () => [...w().children].reduce((sum, c) => sum + c.offsetWidth, 0),
    /** The tunnel scene's width (W). */
    tunnel: () => top().offsetWidth,
    /** The tunnel scene has been moved round to the end of the world. */
    round: () => !!top()?.hasAttribute("data-round"),
    shift: () => (sideways() && t.round() ? top().offsetWidth : 0),
    /** Where the visitor is: sideways the LAP position ((round ? W : 0) + scrollLeft), in a column the window's scrollY. */
    at: () => (sideways() ? t.shift() + w().scrollLeft : window.scrollY),
    scrollLeft: () => w().scrollLeft,
    /** The furthest scroll position (sideways: the last place of the lap in the world's own order, L - view). */
    max: () => (sideways() ? w().scrollWidth - w().clientWidth : document.documentElement.scrollHeight - innerHeight),
    width: () => w().clientWidth,
    /** Where the tunnel scene moves round to the end (world-scroll.ts place()). */
    roundFrom: () => {
      const L = t.lap();
      const view = w().clientWidth;
      return Math.min(L - view, Math.max(t.tunnel(), L - document.getElementById("footer").offsetWidth - view));
    },
    /** How far a tug can give at most here. */
    tugMax: () => Math.min(120, w().clientWidth * 0.08),
    /** Where an element starts in the lap (px, the world's own order). */
    start: (id) => {
      const x = document.getElementById(id).getBoundingClientRect().left - w().getBoundingClientRect().left + w().scrollLeft + t.shift();
      const L = t.lap();
      return ((x % L) + L) % L;
    },
    /** An element's left edge against the world's left edge (0: the world is lined up on it). */
    edge: (id) => document.getElementById(id).getBoundingClientRect().left - w().getBoundingClientRect().left,
    /**
     * Put the visitor at lap position `a` (as find-in-page or focus would: the world's own scroll; the world
     * moves the tunnel scene round or back as that place needs, so it can take a second step).
     */
    go: async (a) => {
      if (!sideways()) {
        window.scrollTo({ top: a, behavior: "instant" });
        return window.scrollY;
      }
      for (let i = 0; i < 4; i++) {
        const left = Math.min(Math.max(a - t.shift(), 0), t.max());
        w().scrollTo({ left, behavior: "instant" });
        await frame();
        await frame();
        if (Math.abs(t.at() - a) < 1) break;
      }
      return t.at();
    },
    goScene: (id, plus = 0) => t.go(t.start(id) + plus),
    starts: () => [...w().querySelectorAll("[data-scene]")].map((s) => ({ id: s.id, start: t.start(s.id), width: s.offsetWidth })),
    /** The scene under the middle of the screen (as the world itself decides it). */
    inView: () => {
      const s = [...document.querySelectorAll("[data-scene]")].find((s) => {
        const r = s.getBoundingClientRect();
        return sideways() ? r.left <= innerWidth / 2 && r.right > innerWidth / 2 : r.top <= innerHeight / 2 && r.bottom > innerHeight / 2;
      });
      return s?.id ?? null;
    },
    /** Resolves with the position once it hasn't changed for `frames` frames (eased moves, trips, tugs). */
    settle: (frames = 10, timeout = 8000) =>
      new Promise((resolve) => {
        let last = t.at();
        let same = 0;
        const t0 = performance.now();
        const tick = () => {
          const v = t.at();
          same = Math.abs(v - last) < 0.5 ? same + 1 : 0;
          last = v;
          if (same >= frames || performance.now() - t0 > timeout) resolve(v);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    /** Record the position every frame for `n` frames (window.__frames resolves with them). */
    recordFrames: (n) => {
      window.__frames = new Promise((resolve) => {
        const out = [];
        const tick = () => {
          out.push(t.at());
          if (out.length < n) requestAnimationFrame(tick);
          else resolve(out);
        };
        tick();
      });
    },
    /**
     * Record every frame until untrack(): the lap position, the arrangement, the film's time, where the tunnel
     * scene is on screen and the trip under way (html[data-trip]); wraps (a step back by more than half a lap:
     * the journey came round the join) are counted as it goes.
     */
    track: () => {
      const out = [];
      window.__track = out;
      window.__trackWraps = 0;
      const v = document.querySelector("video[data-film]");
      const L = t.lap();
      const tick = (now = performance.now()) => {
        if (window.__track !== out) return;
        const r = top().getBoundingClientRect();
        const a = t.at();
        if (out.length && a - out[out.length - 1].a < -L / 2) window.__trackWraps++;
        out.push({ a, ms: now, round: t.round(), sl: w().scrollLeft, film: v ? v.currentTime : null, topL: r.left, topR: r.right, trip: document.documentElement.dataset.trip ?? "" });
        requestAnimationFrame(tick);
      };
      tick();
    },
    untrack: () => {
      const out = window.__track ?? [];
      window.__track = null;
      return out;
    },
    /** Infinite time-based animations (pulses, twinkles) held at their start for a screenshot; scroll-driven ones are left alone. */
    freeze: () => {
      for (const a of document.getAnimations()) {
        if (a.timeline !== document.timeline || !a.effect || a.effect.getComputedTiming().endTime !== Infinity) continue;
        a.pause();
        a.currentTime = 0;
      }
    },
    /** A trackpad's stream as it arrives: one wheel event per frame, at (x, y). */
    paceWheel: (deltas, x, y) =>
      new Promise((resolve) => {
        let i = 0;
        const tick = () => {
          if (i >= deltas.length) return resolve();
          const target = document.elementFromPoint(x, y) ?? document.body;
          target.dispatchEvent(new WheelEvent("wheel", { deltaY: deltas[i++], deltaMode: 0, clientX: x, clientY: y, bubbles: true, cancelable: true }));
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    /**
     * Run `what` ("home": click the header's home link; a key name: press it, as a keydown) right after a
     * 30 ms task, as on a busy phone: the next frame was due before the input was handled, so its
     * timestamp is earlier than the moment the move was asked for.
     */
    afterBusyTask: (what) =>
      new Promise((resolve) =>
        requestAnimationFrame(() =>
          setTimeout(() => {
            const t0 = performance.now();
            while (performance.now() - t0 < 30);
            if (what === "home") document.querySelector('[data-site-header] a[aria-label$="home"]').click();
            else document.body.dispatchEvent(new KeyboardEvent("keydown", { key: what, bubbles: true, cancelable: true }));
            resolve();
          }, 0),
        ),
      ),
    /**
     * Record every wheel event AFTER the world's own handler has seen it (registered later, same target):
     * the position at that moment and whether the world took it (defaultPrevented).
     */
    recordWheel: () => {
      window.__wheels = [];
      if (window.__wheelRec) return;
      window.__wheelRec = true;
      addEventListener(
        "wheel",
        (e) => window.__wheels.push({ dx: e.deltaX, dy: e.deltaY, ctrl: e.ctrlKey, taken: e.defaultPrevented, at: t.at() }),
        { passive: true },
      );
    },
    /** A point on bare ground in a scene (its padding: the road below the panel), never on a panel, text or a control. */
    bare: (x) => {
      const ok = (px, py) => {
        const el = document.elementFromPoint(px, py);
        return el && (el.matches("[data-scene], main, [data-world]") || el === document.body) && !el.closest("[data-panel], header, dialog");
      };
      const xs = x === undefined ? [innerWidth / 2, innerWidth * 0.3, innerWidth * 0.7] : Array.isArray(x) ? x : [x];
      for (const px of xs) for (const py of [innerHeight - 24, innerHeight - 40, innerHeight - 12]) if (ok(px, py)) return { x: Math.round(px), y: Math.round(py) };
      return null;
    },
  };
  window.__t = t;
}

async function open(ctxOpts = {}, { url = URL, booking, reducedMotion, wait = true } = {}) {
  const ctx = await browser.newContext({ ...desktop, ...ctxOpts, ...(reducedMotion ? { reducedMotion: "reduce" } : {}) });
  await ctx.addInitScript(helpers);
  // Seeded once per context (not again on a reload), as a visitor's earlier choices would be.
  if (booking) await ctx.addInitScript((b) => localStorage.getItem("smokeys:booking") || localStorage.setItem("smokeys:booking", JSON.stringify(b)), booking);
  const page = await ctx.newPage();
  watch(page);
  await page.goto(url, { waitUntil: "load" });
  if (wait) await ready(page);
  return { ctx, page };
}
/** The world is laid out and free to move, and the tunnel's engine has taken over (nothing re-measures later). */
async function ready(page) {
  await page.waitForFunction(
    () => {
      const h = document.documentElement;
      return (
        h.dataset.axis &&
        !h.hasAttribute("data-intro-loading") &&
        !h.hasAttribute("data-intro-pending") &&
        !h.hasAttribute("data-scroll-lock") &&
        (h.hasAttribute("data-intro-stage") || h.hasAttribute("data-intro-failed"))
      );
    },
    null,
    { timeout: 60000 },
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}
const at = (page) => page.evaluate(() => window.__t.at());
const settle = (page, frames) => page.evaluate((f) => window.__t.settle(f), frames);
const go = async (page, a) => {
  await page.evaluate((x) => window.__t.go(x), a);
  await page.waitForTimeout(120);
};
const goScene = async (page, id, plus = 0) => {
  await page.evaluate(([id, plus]) => window.__t.goScene(id, plus), [id, plus]);
  await page.waitForTimeout(150);
};
/**
 * Until a day/night change is over: its theme flip runs in a View Transition, whose snapshot covers the page
 * (a click then lands on it, and Playwright's retries scroll the world looking for a clear spot).
 */
const skyStill = (page) => page.waitForFunction(() => !document.documentElement.hasAttribute("data-sky-changing"), null, { timeout: 20000 });
const blur = (page) => page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * A per-frame track (window.__t.track) as a journey: steps between frames unwrapped (a step back by more than
 * half a lap is the join: + L), how many wraps, frames back (< -0.5px) or on (> 0.5px), and jumps: a frame,
 * once the world is already moving (at least 2 of its 4 frames before moved; setting off from rest is not a
 * jump), whose step is more than 3x the median step of its neighbours (4 each side; those that moved: a frame
 * no input event reached is a gap in the input, not a step), +2px for device pixel snapping. `skip`: a stretch a trip passes in ONE frame by design (the tunnel's pinned stretch, where the
 * stage looks the same all the way): the one step that passes it must contain the whole stretch (from at or
 * before the dock at L, to at or past its end), and it is judged without it.
 */
function journey(track, L, skip = 0) {
  const steps = [];
  let wraps = 0;
  const unwrapped = [track[0]?.a ?? 0];
  for (let i = 1; i < track.length; i++) {
    let d = track[i].a - track[i - 1].a;
    if (d < -L / 2) {
      d += L;
      wraps++;
    }
    steps.push(d);
    unwrapped.push(unwrapped[i - 1] + d);
  }
  let skipped = null;
  if (skip > 0) {
    const big = steps.map((d, i) => [d, i]).filter(([d]) => d >= skip - 1);
    if (big.length === 1) {
      const i = big[0][1];
      const from = unwrapped[i];
      const to = unwrapped[i + 1];
      // (Unwrapped positions are lap positions plus the laps come round: the tunnel scene starts at each multiple
      // of L, docked there, and stays pinned for `skip` px.) The next dock at or after where the step starts:
      const dock = Math.ceil((from - 0.5) / L) * L;
      skipped = { frame: i, from: Math.round(from), to: Math.round(to), dock, whole: from <= dock + 0.5 && to >= dock + skip - 0.5 };
      steps[i] -= skip;
    } else skipped = { frames: big.length, whole: false };
  }
  // A jump is judged on SPEED (px per ms of that frame), not px per frame: an eased move's step grows with the
  // frame's length, so a long frame (the page busy for a moment) isn't a jump, while a teleport always is.
  const dts = steps.map((_, i) => Math.max(1, (track[i + 1]?.ms ?? 0) - (track[i]?.ms ?? 0)) || 16.7);
  const speeds = steps.map((d, i) => d / dts[i]);
  const jumps = [];
  const moved = (d) => Math.abs(d) > 0.5;
  for (let i = 0; i < steps.length; i++) {
    const near = (j) => j >= 0 && j < steps.length && j !== i;
    const before = [i - 4, i - 3, i - 2, i - 1].filter(near);
    if (before.filter((j) => moved(steps[j])).length < 2) continue;
    const around = [...before, i + 1, i + 2, i + 3, i + 4].filter((j) => near(j) && moved(steps[j]));
    const m = median(around.map((j) => speeds[j]));
    if (speeds[i] > 3 * m + 2 / 16.7) {
      jumps.push({
        frame: i,
        step: +steps[i].toFixed(1),
        ms: +dts[i].toFixed(1),
        speed: +speeds[i].toFixed(3),
        median: +m.toFixed(3),
        around: steps.slice(Math.max(0, i - 4), i + 5).map((d) => Math.round(d)),
      });
    }
  }
  const moving = steps.filter((d) => Math.abs(d) > 0.5);
  return {
    frames: track.length,
    wraps,
    backward: steps.filter((d) => d < -0.5).length,
    forward: steps.filter((d) => d > 0.5).length,
    jumps,
    travelled: +steps.reduce((a, b) => a + b, 0).toFixed(1) + (skipped?.whole ? skip : 0),
    maxStep: +Math.max(0, ...steps).toFixed(1),
    medianStep: +median(moving).toFixed(1),
    ...(skipped ? { skipped } : {}),
  };
}

/** A page of its own for comparing screenshots (decoded on a canvas there, so nothing runs in the page under test). */
let lab = null;
async function pixelDiff(a, b) {
  lab ??= await (await browser.newContext()).newPage();
  return lab.evaluate(
    async ([a, b]) => {
      const load = (src) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.src = `data:image/png;base64,${src}`;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return { mean: Infinity, max: 255, over24: 1, size: [ia.width, ia.height, ib.width, ib.height] };
      const c = document.createElement("canvas");
      c.width = ia.width;
      c.height = ia.height;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(ia, 0, 0);
      const da = g.getImageData(0, 0, c.width, c.height).data;
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(ib, 0, 0);
      const db = g.getImageData(0, 0, c.width, c.height).data;
      let sum = 0;
      let max = 0;
      let over = 0;
      for (let i = 0; i < da.length; i += 4) {
        let px = 0;
        for (let k = 0; k < 3; k++) {
          const d = Math.abs(da[i + k] - db[i + k]);
          sum += d;
          px = Math.max(px, d);
        }
        max = Math.max(max, px);
        if (px > 24) over++;
      }
      const pixels = da.length / 4;
      // Mean absolute difference per channel value (0-255 levels), the worst pixel, the share of pixels off by more than 24 levels.
      return { mean: +(sum / (pixels * 3)).toFixed(4), max, over24: +(over / pixels).toFixed(5) };
    },
    [a.toString("base64"), b.toString("base64")],
  );
}

// 1. The axis: sideways where there's room, a column on short screens; turning keeps the visitor's scene.
if (want(1)) {
  const out = {};
  for (const [name, opts] of Object.entries(sizes)) {
    const { ctx, page } = await open(opts);
    out[name] = await page.evaluate(() => {
      const h = document.documentElement;
      const w = document.querySelector("[data-world]");
      const r = w.getBoundingClientRect();
      window.scrollTo({ top: 600, behavior: "instant" });
      const scenes = [...w.querySelectorAll("[data-scene]")].map((s) => s.getBoundingClientRect());
      return {
        axis: h.dataset.axis ?? null,
        worldFixed: getComputedStyle(w).position === "fixed" && r.left === 0 && r.top === 0 && r.width === innerWidth && r.height === innerHeight,
        worldScreens: +(w.scrollWidth / w.clientWidth).toFixed(1),
        pageScrollY: window.scrollY,
        pageOverflow: { x: h.scrollWidth - h.clientWidth, y: h.scrollHeight - h.clientHeight },
        sideBySide: scenes.every((s, i) => i === 0 || (s.left >= scenes[i - 1].right - 1 && Math.abs(s.top - scenes[0].top) <= 1)),
        order: [...w.querySelectorAll("[data-scene]")].map((s) => s.id),
      };
    });
    check(`1 ${name}: sideways, every scene side by side in travel order`, out[name].axis === "x" && out[name].worldFixed && out[name].worldScreens > 5 && out[name].sideBySide && out[name].order.join() === SCENES.join(), out[name]);
    check(`1 ${name}: the page itself never scrolls`, out[name].pageScrollY === 0 && out[name].pageOverflow.x <= 0 && out[name].pageOverflow.y <= 0, out[name]);
    await ctx.close();
  }
  for (const [name, opts] of [
    ["phone on its side 844x390", { ...phone, viewport: { width: 844, height: 390 } }],
    ["desktop 1280x440", { viewport: { width: 1280, height: 440 } }],
  ]) {
    const { ctx, page } = await open(opts);
    out[name] = await page.evaluate(() => {
      const h = document.documentElement;
      const w = document.querySelector("[data-world]");
      window.scrollTo({ top: 1500, behavior: "instant" });
      const scenes = [...w.querySelectorAll("[data-scene]")].map((s) => s.getBoundingClientRect());
      return {
        axis: h.dataset.axis ?? null,
        worldPosition: getComputedStyle(w).position,
        windowScrollsTo1500: window.scrollY,
        screens: +(h.scrollHeight / innerHeight).toFixed(1),
        stacked: scenes.every((s, i) => i === 0 || s.top >= scenes[i - 1].bottom - 1),
        overflowX: h.scrollWidth - h.clientWidth,
        worldOverflowX: w.scrollWidth - w.clientWidth,
        widestRight: Math.round(Math.max(...scenes.map((s) => s.right)) - h.clientWidth),
      };
    });
    const o = out[name];
    check(`1 ${name}: a column`, o.axis !== "x" && o.worldPosition !== "fixed" && o.stacked && o.screens > 5, o);
    check(`1 ${name}: the window scrolls`, near(o.windowScrollsTo1500, 1500, 2), o);
    check(`1 ${name}: nothing overflows sideways`, o.overflowX <= 0 && o.worldOverflowX <= 1 && o.widestRight <= 1, o);
    await ctx.close();
  }
  // Turning: sideways at a scene → a column (the same scene in view) → down to another scene → sideways (that scene in view).
  for (const [name, wide, short] of [
    ["desktop", desktop.viewport, { width: 1280, height: 440 }],
    ["phone", phone.viewport, { width: 844, height: 390 }],
  ]) {
    const { ctx, page } = await open({ ...sizes[name] });
    await goScene(page, "packages");
    const before = await page.evaluate(() => ({ axis: document.documentElement.dataset.axis, inView: window.__t.inView() }));
    await page.setViewportSize(short);
    await page.waitForTimeout(1200);
    await ready(page).catch(() => {});
    const turned = await page.evaluate(() => ({ axis: document.documentElement.dataset.axis, inView: window.__t.inView(), scrollY: Math.round(scrollY) }));
    await page.evaluate(() => document.getElementById("faq").scrollIntoView({ block: "center", behavior: "instant" }));
    await page.waitForTimeout(400);
    const down = await page.evaluate(() => window.__t.inView());
    await page.setViewportSize(wide);
    await page.waitForTimeout(1200);
    await ready(page).catch(() => {});
    const back = await page.evaluate(() => ({ axis: document.documentElement.dataset.axis, inView: window.__t.inView(), at: Math.round(window.__t.at()) }));
    out[`${name} turning`] = { before, turned, down, back };
    check(`1 ${name}: sideways → column keeps the scene`, before.inView === "packages" && turned.axis === "y" && turned.inView === "packages", { before, turned });
    check(`1 ${name}: column → sideways keeps the scene`, down === "faq" && back.axis === "x" && back.inView === "faq", { down, back });
    await ctx.close();
  }
  results["1 axis"] = out;
}

// 2. The wheel.
if (want(2)) {
  const out = {};
  for (const [name, opts] of Object.entries(sizes)) {
    const { ctx, page } = await open(opts, { url: `${URL}#features` });
    const r = {};
    const tugMax = await page.evaluate(() => window.__t.tugMax());
    await goScene(page, "features");
    const bare = await page.evaluate(() => window.__t.bare());
    check(`2 ${name}: found bare ground to wheel over`, !!bare, bare);
    await page.mouse.move(bare.x, bare.y);
    await page.evaluate(() => window.__t.recordWheel());

    // Deltas are compared with what the page RECEIVES (e.deltaY): under DPR 2 emulation Chromium hands the page
    // half of what Playwright sends (so the phone's 100px notch arrives as 50px, still a whole-pixel notch).
    // a. A stepped wheel (a notch): nothing moves during the event, then it eases over several frames to +notch.
    let before = await at(page);
    await page.evaluate(() => window.__t.recordFrames(45));
    await page.mouse.wheel(0, 100);
    const frames = await page.evaluate(() => window.__frames);
    const final = await settle(page);
    const ev = (await page.evaluate(() => window.__wheels))[0];
    const notch = ev?.dy ?? NaN;
    const between = new Set(frames.filter((v) => v > before + 0.5 && v < before + notch - 0.5)).size;
    r.stepped = { before, received: notch, atEvent: ev?.at, taken: ev?.taken, inBetweenFrames: between, moved: final - before };
    check(`2 ${name}: a stepped wheel moves the world sideways`, notch >= 50 && ev.taken && near(final - before, notch, 1), r.stepped);
    check(`2 ${name}: a stepped wheel is eased (carries on for frames after the event)`, near(ev?.at ?? -1, before, 0.5) && between >= 3, r.stepped);

    // b. Trackpad-like: small fractional deltas, each applied at once (1:1, to the device pixel), nothing after.
    const deltas = [3.2, 5.7, 8.4, 6.1, 4.9, 7.3, 2.6, 9.8, 5.5, 6.7];
    /** A trackpad stream (dx, dy per event): each event's step against what the page received. */
    const stream = async (axis) => {
      await page.evaluate(() => window.__t.recordWheel());
      const from = await at(page);
      for (const d of deltas) await page.mouse.wheel(axis === "x" ? d : 0, axis === "y" ? d : 0);
      const evs = await page.evaluate(() => window.__wheels);
      const to = await settle(page);
      const received = evs.map((e) => +(axis === "x" ? e.dx : e.dy).toFixed(2));
      const steps = evs.map((e, i) => +(e.at - (i ? evs[i - 1].at : from)).toFixed(2));
      const sum = received.reduce((a, b) => a + b, 0);
      const res = { received, steps, moved: +(to - from).toFixed(2), sum: +sum.toFixed(2), afterLastEvent: +(to - (evs.at(-1)?.at ?? to)).toFixed(2) };
      // Each step within a pixel of its delta (the position snaps to device pixels), the total within that rounding, nothing after.
      const ok =
        evs.length === deltas.length &&
        evs.every((e) => e.taken && !Number.isInteger(axis === "x" ? e.dx : e.dy)) &&
        steps.every((s, i) => near(s, received[i], 1)) &&
        near(to - from, sum, deltas.length * 0.5 + 0.5) &&
        near(to, evs.at(-1).at, 0.5);
      return { res, ok };
    };
    const tp = await stream("y");
    r.trackpad = tp.res;
    check(`2 ${name}: trackpad deltas move the world 1:1 as they come`, tp.ok, r.trackpad);

    // c. Ctrl+wheel (zoom): the world stays, and the event is left to the browser.
    await page.evaluate(() => window.__t.recordWheel());
    before = await at(page);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, 100);
    await page.keyboard.up("Control");
    await page.waitForTimeout(500);
    const ctrl = (await page.evaluate(() => window.__wheels)).find((e) => e.ctrl);
    r.ctrl = { seen: !!ctrl, taken: ctrl?.taken, moved: (await at(page)) - before, zoom: await page.evaluate(() => visualViewport.scale) };
    check(`2 ${name}: Ctrl+wheel doesn't move the world`, r.ctrl.seen && !r.ctrl.taken && near(r.ctrl.moved, 0, 0.5), r.ctrl);

    // d. A horizontal wheel is the world's too (the browser never scrolls it): a notch to the right moves it on by
    //    the delta the page received, eased; a sideways trackpad stream moves it 1:1 as it comes.
    await page.evaluate(() => window.__t.recordWheel());
    before = await at(page);
    await page.evaluate(() => window.__t.recordFrames(45));
    await page.mouse.wheel(120, 0);
    const hFrames = await page.evaluate(() => window.__frames);
    const final4 = await settle(page);
    const hev = (await page.evaluate(() => window.__wheels))[0];
    const hBetween = new Set(hFrames.filter((v) => v > before + 0.5 && v < before + (hev?.dx ?? 0) - 0.5)).size;
    r.horizontal = { received: hev?.dx, taken: hev?.taken, atEvent: hev ? hev.at - before : null, inBetweenFrames: hBetween, moved: final4 - before };
    check(`2 ${name}: a horizontal notch is taken and moves the world on by its delta, eased`, hev && hev.taken && hev.dx >= 50 && near(final4 - before, hev.dx, 1) && near(hev.at, before, 0.5) && hBetween >= 3, r.horizontal);
    const hs = await stream("x");
    r.horizontalTrackpad = hs.res;
    check(`2 ${name}: a sideways trackpad stream moves the world 1:1 as it comes`, hs.ok, r.horizontalTrackpad);

    // e. Wheeling back (a notch up, a notch to the left, a trackpad stream up): taken (never the browser's own
    //    scroll back), the world only gives a little (a tug, at most min(120px, 8% of the width)) and springs back.
    const tugs = {};
    const back = async (label, events, gap) => {
      await page.evaluate(() => window.__t.recordWheel());
      const from = await at(page);
      await page.evaluate(() => window.__t.track());
      for (const [dx, dy] of events) {
        await page.mouse.wheel(dx, dy);
        if (gap) await page.waitForTimeout(gap);
      }
      const to = await settle(page);
      const track = await page.evaluate(() => window.__t.untrack());
      const evs = await page.evaluate(() => window.__wheels);
      const pushed = -evs.reduce((s, e) => s + (e.dx || e.dy), 0);
      const aim = tugFor(pushed, tugMax);
      const dip = from - Math.min(from, ...track.map((f) => f.a));
      tugs[label] = { events: evs.length, taken: evs.every((e) => e.taken), pushed: +pushed.toFixed(1), aim: +aim.toFixed(1), dip: +dip.toFixed(1), from, to, back: +(to - from).toFixed(2) };
      check(`2 ${name}: ${label} is taken and only tugs`, evs.length === events.length && tugs[label].taken && dip >= 0.6 * aim && dip <= aim + 1, tugs[label]);
    };
    await goScene(page, "features", 200);
    await page.mouse.move(bare.x, bare.y);
    await back("a notch up", [[0, -100]]);
    await back("a notch to the left", [[-120, 0]]);
    await back("a trackpad stream up", deltas.map((d) => [0, -d]), 8);
    r.back = tugs;
    check(`2 ${name}: wheeling back springs back to exactly where it was`, Object.values(tugs).every((t) => near(t.back, 0, 1)), Object.fromEntries(Object.entries(tugs).map(([k, t]) => [k, t.back])));

    // f. Over a panel that can still scroll vertically (a test-only tall block inside the Features panel): the
    //    panel scrolls first; at its bottom the world moves on; wheeling back up scrolls the panel again.
    await goScene(page, "features");
    const box = await page.evaluate(() => {
      const panel = document.querySelector("#features > [data-panel]");
      const tall = document.createElement("div");
      tall.dataset.testTall = "";
      tall.style.height = "1600px";
      panel.append(tall);
      const r = panel.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, overflow: panel.scrollHeight - panel.clientHeight };
    });
    const panelTop = () => page.evaluate(() => document.querySelector("#features > [data-panel]").scrollTop);
    await page.mouse.move(box.x, box.y);
    before = await at(page);
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(600);
    const first = { panel: await panelTop(), world: (await settle(page)) - before };
    await page.evaluate(() => {
      const p = document.querySelector("#features > [data-panel]");
      p.scrollTop = p.scrollHeight;
    });
    await page.waitForTimeout(150);
    const bottom = await panelTop();
    before = await at(page);
    await page.evaluate(() => window.__t.recordWheel());
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(100);
    const atBottom = { panel: await panelTop(), world: (await settle(page)) - before, received: (await page.evaluate(() => window.__wheels))[0]?.dy };
    before = await at(page);
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(600);
    const up = { panel: await panelTop(), world: (await settle(page)) - before };
    await page.evaluate(() => document.querySelector("[data-test-tall]")?.remove());
    r.panelFirst = { overflow: box.overflow, first, bottom, atBottom, up };
    check(`2 ${name}: a wheel over a panel that can scroll scrolls the panel, not the world`, box.overflow > 500 && first.panel >= 60 && near(first.world, 0, 0.5), r.panelFirst);
    check(`2 ${name}: at the panel's bottom the wheel moves the world on`, near(atBottom.panel, bottom, 0.5) && near(atBottom.world, atBottom.received, 1), r.panelFirst);
    check(`2 ${name}: wheeling back up scrolls the panel again`, up.panel <= bottom - 60 && near(up.world, 0, 0.5), r.panelFirst);
    out[name] = r;
    await ctx.close();
  }
  // g. Reduced motion: a stepped wheel moves the world at once (no easing); wheeling back does nothing at all
  //    (no tug), though it's still taken (the browser doesn't scroll back either).
  {
    const { ctx, page } = await open(desktop, { url: `${URL}#features`, reducedMotion: true });
    await goScene(page, "features");
    const bare = await page.evaluate(() => window.__t.bare());
    await page.mouse.move(bare.x, bare.y);
    await page.evaluate(() => window.__t.recordWheel());
    const before = await at(page);
    await page.mouse.wheel(0, 100);
    const final = await settle(page);
    const ev = (await page.evaluate(() => window.__wheels))[0];
    out["reduced motion"] = { atEvent: ev ? ev.at - before : null, moved: final - before };
    check("2 reduced motion: a stepped wheel moves at once", ev && near(ev.at - before, 100, 1) && near(final - before, 100, 1), out["reduced motion"]);
    await page.evaluate(() => window.__t.recordWheel());
    const from = await at(page);
    await page.evaluate(() => window.__t.track());
    await page.mouse.wheel(0, -100);
    await page.mouse.wheel(-120, 0);
    await page.waitForTimeout(600);
    const track = await page.evaluate(() => window.__t.untrack());
    const evs = await page.evaluate(() => window.__wheels);
    out["reduced motion"].back = { events: evs.length, taken: evs.every((e) => e.taken), positions: [...new Set(track.map((f) => f.a - from))] };
    check("2 reduced motion: wheeling back is taken and does nothing at all (no tug)", evs.length === 2 && out["reduced motion"].back.taken && track.every((f) => near(f.a, from, 0.01)), out["reduced motion"].back);
    await ctx.close();
  }
  results["2 wheel"] = out;
}

// 3. Mouse drag (desktop).
if (want(3)) {
  const { ctx, page } = await open(desktop, { url: `${URL}#features` });
  const out = {};
  const tugMax = await page.evaluate(() => window.__t.tugMax());
  const dragging = () => page.evaluate(() => document.querySelector("[data-world]").hasAttribute("data-dragging"));
  /** Press at `from`, move by (dx, dy) in `n` steps `gap` ms apart, optionally hold still, release. */
  const drag = async (from, dx, dy, { n = 20, gap = 16, hold = 150 } = {}) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    let mid = false;
    for (let i = 1; i <= n; i++) {
      await page.mouse.move(from.x + (dx * i) / n, from.y + (dy * i) / n);
      if (i === Math.round(n / 2)) mid = await dragging();
      await page.waitForTimeout(gap);
    }
    if (hold) await page.waitForTimeout(hold);
    await page.mouse.up();
    return mid;
  };
  // a. A slow drag 300px to the left, held before letting go: the world follows the pointer exactly.
  await goScene(page, "features");
  const bare = await page.evaluate(() => window.__t.bare());
  let before = await at(page);
  const midA = await drag(bare, -300, 0);
  out.follow = { from: bare, midDragging: midA, moved: (await settle(page)) - before, after: await dragging() };
  check("3 a mouse drag moves the world with the pointer", midA && !out.follow.after && near(out.follow.moved, 300, 2), out.follow);
  // b. Thrown: let go while moving fast, it carries on.
  await goScene(page, "features");
  before = await at(page);
  await drag(bare, -300, 0, { n: 12, gap: 8, hold: 0 });
  out.thrown = { moved: (await settle(page)) - before };
  check("3 a thrown drag carries on", out.thrown.moved >= 350, out.thrown);

  // c. Dragged back (to the right) from rest: the world only gives a little (a tug) and springs back once let go.
  await goScene(page, "features");
  before = await at(page);
  await page.evaluate(() => window.__t.track());
  const midC = await drag(bare, 300, 0);
  const afterC = await settle(page);
  const trC = await page.evaluate(() => window.__t.untrack());
  const aimC = tugFor(300, tugMax);
  out.dragBack = { midDragging: midC, aim: +aimC.toFixed(1), dip: +(before - Math.min(before, ...trC.map((f) => f.a))).toFixed(1), back: +(afterC - before).toFixed(2) };
  check("3 dragging back only tugs", midC && out.dragBack.dip >= 0.6 * aimC && out.dragBack.dip <= aimC + 1, out.dragBack);
  // d. Dragged forward 300px, then back 100px while still held: the world stays as far on as it got, less a tug;
  //    let go, it springs on to there.
  await goScene(page, "features");
  before = await at(page);
  await page.mouse.move(bare.x, bare.y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(bare.x - (300 * i) / 20, bare.y);
    await page.waitForTimeout(16);
  }
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(bare.x - 300 + (100 * i) / 8, bare.y);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(150);
  const held = (await at(page)) - before;
  await page.mouse.up();
  const afterD = (await settle(page)) - before;
  const aimD = tugFor(100, tugMax);
  out.onThenBack = { held: +held.toFixed(1), want: +(300 - aimD).toFixed(1), afterLetGo: +afterD.toFixed(2) };
  check("3 dragging back after dragging on only tugs (the world keeps how far it got)", near(held, 300 - aimD, 1.5), out.onThenBack);
  check("3 a drag back springs back to exactly where the drag had got", near(out.dragBack.back, 0, 1) && near(afterD, 300, 1), { fromRest: out.dragBack.back, afterOn: out.onThenBack.afterLetGo });

  // e. A drag that ends over an occasion card ("Plan this ride", a booking link): its click reaches nothing
  //    and opens nothing; a plain click on the same card opens the booking panel.
  await goScene(page, "events");
  const card = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("#events a[data-book-occasion]")];
    const c = cards.find((c) => c.getBoundingClientRect().left > 340 && c.getBoundingClientRect().right < innerWidth);
    const r = c.getBoundingClientRect();
    c.dataset.testCard = "";
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  const start = await page.evaluate((x) => window.__t.bare(x), card.x);
  await page.evaluate(() => {
    window.__clicks = [];
    document.addEventListener("click", (e) => window.__clicks.push(e.target.tagName), true);
  });
  const href0 = await page.evaluate(() => location.href);
  before = await at(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(start.x - (300 * i) / 20, start.y + ((card.y - start.y) * i) / 20);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(150);
  const overCard = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest("[data-test-card]"), [start.x - 300, card.y]);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const afterDrag = await page.evaluate(() => ({ clicks: window.__clicks.length, dialog: !!document.querySelector("dialog[open]"), href: location.href }));
  const moved = (await settle(page)) - before;
  const c2 = await page.evaluate(() => {
    const r = document.querySelector("[data-test-card]").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(c2.x, c2.y);
  await page.waitForTimeout(500);
  const afterClick = await page.evaluate(() => ({ clicks: window.__clicks.length, dialog: !!document.querySelector("dialog[aria-labelledby][open]") }));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  out.overLink = { start, overCard, moved, afterDrag, href0, afterClick };
  check("3 the click ending a drag over a link reaches nothing and opens nothing", start && overCard && near(moved, 300, 2) && afterDrag.clicks === 0 && !afterDrag.dialog && afterDrag.href === href0, out.overLink);
  check("3 a plain click on that link still opens it", afterClick.clicks === 1 && afterClick.dialog, out.overLink);

  // f. A drag started on text (selecting it) doesn't move the world.
  await goScene(page, "features");
  const h2 = await page.locator("#features h2").boundingBox();
  before = await at(page);
  const midF = await drag({ x: h2.x + 20, y: h2.y + h2.height / 2 }, -200, 0);
  out.fromText = { midDragging: midF, moved: (await settle(page)) - before };
  check("3 a drag from text doesn't move the world", !midF && near(out.fromText.moved, 0, 0.5), out.fromText);
  results["3 mouse drag (desktop)"] = out;
  await ctx.close();
}

// 4. Keys.
if (want(4)) {
  const out = {};
  for (const [name, opts] of Object.entries(sizes)) {
    const { ctx, page } = await open(opts, { url: `${URL}#features` });
    const { w, L, tugMax, starts, homeAt } = await page.evaluate(() => ({
      w: window.__t.width(),
      L: window.__t.lap(),
      tugMax: window.__t.tugMax(),
      starts: window.__t.starts(),
      homeAt: window.__t.start("intro-end"),
    }));
    const S = (id) => starts.find((s) => s.id === id);
    /** The world's own rule, independently: the next scene start more than 8px on (this lap's, then the next's), at most a screen. */
    const stops = [...starts.map((s) => s.start), ...starts.map((s) => s.start + L)].sort((a, b) => a - b);
    const nextStop = (from) => Math.min(stops.find((s) => s > from + 8), from + w);
    const press = async (key, from) => {
      await go(page, from);
      await blur(page);
      const was = await at(page);
      await page.evaluate(() => window.__t.track());
      await page.keyboard.press(key);
      const to = await settle(page);
      const j = journey(await page.evaluate(() => window.__t.untrack()), L);
      return { key, from: Math.round(was), to: Math.round(to), wraps: j.wraps, back: j.backward, on: j.forward };
    };
    const r = { width: w, steps: [] };
    const expect = (label, res, want, tol = 1.5) => {
      r.steps.push({ ...res, want: Math.round(want) });
      check(`4 ${name}: ${label}`, near(res.to, want, tol), { ...res, want });
    };
    /** A trip: lands on `want`, with `wraps` wraps, only ever forward (dir 1) or only ever back (dir -1). */
    const expectTrip = (label, res, want, wraps, dir) => {
      r.steps.push({ ...res, want: Math.round(want) });
      check(`4 ${name}: ${label}`, near(res.to, want, 1.5) && res.wraps === wraps && (dir > 0 ? res.back === 0 : res.on === 0), { ...res, want, wantWraps: wraps, dir });
    };
    // A back key: the world gives (a tug of a tenth of a screen's push) and springs back; never a real move back.
    const keyAim = tugFor(0.1 * w, tugMax);
    const tugged = [];
    const tugPress = async (label, key, from) => {
      await go(page, from);
      await blur(page);
      const was = await at(page);
      await page.evaluate(() => window.__t.track());
      await page.keyboard.press(key);
      const to = await settle(page);
      const track = await page.evaluate(() => window.__t.untrack());
      const res = { key, from: Math.round(was), dip: +(was - Math.min(was, ...track.map((f) => f.a))).toFixed(1), aim: +keyAim.toFixed(1), back: +(to - was).toFixed(2) };
      r.steps.push(res);
      tugged.push(res);
      check(`4 ${name}: ${label} only tugs`, res.dip >= 0.6 * keyAim && res.dip <= keyAim + 1, res);
    };
    const f = S("features").start;
    expect("ArrowRight steps a fifth of a screen on", await press("ArrowRight", f), f + 0.2 * w);
    expect("ArrowDown steps a fifth of a screen on", await press("ArrowDown", f), f + 0.2 * w);
    await tugPress("ArrowLeft", "ArrowLeft", f);
    await tugPress("ArrowUp", "ArrowUp", f);
    // Page Down short of a scene start lands on it; from the start of a long scene, a screen on.
    const p1 = S("day-night").start - 0.4 * w;
    const p2 = S("events").start;
    const p3 = S("packages").start + 0.3 * w;
    const p4 = S("events").start + 2 * w;
    check(`4 ${name}: the key cases are what they say`, nextStop(p1) === S("day-night").start && nextStop(p2) === p2 + w && S("events").width > 2.5 * w && homeAt > w && homeAt < S("bus").start, { p1, p2, events: S("events"), homeAt });
    expect("PageDown goes to the next scene's start", await press("PageDown", p1), nextStop(p1));
    expect("PageDown in a long scene goes a screen on", await press("PageDown", p2), nextStop(p2));
    expect("Space goes to the next scene's start", await press("Space", p1), nextStop(p1));
    await tugPress("PageUp", "PageUp", p3);
    await tugPress("PageUp in a long scene", "PageUp", p4);
    await tugPress("Shift+Space", "Shift+Space", p3);
    // Home: where the header's home link goes (#intro-end, the tunnel's branding): the next time ahead (from far
    // along: on round the loop), back to it from inside the tunnel scene past it, on to it from before it.
    expectTrip("Home from far along goes on round the loop to #intro-end", await press("Home", p4), homeAt, 1, 1);
    expectTrip("Home from inside the tunnel scene past #intro-end goes back to it", await press("Home", homeAt + 0.5 * w), homeAt, 0, -1);
    expectTrip("Home from the tunnel scene before #intro-end goes on to it", await press("Home", 0.3 * homeAt), homeAt, 0, 1);
    // End: the footer's start, on to it, or back to it from inside the footer.
    const footerAt = S("footer").start;
    expectTrip("End goes on to the footer's start", await press("End", f), footerAt, 0, 1);
    expectTrip("End from inside the footer goes back to its start", await press("End", footerAt + 0.5 * w), footerAt, 0, -1);
    // The same keys right after a busy moment (a 30 ms task), at either end of the world's own order.
    const busyKey = async (key, from) => {
      await go(page, from);
      await blur(page);
      const was = await at(page);
      await page.evaluate(() => window.__t.track());
      await page.evaluate((k) => window.__t.afterBusyTask(k), key);
      await page.waitForTimeout(50);
      const to = await settle(page);
      const track = await page.evaluate(() => window.__t.untrack());
      return { key: `${key} after a busy task`, from: Math.round(was), to: Math.round(to), dip: +(was - Math.min(was, ...track.map((f) => f.a))).toFixed(1), back: +(to - was).toFixed(2) };
    };
    const maxNow = await page.evaluate(() => window.__t.max());
    expect("ArrowRight at the start, after a busy task, still steps on", await busyKey("ArrowRight", 0), 0.2 * w);
    expect("ArrowRight at the end of the world's own order, after a busy task, steps on (the loop carries on)", await busyKey("ArrowRight", maxNow), maxNow + 0.2 * w);
    const busyBack = await busyKey("ArrowLeft", maxNow);
    r.steps.push(busyBack);
    tugged.push(busyBack);
    check(`4 ${name}: ArrowLeft at the end, after a busy task, still tugs`, busyBack.dip >= 0.6 * keyAim && busyBack.dip <= keyAim + 1, { ...busyBack, aim: keyAim });
    check(`4 ${name}: the back keys spring back to exactly where they were`, tugged.every((t) => near(t.back, 0, 1)), tugged.map((t) => `${t.key} from ${t.from}: ${t.back}`));

    // Keys belong to what has focus: a form field (a test-only input in a panel), the day/night radios, the bus tabs.
    const owners = {};
    await goScene(page, "features");
    await page.evaluate(() => {
      const input = document.createElement("input");
      input.dataset.testField = "";
      input.value = "ab";
      document.querySelector("#features > [data-panel]").prepend(input);
    });
    await page.locator("[data-test-field]").click();
    await settle(page);
    let was = await at(page);
    const moves = [];
    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End", "PageDown", "PageUp", "Space", "Shift+Space"]) {
      await page.keyboard.press(key);
      moves.push(Math.round((await settle(page)) - was));
    }
    owners.field = { moves, value: await page.locator("[data-test-field]").inputValue() };
    check(`4 ${name}: keys in a form field are the field's`, moves.every((m) => m === 0) && owners.field.value.includes(" "), owners.field);
    await page.evaluate(() => document.querySelector("[data-test-field]").remove());

    await goScene(page, "day-night");
    const radio = page.locator('#day-night [role=radio][tabindex="0"]');
    const label = async () => page.evaluate(() => document.activeElement?.closest("#day-night") ? document.activeElement.textContent.trim().slice(0, 9) : null);
    await radio.focus();
    await settle(page);
    was = await at(page);
    const r0 = await label();
    const radioMoves = [];
    await page.keyboard.press("ArrowRight");
    radioMoves.push(Math.round((await settle(page)) - was));
    const r1 = { focused: await label(), checked: await page.evaluate(() => document.activeElement?.getAttribute("aria-checked")) };
    for (const key of ["ArrowLeft", "End", "Home", "PageDown"]) {
      await page.keyboard.press(key);
      radioMoves.push(Math.round((await settle(page)) - was));
    }
    owners.radios = { from: r0, afterArrow: r1, moves: radioMoves };
    check(`4 ${name}: arrows on the day/night radios pick, the world stays`, r0 && r1.focused && r1.focused !== r0 && r1.checked === "true" && radioMoves.every((m) => m === 0), owners.radios);

    await goScene(page, "bus");
    const tab = page.locator('#bus [role=tab][aria-selected="true"]');
    await tab.focus();
    await settle(page);
    was = await at(page);
    const tabName = () => page.evaluate(() => (document.activeElement?.getAttribute("role") === "tab" ? document.activeElement.textContent.trim() : null));
    const t0 = await tabName();
    const tabMoves = [];
    await page.keyboard.press("ArrowRight");
    tabMoves.push(Math.round((await settle(page)) - was));
    const t1 = { focused: await tabName(), selected: await page.evaluate(() => document.activeElement?.getAttribute("aria-selected")) };
    await page.keyboard.press("Home");
    tabMoves.push(Math.round((await settle(page)) - was));
    const t2 = await tabName();
    await page.keyboard.press("End");
    tabMoves.push(Math.round((await settle(page)) - was));
    owners.tabs = { from: t0, afterArrow: t1, afterHome: t2, moves: tabMoves };
    check(`4 ${name}: arrows, Home and End on the bus tabs switch tabs, the world stays`, t0 && t1.focused && t1.focused !== t0 && t1.selected === "true" && t2 === t0 && tabMoves.every((m) => m === 0), owners.tabs);
    r.owners = owners;
    out[name] = r;
    await ctx.close();
  }
  // Reduced motion (desktop): Page Down goes at once (no frame in between); the back keys do nothing at all (no
  // tug), and the browser doesn't scroll back either.
  {
    const { ctx, page } = await open(desktop, { url: `${URL}#features`, reducedMotion: true });
    const { w, starts } = await page.evaluate(() => ({ w: window.__t.width(), starts: window.__t.starts() }));
    const dn = starts.find((s) => s.id === "day-night").start;
    const from = dn - 0.4 * w;
    await go(page, from);
    await blur(page);
    const was = await at(page);
    await page.evaluate(() => window.__t.track());
    await page.keyboard.press("PageDown");
    const to = await settle(page);
    const pd = await page.evaluate(() => window.__t.untrack());
    const inBetween = new Set(pd.map((f) => f.a).filter((a) => a > was + 0.5 && a < dn - 0.5)).size;
    const rm = { pageDown: { from: Math.round(was), to: Math.round(to), want: Math.round(dn), inBetweenFrames: inBetween } };
    check("4 reduced motion: Page Down goes to the next scene's start at once", near(to, dn, 1.5) && inBetween === 0, rm.pageDown);
    const still = await at(page);
    await page.evaluate(() => window.__t.track());
    for (const key of ["ArrowLeft", "ArrowUp", "PageUp", "Shift+Space"]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(300);
    const bk = await page.evaluate(() => window.__t.untrack());
    rm.backKeys = { frames: bk.length, positions: [...new Set(bk.map((f) => +(f.a - still).toFixed(2)))] };
    check("4 reduced motion: the back keys do nothing at all", bk.length > 10 && bk.every((f) => near(f.a, still, 0.01)), rm.backKeys);
    out["reduced motion"] = rm;
    await ctx.close();
  }
  results["4 keys"] = out;
}

// 5. Phone touch: real touch swipes (CDP synthesizeScrollGesture, gestureSourceType "touch").
if (want(5)) {
  const r = {};
  const { ctx, page } = await open(phone, { url: `${URL}#bus` });
  const cdp = await ctx.newCDPSession(page);
  const tugMax = await page.evaluate(() => window.__t.tugMax());
  await page.evaluate(() => {
    window.__clicks = [];
    document.addEventListener("click", (e) => window.__clicks.push(e.target.closest("a, button")?.textContent?.trim().slice(0, 30) || e.target.tagName), true);
  });
  /** A swipe (the finger from (x, y) by (fx, fy)): how far the world moved, how far it ever went back, what it caused. */
  const swipe = async (x, y, fx, fy, more = {}) => {
    const before = await at(page);
    await page.evaluate(() => {
      window.__clicks = [];
      window.__t.track();
    });
    // (CDP's distances are the finger's: negative x = the finger moves left, negative y = up.)
    await cdp.send("Input.synthesizeScrollGesture", { x, y, xDistance: fx, yDistance: fy, gestureSourceType: "touch", speed: 800, preventFling: true, ...more });
    const final = await settle(page);
    const track = await page.evaluate(() => window.__t.untrack());
    const s = await page.evaluate(() => ({ clicks: window.__clicks.slice(), dialog: !!document.querySelector("dialog[open]") }));
    return { moved: +(final - before).toFixed(1), dip: +(before - Math.min(before, ...track.map((f) => f.a))).toFixed(1), ...s };
  };
  /** A point ON a panel's content (text, a link, a picture: never the panel's own background), from the candidates given. */
  const contentPoint = (id, xs, ys, anyContent = false) =>
    page.evaluate(
      ([id, xs, ys, anyContent]) => {
        const panel = document.querySelector(`#${id} > [data-panel]`);
        if (!panel) return null;
        const r = panel.getBoundingClientRect();
        for (const x of xs)
          for (const fy of ys) {
            const y = Math.round(r.top + (r.bottom - r.top) * fy);
            const el = document.elementFromPoint(x, y);
            if (!el || el === panel || !panel.contains(el)) continue;
            if (!anyContent && !el.closest("p, h1, h2, h3, h4, li, dt, dd, a, span, figcaption, img, picture, strong")) continue;
            if (el.closest("input, select, textarea, video, audio, iframe, [contenteditable], [role=slider], [draggable=true], [data-no-drag]")) continue;
            return { x, y, on: `${el.tagName.toLowerCase()}: ${(el.textContent ?? "").trim().slice(0, 24)}` };
          }
        return null;
      },
      [id, xs, ys, anyContent],
    );
  const right = [360, 350, 340, 330, 320, 300];
  const middle = [0.5, 0.4, 0.6, 0.3, 0.7, 0.25, 0.75, 0.2, 0.8];

  // a. A swipe left from ON panel content (text, links, pictures), in five scenes: on with the finger (its
  //    distance plus the gesture's touch slop), never back on the way, no click, nothing opens.
  for (const id of ["bus", "packages", "faq", "contact", "footer"]) {
    await goScene(page, id);
    const p = await contentPoint(id, right, middle);
    const s = p ? await swipe(p.x, p.y, -250, 0) : null;
    r[`left on #${id}`] = { from: p, ...s };
    check(`5 a swipe left from #${id}'s panel content moves the world on with the finger`, p && s.moved >= 250 && s.moved <= 250 + SLOP && s.dip <= 0.5 && s.clicks.length === 0 && !s.dialog, r[`left on #${id}`]);
  }
  // b. A swipe right: only a tug, then back to exactly where it was.
  await goScene(page, "faq");
  {
    const p = await contentPoint("faq", [30, 40, 50, 60, 80], middle);
    const s = p ? await swipe(p.x, p.y, 250, 0) : null;
    const aim = tugFor(250, tugMax);
    r["right on #faq"] = { from: p, aim: +aim.toFixed(1), ...s };
    check("5 a swipe right only tugs", p && s.dip >= 0.6 * aim && s.dip <= aim + 1 && s.clicks.length === 0, r["right on #faq"]);
    check("5 a swipe right springs back to exactly where it was", p && near(s.moved, 0, 1), r["right on #faq"]);
  }
  // c. A vertical swipe up over a panel whose content fits: on, as the wheel would.
  await goScene(page, "bus");
  {
    const overflows = await page.evaluate(() => document.querySelector("#bus > [data-panel]").hasAttribute("data-overflows"));
    const p = await contentPoint("bus", [195, 150, 240, 100, 290], [0.8, 0.75, 0.7, 0.85, 0.65, 0.6]);
    const s = p && p.y > 300 ? await swipe(p.x, p.y, 0, -250) : null;
    const panelTop = await page.evaluate(() => document.querySelector("#bus > [data-panel]").scrollTop);
    r["up on #bus"] = { from: p, overflows, panelTop, ...s };
    check("5 a vertical swipe up over a panel that fits moves the world on", p && s && !overflows && s.moved >= 250 && s.moved <= 250 + SLOP && s.dip <= 0.5 && panelTop === 0 && s.clicks.length === 0, r["up on #bus"]);
  }
  // d. Over a panel whose content overflows it (test-only padding in the Features panel: data-overflows), a
  //    vertical swipe scrolls that content and the world stays.
  await goScene(page, "features");
  {
    await page.evaluate(() => {
      const panel = document.querySelector("#features > [data-panel]");
      panel.firstElementChild.dataset.testPad = panel.firstElementChild.style.paddingBottom;
      panel.firstElementChild.style.paddingBottom = "1600px";
    });
    const marked = await page.waitForFunction(() => document.querySelector("#features > [data-panel]").hasAttribute("data-overflows"), null, { timeout: 3000 }).then(() => true, () => false);
    // (Anywhere on the panel's content: the test padding is part of it.)
    const p = await contentPoint("features", [195, 150, 240, 100, 290], [0.8, 0.75, 0.7, 0.85, 0.65, 0.6], true);
    const s = p && p.y > 300 ? await swipe(p.x, p.y, 0, -250) : null;
    await page.waitForTimeout(300);
    const panelTop = await page.evaluate(() => document.querySelector("#features > [data-panel]").scrollTop);
    await page.evaluate(() => {
      const panel = document.querySelector("#features > [data-panel]");
      panel.scrollTop = 0;
      panel.firstElementChild.style.paddingBottom = panel.firstElementChild.dataset.testPad ?? "";
      delete panel.firstElementChild.dataset.testPad;
    });
    r["up on an overflowing panel"] = { from: p, marked, panelTop, ...s };
    check("5 a vertical swipe over a panel whose content overflows scrolls that content, the world stays", marked && p && s && panelTop >= 150 && near(s.moved, 0, 0.5) && s.dip <= 0.5, r["up on an overflowing panel"]);
  }
  // e. A swipe that starts on a booking link (a package's "Request pricing", Contact's Book): on, and no drawer.
  for (const [id, sel] of [
    ["packages", "#packages a[data-action][data-book-package]"],
    ["contact", '#contact a[data-action="book"]'],
  ]) {
    await goScene(page, id);
    // (A wide scene lays its cards out sideways: the first link brought in, centred on the screen.)
    const off = await page.evaluate((sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      const c = (r.left + r.right) / 2;
      return r.left < 4 || r.right > innerWidth - 4 ? c - innerWidth / 2 : 0;
    }, sel);
    if (off) await goScene(page, id, off);
    const p = await page.evaluate((sel) => {
      const links = [...document.querySelectorAll(sel)]
        .map((a) => ({ a, r: a.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight);
      const best = links.sort((x, y) => y.r.left + y.r.right - (x.r.left + x.r.right))[0];
      if (!best) return null;
      const x = Math.round((best.r.left + best.r.right) / 2);
      const y = Math.round((best.r.top + best.r.bottom) / 2);
      return { x, y, onLink: document.elementFromPoint(x, y)?.closest("a") === best.a, text: best.a.textContent.trim().slice(0, 30) };
    }, sel);
    const d = p ? Math.min(250, p.x - 20) : 0;
    const s = p ? await swipe(p.x, p.y, -d, 0) : null;
    r[`left from a booking link in #${id}`] = { from: p, distance: d, ...s };
    check(`5 a swipe from a booking link in #${id} moves on and opens no drawer`, p && p.onLink && d >= 100 && s.moved >= d && s.moved <= d + SLOP && s.clicks.length === 0 && !s.dialog, r[`left from a booking link in #${id}`]);
  }
  // f. A tap while the world is moving (End's trip from #bus to the footer) stops it there, and isn't a click.
  await goScene(page, "bus");
  {
    await blur(page);
    const footerAt = await page.evaluate(() => window.__t.start("footer"));
    await page.evaluate(() => (window.__clicks = []));
    await page.keyboard.press("End");
    await page.waitForTimeout(400);
    const moving = await page.evaluate(() => new Promise((res) => {
      const a = window.__t.at();
      requestAnimationFrame(() => requestAnimationFrame(() => res(window.__t.at() - a)));
    }));
    await cdp.send("Input.synthesizeTapGesture", { x: 195, y: 420, duration: 50, tapCount: 1, gestureSourceType: "touch" });
    await page.waitForTimeout(100);
    const p1 = await at(page);
    await page.waitForTimeout(700);
    const p2 = await at(page);
    const s = await page.evaluate(() => ({ clicks: window.__clicks.slice(), dialog: !!document.querySelector("dialog[open]") }));
    r["a tap while moving"] = { movingBeforeTap: +moving.toFixed(1), afterTap: Math.round(p1), later: Math.round(p2), footerAt: Math.round(footerAt), ...s };
    check("5 a tap while the world is moving stops it, and isn't a click", moving > 2 && near(p2, p1, 0.5) && p2 < footerAt - 100 && s.clicks.length === 0 && !s.dialog, r["a tap while moving"]);
  }
  results["5 touch (phone)"] = r;
  await ctx.close();
}

// 6. Nav: links travel forward to their scene's start (aria-current, focus), never touching the address or the
//    history; round the loop; re-aligning; the home link; Skip; Back; deep link; reload.
if (want(6)) {
  const out = {};
  let freshHistory = null;
  for (const [name, opts] of Object.entries(sizes)) {
    const { ctx, page } = await open(opts);
    const r = { links: {} };
    const navSel = name === "desktop" ? 'nav[aria-label="Main"]' : 'nav[aria-label="Mobile"]';
    const { L, w } = await page.evaluate(() => ({ L: window.__t.lap(), w: window.__t.width() }));
    const where = await page.evaluate(() => ({ href: location.href, history: history.length }));
    freshHistory ??= where.history;
    r.where = where;
    /** After following a link to #id: where the scene is, the address and history, which links say "you are here", focus. */
    const arrived = (id, on = page) =>
      on.evaluate(
        ([id, navSel]) => {
          const scene = document.getElementById(id).closest("[data-scene]");
          return {
            edge: Math.round(window.__t.edge(id)),
            href: location.href,
            hash: location.hash,
            history: history.length,
            current: [...document.querySelectorAll(`${navSel} a[aria-current="location"]`)].map((a) => a.getAttribute("href")),
            focusInScene: scene.contains(document.activeElement),
            focus: document.activeElement?.id || document.activeElement?.tagName.toLowerCase() || null,
            menuOpen: !!document.querySelector("[data-site-header] dialog[open]"),
          };
        },
        [id, navSel],
      );
    const verify = (label, id, a) =>
      check(label, near(a.edge, 0, 3) && a.href === where.href && a.hash === "" && a.history === where.history && a.current.length === 1 && a.current[0] === `/#${id}` && a.focusInScene && !a.menuOpen, a);
    /** Follow a nav link (the phone: from its drawer), tracking the trip. */
    const follow = async (href) => {
      if (name === "phone") {
        await page.locator('[data-site-header] button[aria-haspopup="dialog"]').click();
        await page.waitForTimeout(400);
      }
      await page.evaluate(() => window.__t.track());
      await page.locator(`${navSel} a[href="${href}"]`).click();
      await page.waitForTimeout(100);
      await settle(page);
      await page.waitForTimeout(200);
      return journey(await page.evaluate(() => window.__t.untrack()), L);
    };
    const hrefs = await page.locator(`${navSel} a`).evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    check(`6 ${name}: the nav has every scene's link`, hrefs.length === 8, hrefs);
    // Every link in turn (Home, Bus … Contact): each is ahead of the last.
    for (const href of hrefs) {
      const id = href.split("#")[1];
      const trip = await follow(href);
      const a = await arrived(id);
      r.links[href] = { ...a, trip: { wraps: trip.wraps, back: trip.backward, travelled: trip.travelled } };
      verify(`6 ${name}: ${href} travels to the scene's start (aria-current, focus; the address and history untouched)`, id, a);
      check(`6 ${name}: ${href} is reached going forward`, trip.wraps === 0 && trip.backward === 0 && trip.travelled > 0, r.links[href].trip);
    }
    // From #contact, Bus is ahead round the loop.
    {
      const trip = await follow("/#bus");
      const a = await arrived("bus");
      r.roundToBus = { ...a, trip: { wraps: trip.wraps, back: trip.backward, travelled: trip.travelled } };
      verify(`6 ${name}: from #contact, /#bus travels to the scene's start`, "bus", a);
      check(`6 ${name}: from #contact, Bus is reached going forward round the loop (the lap position wraps once)`, trip.wraps === 1 && trip.backward === 0, r.roundToBus.trip);
    }
    // Deep inside a wide scene (Events: well over two screens), its own link goes back to its start, in the same lap.
    {
      const events = await page.evaluate(() => ({ start: window.__t.start("events"), width: document.getElementById("events").offsetWidth }));
      await go(page, events.start + 1.5 * w);
      const trip = await follow("/#events");
      const a = await arrived("events");
      r.realign = { events, ...a, trip: { wraps: trip.wraps, on: trip.forward, travelled: trip.travelled } };
      verify(`6 ${name}: deep inside #events, its own link goes back to its start`, "events", a);
      check(`6 ${name}: ... in the same lap, only ever back`, events.width > 2 * w && trip.wraps === 0 && trip.forward === 0 && near(trip.travelled, -1.5 * w, 2), r.realign);
    }
    // The home link (from Events: on round the loop to the tunnel's branding) and the tunnel's "See the Bus".
    await page.evaluate(() => window.__t.track());
    await page.locator('[data-site-header] a[aria-label$="home"]').click();
    await page.waitForTimeout(100);
    await settle(page);
    const homeTrip = journey(await page.evaluate(() => window.__t.untrack()), L);
    const ctas = await page
      .waitForFunction(() => {
        const c = getComputedStyle(document.querySelector("[data-bus-ctas]"));
        return c.visibility === "visible" && +c.opacity > 0.99;
      }, null, { timeout: 15000 })
      .then(() => true, () => false);
    const home = { ...(await arrived("intro-end")), ctas, trip: { wraps: homeTrip.wraps, back: homeTrip.backward } };
    check(`6 ${name}: the home link goes on round the loop to the tunnel's branding`, near(home.edge, 0, 3) && home.hash === "" && home.ctas && homeTrip.wraps === 1 && homeTrip.backward === 0, home);
    await page.locator("[data-bus-ctas] a", { hasText: "See the Bus" }).click();
    await page.waitForTimeout(100);
    await settle(page);
    await page.waitForTimeout(200);
    r.seeTheBus = { home, arrived: await arrived("bus") };
    verify(`6 ${name}: the tunnel's "See the Bus" travels to #bus`, "bus", r.seeTheBus.arrived);
    // "Skip to content": from the far end of the world (among the content), focus goes to the scene in view and
    // nothing moves; from inside the tunnel scene it travels on to #main (the first scene) and focuses it.
    {
      await go(page, await page.evaluate(() => window.__t.max()));
      const was = await at(page);
      const inView = await page.evaluate(() => window.__t.inView());
      await page.locator('a[href="#main"]').focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(100);
      await settle(page);
      await page.waitForTimeout(300);
      r.skipFromEnd = { inView, ...(await page.evaluate(() => ({ at: window.__t.at(), focus: document.activeElement?.id ?? null, href: location.href, history: history.length }))), was };
      check(`6 ${name}: "Skip to content" from among the content only moves focus to the scene in view`, near(r.skipFromEnd.at, was, 0.5) && r.skipFromEnd.focus === inView && inView === "footer" && r.skipFromEnd.href === where.href && r.skipFromEnd.history === where.history, r.skipFromEnd);
      const span = await page.evaluate(() => window.__t.tunnel() - window.__t.width());
      await go(page, 0.5 * span);
      await page.evaluate(() => window.__t.track());
      await page.locator('a[href="#main"]').focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(100);
      await settle(page);
      const trip = journey(await page.evaluate(() => window.__t.untrack()), L);
      r.skipFromTunnel = { ...(await page.evaluate(() => ({ edge: Math.round(window.__t.edge("main")), focus: document.activeElement?.id ?? null, href: location.href, history: history.length }))), trip: { wraps: trip.wraps, back: trip.backward } };
      check(`6 ${name}: "Skip to content" from inside the tunnel scene travels on to the first scene and focuses it`, near(r.skipFromTunnel.edge, 0, 3) && r.skipFromTunnel.focus === "main" && trip.wraps === 0 && trip.backward === 0 && r.skipFromTunnel.href === where.href && r.skipFromTunnel.history === where.history, r.skipFromTunnel);
    }
    // A link followed right after a busy moment (a 30 ms task), from the very start of the world, still travels.
    await go(page, 0);
    await page.evaluate(() => window.__t.afterBusyTask("home"));
    await page.waitForTimeout(50);
    await settle(page);
    r.afterBusyTask = { edge: Math.round(await page.evaluate(() => window.__t.edge("intro-end"))), hash: await page.evaluate(() => location.hash) };
    check(`6 ${name}: a link from the start, right after a busy task, still travels`, near(r.afterBusyTask.edge, 0, 3) && r.afterBusyTask.hash === "", r.afterBusyTask);
    // Travelling made no history entries: Back leaves the page.
    r.history = await page.evaluate(() => ({ href: location.href, length: history.length }));
    check(`6 ${name}: travelling never changed the address or added a history entry`, r.history.href === where.href && r.history.length === where.history, { where, now: r.history });
    await page.goBack({ waitUntil: "load" }).catch(() => null);
    r.back = page.url();
    check(`6 ${name}: Back leaves the page (there is no extra entry)`, r.back !== where.href && !r.back.startsWith(URL), { back: r.back, was: where.href });
    await ctx.close();

    // A deep link opens at its scene (not held for the film), then the address forgets the hash (no new entry).
    {
      const { ctx, page: linked } = await open(opts, { url: `${URL}#packages` });
      const a = await arrived("packages", linked);
      a.held = await linked.evaluate(() => document.documentElement.hasAttribute("data-scroll-lock"));
      r.deepLink = a;
      check(`6 ${name}: a deep link to #packages opens at its start`, near(a.edge, 0, 3) && a.current[0] === "/#packages" && !a.held, a);
      check(`6 ${name}: ... and the hash is then removed, with no new history entry`, a.hash === "" && a.href === URL && a.history === freshHistory, { ...a, freshHistory });
      await ctx.close();
    }
    // A reload without a hash comes back to the same place.
    {
      const { ctx, page } = await open(opts);
      await goScene(page, "faq", 137);
      await page.waitForTimeout(300);
      const before = await at(page);
      await page.reload({ waitUntil: "load" });
      await ready(page);
      const after = await at(page);
      const saved = await page.evaluate(() => sessionStorage.getItem("smokeys:world-place"));
      r.reload = { before, after, saved, inView: await page.evaluate(() => window.__t.inView()), hash: await page.evaluate(() => location.hash) };
      check(`6 ${name}: a reload comes back to the same place`, near(after, before, 3) && r.reload.inView === "faq" && r.reload.hash === "" && /"id":"faq"/.test(saved ?? ""), r.reload);
      await ctx.close();
    }
    out[name] = r;
  }
  results["6 nav"] = out;
}

// 7. Keyboard focus on something only partly on screen brings all of it on screen.
if (want(7)) {
  const out = {};
  for (const [name, opts] of Object.entries(sizes)) {
    const { ctx, page } = await open(opts, { url: `${URL}#events` });
    const r = {};
    for (const [label, sel, i] of [
      ["an occasion card", "#events a[data-book-occasion]", 2],
      ["a gallery tile", "#gallery ul button", 3],
    ]) {
      const rect = (k) => page.evaluate(([sel, k]) => {
        const b = document.querySelectorAll(sel)[k].getBoundingClientRect();
        return { left: Math.round(b.left), right: Math.round(b.right), screen: innerWidth };
      }, [sel, k]);
      const isActive = (k) => page.evaluate(([sel, k]) => document.activeElement === document.querySelectorAll(sel)[k], [sel, k]);
      // Tab on to item i, with only its first 60px on screen at the right.
      await page.locator(sel).nth(i - 1).focus();
      await settle(page);
      await page.evaluate(([sel, i]) => {
        const b = document.querySelectorAll(sel)[i].getBoundingClientRect();
        return window.__t.go(window.__t.at() + b.left - (innerWidth - 60));
      }, [sel, i]);
      await page.waitForTimeout(150);
      const partlyRight = await rect(i);
      await page.keyboard.press("Tab");
      await settle(page);
      const right = { before: partlyRight, active: await isActive(i), after: await rect(i) };
      // Shift+Tab back to item i - 1, with only its last 60px on screen at the left.
      await page.evaluate(([sel, i]) => {
        const b = document.querySelectorAll(sel)[i - 1].getBoundingClientRect();
        return window.__t.go(window.__t.at() + b.right - 60);
      }, [sel, i]);
      await page.waitForTimeout(150);
      const partlyLeft = await rect(i - 1);
      await page.keyboard.press("Shift+Tab");
      await settle(page);
      const left = { before: partlyLeft, active: await isActive(i - 1), after: await rect(i - 1) };
      r[label] = { right, left };
      const partly = (b) => (b.left < b.screen && b.right > b.screen) || (b.left < 0 && b.right > 0);
      const whole = (b) => b.left >= 0 && b.right <= b.screen;
      check(`7 ${name}: Tab to ${label} partly on screen brings it fully on`, partly(right.before) && right.active && whole(right.after), right);
      check(`7 ${name}: Shift+Tab to ${label} partly on screen brings it fully on`, partly(left.before) && left.active && whole(left.after), left);
    }
    out[name] = r;
    await ctx.close();
  }
  results["7 keyboard focus"] = out;
}

// 8. Every scene's panel fits the screen without scrolling inside it (after every scene has been visited,
//    so everything that reveals itself on the way has).
if (want(8)) {
  const out = {};
  for (const [name, opts] of [
    ["1280x800", desktop],
    ["1440x900", { viewport: { width: 1440, height: 900 } }],
    ["1920x1080", { viewport: { width: 1920, height: 1080 } }],
    ["390x844", phone],
    ["375x667", { ...phone, viewport: { width: 375, height: 667 } }],
  ]) {
    const { ctx, page } = await open(opts, { url: `${URL}#bus` });
    const { max, w } = await page.evaluate(() => ({ max: window.__t.max(), w: window.__t.width() }));
    for (let x = 0; x <= max + w * 0.7; x += w * 0.7) await go(page, Math.min(x, max));
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({
      axis: document.documentElement.dataset.axis,
      panels: Object.fromEntries(
        [...document.querySelectorAll("[data-scene] > [data-panel]")].map((p) => [p.parentElement.id, p.scrollHeight - p.clientHeight]),
      ),
    }));
    out[name] = r;
    check(`8 ${name}: sideways, with every scene's panel`, r.axis === "x" && Object.keys(r.panels).length === SCENES.length - 1, r);
    for (const [id, over] of Object.entries(r.panels)) check(`8 ${name}: #${id}'s panel fits without scrolling inside`, over <= 1, { overflowY: over });
    await ctx.close();
  }
  results["8 panels fit"] = out;
}

// 9. The progress marks, the guide bus and the header's border.
if (want(9)) {
  const out = {};
  for (const [name, opts] of Object.entries(sizes)) {
    const { ctx, page } = await open(opts);
    const { L, w, W, bus, max } = await page.evaluate(() => ({
      L: window.__t.lap(),
      w: window.__t.width(),
      W: window.__t.tunnel(),
      bus: window.__t.start("bus"),
      max: window.__t.max(),
    }));
    const sample = (where) =>
      page.evaluate((where) => {
        const marks = [...document.querySelectorAll("[data-loop-mark]")];
        const ring = marks[0].parentElement.getBoundingClientRect();
        const bar = marks[0].parentElement.firstElementChild;
        const gb = document.querySelector("[data-guide-bus]");
        const g = getComputedStyle(gb);
        const br = gb.getBoundingClientRect();
        const tr = document.getElementById("top").getBoundingClientRect();
        const a = window.__t.at();
        return {
          where,
          a: Math.round(a),
          f: +(a / window.__t.lap()).toFixed(4),
          round: window.__t.round(),
          // Each mark's centre along the line, as a share of it (a ring: copies a lap apart).
          marks: marks.map((m) => {
            const r = m.getBoundingClientRect();
            return { centre: +((r.left + r.width / 2 - ring.left) / ring.width).toFixed(4), width: +(r.width / ring.width).toFixed(3), shown: getComputedStyle(m).display !== "none" };
          }),
          barShown: getComputedStyle(bar).display !== "none",
          headerBorder: getComputedStyle(document.querySelector("[data-site-header]")).borderBottomColor,
          busShown: g.visibility === "visible" && +g.opacity > 0.99,
          busHidden: g.visibility === "hidden" && +g.opacity === 0,
          // (shiftX: how far it has driven on from its place on the road, from its box's centre.)
          bus: { right: Math.round(br.right), opacity: +(+g.opacity).toFixed(3), scale: g.scale === "none" || g.scale === "" ? 1 : +g.scale, shiftX: Math.round((br.left + br.right) / 2 - (gb.offsetLeft + gb.offsetWidth / 2)) },
          tunnelLeft: Math.round(tr.left),
        };
      }, where);
    const samples = [];
    const visit = async (where, a) => {
      await go(page, a);
      await page.waitForTimeout(400); // (the header's border fades in over 300 ms)
      samples.push(await sample(where));
    };
    await visit("start", 0);
    await visit("mid-tunnel", (W - w) / 2);
    await visit("back at the start", 0);
    await visit("#bus", bus);
    await visit("half-way", max / 2);
    await visit("the end of the world's own order", max);
    await visit("the tunnel 3/4 of a screen in from the right", L - 0.75 * w);
    await visit("the tunnel half a screen in", L - 0.5 * w);
    await visit("the tunnel a quarter of a screen in", L - 0.25 * w);
    await visit("docked", L - 1);
    // On round the join (a trackpad's few pixels), into the next lap.
    await page.mouse.move(w / 2, 400);
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 5.5);
      await page.waitForTimeout(16);
    }
    await settle(page);
    await page.waitForTimeout(400);
    samples.push(await sample("round the loop, the next lap's start"));
    out[name] = samples;
    const S = (where) => samples.find((s) => s.where === where);
    const lapSamples = samples.slice(0, -1).filter((s) => s.where !== "back at the start");
    const wrapped = samples.at(-1);

    // The marks: one ring, centred at f = lap position / L, copies a lap apart; the fill bar hidden sideways.
    check(
      `9 ${name}: the loop mark shows the lap position (a ring: copies a lap apart)`,
      samples.every((s) => s.marks.length === 3 && s.marks.every((m) => m.shown && near(m.width, 0.12, 0.002)) && near(s.marks[1].centre, s.f, 0.003) && near(s.marks[0].centre - s.marks[1].centre, 1, 0.003) && near(s.marks[1].centre - s.marks[2].centre, 1, 0.003) && !s.barShown),
      samples.map((s) => ({ where: s.where, f: s.f, marks: s.marks.map((m) => m.centre), barShown: s.barShown })),
    );
    check(
      `9 ${name}: the mark goes on round the lap and comes back round to the start after the join`,
      lapSamples.every((s, i) => i === 0 || s.f > lapSamples[i - 1].f) && lapSamples[0].f === 0 && S("docked").f > 0.999 && wrapped.f > 0 && wrapped.f < 0.002 && wrapped.round === false,
      samples.map((s) => `${s.where}: ${s.f}`),
    );
    // The guide bus.
    check(`9 ${name}: the guide bus waits while the tunnel is on screen`, S("start").busHidden && S("mid-tunnel").busHidden, [S("start"), S("mid-tunnel")]);
    check(`9 ${name}: the guide bus shows once past the tunnel`, ["#bus", "half-way", "the end of the world's own order"].every((k) => S(k).busShown), ["#bus", "half-way", "the end of the world's own order"].map(S));
    // Wherever the tunnel scene is ahead (round) with its stage on screen, the bus is either gone or clear of it.
    const ahead = samples.filter((s) => s.round && s.tunnelLeft > 0 && s.tunnelLeft < w);
    const approach = ["the tunnel 3/4 of a screen in from the right", "the tunnel half a screen in", "the tunnel a quarter of a screen in", "docked"].map(S);
    check(`9 ${name}: as the tunnel arrives from the right, the guide bus is never over it`, approach.every((s) => ahead.includes(s)) && ahead.every((s) => s.bus.opacity === 0 || s.bus.right <= s.tunnelLeft), ahead.map((s) => ({ where: s.where, tunnelLeft: s.tunnelLeft, bus: s.bus })));
    const q = approach[0];
    check(`9 ${name}: it drives off ahead (further right, smaller) and is gone before the tunnel docks`, q.bus.opacity > 0 && q.bus.scale < 1 && q.bus.shiftX > 0 && S("the tunnel a quarter of a screen in").busHidden && S("docked").busHidden && approach.every((s, i) => i === 0 || (s.bus.scale <= approach[i - 1].bus.scale && s.bus.opacity <= approach[i - 1].bus.opacity && s.bus.shiftX >= approach[i - 1].bus.shiftX)), approach.map((s) => ({ where: s.where, bus: s.bus })));
    check(`9 ${name}: after the join, the guide bus waits again (the tunnel on screen behind it)`, wrapped.busHidden, wrapped);
    // The header's border: none at the very start, there once the visitor has moved along, gone back at the start
    // (a step back of less than half a lap), and still there once the journey has come round the loop.
    const clear = (c) => /rgba\(0, 0, 0, 0\)|transparent/.test(c);
    check(
      `9 ${name}: the header's border shows once moved along, goes at the start, stays on round the loop`,
      clear(S("start").headerBorder) && !clear(S("mid-tunnel").headerBorder) && clear(S("back at the start").headerBorder) && samples.slice(3).every((s) => !clear(s.headerBorder)),
      samples.map((s) => `${s.where}: ${s.headerBorder}`),
    );
    await ctx.close();
  }
  // Down the column (a short screen): the fill bar shows how far down the page; no loop marks.
  {
    const { ctx, page } = await open({ viewport: { width: 1280, height: 440 } });
    const column = [];
    for (const share of [0, 0.5, 1]) {
      await page.evaluate((s) => window.scrollTo({ top: s * (document.documentElement.scrollHeight - innerHeight), behavior: "instant" }), share);
      await page.waitForTimeout(300);
      column.push(
        await page.evaluate(() => {
          const marks = [...document.querySelectorAll("[data-loop-mark]")];
          const bar = marks[0].parentElement.firstElementChild;
          const max = document.documentElement.scrollHeight - innerHeight;
          return {
            axis: document.documentElement.dataset.axis,
            share: +(scrollY / max).toFixed(3),
            line: +(bar.getBoundingClientRect().width / bar.parentElement.getBoundingClientRect().width).toFixed(3),
            marksShown: marks.filter((m) => getComputedStyle(m).display !== "none").length,
          };
        }),
      );
    }
    out.column = column;
    check("9 column: the fill bar shows how far down the page, no loop marks", column.every((c) => c.axis === "y" && near(c.line, c.share, 0.01) && c.marksShown === 0) && column[0].line === 0 && column.at(-1).line === 1, column);
    await ctx.close();
  }
  results["9 progress, guide bus, header border"] = out;
}

// 10. No JavaScript: a classic vertical page with every scene, and the actions are links to the Contact scene.
if (want(10)) {
  const out = {};
  for (const [name, opts] of Object.entries(sizes)) {
    const ctx = await browser.newContext({ ...opts, javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: "load" });
    const r = await page.evaluate((ids) => {
      const h = document.documentElement;
      const w = document.querySelector("[data-world]");
      const scenes = ids.map((id) => document.getElementById(id));
      const rects = scenes.filter(Boolean).map((s) => s.getBoundingClientRect());
      const actions = [...document.querySelectorAll("[data-action]")];
      return {
        axis: h.dataset.axis ?? null,
        worldPosition: getComputedStyle(w).position,
        missing: ids.filter((id, i) => !scenes[i]),
        stacked: rects.every((s, i) => i === 0 || s.top >= rects[i - 1].bottom - 1),
        screens: +(h.scrollHeight / innerHeight).toFixed(1),
        overflowX: h.scrollWidth - h.clientWidth,
        actions: actions.length,
        actionsToContact: actions.every((a) => a.tagName === "A" && new URL(a.href).hash === "#contact" && new URL(a.href).pathname === "/"),
      };
    }, SCENES);
    await page.locator('[data-site-header] > div > a[data-action="book"]').click();
    await page.waitForTimeout(1500);
    r.afterBook = await page.evaluate(() => ({ hash: location.hash, contactTop: Math.round(document.getElementById("contact").getBoundingClientRect().top) }));
    out[name] = r;
    check(`10 ${name}: a vertical column with every scene`, r.axis === null && r.worldPosition !== "fixed" && r.missing.length === 0 && r.stacked && r.screens > 5 && r.overflowX <= 0, r);
    check(`10 ${name}: every action is a link to /#contact`, r.actions >= 6 && r.actionsToContact, r);
    check(`10 ${name}: Book takes the visitor to the Contact scene`, r.afterBook.hash === "#contact" && r.afterBook.contactTop >= 0 && r.afterBook.contactTop < opts.viewport.height / 2, r.afterBook);
    await ctx.close();
  }
  results["10 no JavaScript"] = out;
}

// 11. The booking panel.
if (want(11)) {
  const out = {};
  const SEED = { vehicle: "Harness coach" };
  for (const [name, opts] of Object.entries(sizes)) {
    const { ctx, page } = await open(opts, { booking: SEED });
    const r = { openers: {} };
    const dialog = page.locator("dialog[aria-labelledby]");
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("smokeys:booking") ?? "{}"));
    const panel = () =>
      page.evaluate(() => {
        const d = document.querySelector("dialog[aria-labelledby]");
        return {
          open: d.open,
          title: document.getElementById(d.getAttribute("aria-labelledby"))?.textContent ?? null,
          focusInside: d.contains(document.activeElement),
          dateFocused: document.activeElement?.getAttribute("data-field") === "date",
          width: Math.round(d.getBoundingClientRect().width),
        };
      });
    /** Click `opener` (marked, to find it again), check the panel; close it `how`; check focus came back. */
    const openFrom = async (label, opener, how, more) => {
      await skyStill(page);
      await opener.evaluate((el) => (el.dataset.testOpener = ""));
      await opener.click();
      await page.waitForTimeout(500);
      const opened = await panel();
      const extra = more ? await more() : undefined;
      if (how === "Esc") await page.keyboard.press("Escape");
      else if (how === "backdrop") {
        // The backdrop beside the panel (the panel stops short of a phone's left edge too).
        const left = (await dialog.boundingBox()).x;
        if (left >= 16) await page.mouse.click(left / 2, (opts.viewport.height * 2) / 3);
      }
      else await dialog.getByRole("button", { name: "Close" }).click();
      await page.waitForTimeout(500);
      const closed = await page.evaluate(() => ({
        open: document.querySelector("dialog[aria-labelledby]").open,
        focusOnOpener: !!document.activeElement?.hasAttribute("data-test-opener"),
      }));
      await opener.evaluate((el) => delete el.dataset.testOpener);
      r.openers[label] = { opened, closedWith: how, closed, ...(extra ? { extra } : {}) };
      return { opened, closed, extra };
    };

    // a. The header's Book; every field typed in turn, each saved and merged; the preview and the links; the world held.
    const typed = {};
    let fields;
    const a = await openFrom("header Book", page.locator('[data-site-header] > div > a[data-action="book"]'), "Esc", async () => {
      const steps = [];
      const save = async (field, key, value, act) => {
        await act();
        await page.waitForTimeout(80);
        const s = await stored();
        typed[key] = value;
        steps.push({ field, ok: Object.entries(typed).every(([k, v]) => s[k] === v) && s.vehicle === SEED.vehicle });
      };
      await save("date", "date", "2026-12-31", () => dialog.getByLabel("Date", { exact: true }).fill("2026-12-31"));
      await save("time", "time", "19:30", () => dialog.getByLabel("Pickup time", { exact: true }).fill("19:30"));
      await save("pickup", "pickup", "42 Harness Lane", () => dialog.getByLabel("Pickup place", { exact: true }).fill("42 Harness Lane"));
      await save("guests", "passengers", 12, () => dialog.getByLabel("Guests", { exact: true }).fill("12"));
      const occasion = await dialog.getByLabel("Occasion", { exact: true }).locator("option").nth(2).getAttribute("value");
      await save("occasion", "eventType", occasion, () => dialog.getByLabel("Occasion", { exact: true }).selectOption(occasion));
      const pkg = await dialog.getByLabel("Package", { exact: true }).locator("option").nth(1).getAttribute("value");
      await save("package", "package", pkg, () => dialog.getByLabel("Package", { exact: true }).selectOption(pkg));
      await save("notes", "notes", "Bring the disco lights & glow sticks", () => dialog.getByLabel("Anything else", { exact: true }).fill("Bring the disco lights & glow sticks"));
      await save("day or night", "period", "night", () => dialog.locator('[role=radio][aria-label="Night ride"]').click());
      fields = { occasion, pkg };
      // The preview and the links.
      await dialog.locator("details summary").click();
      await page.waitForTimeout(400);
      const texts = await page.evaluate(() => {
        const d = document.querySelector("dialog[aria-labelledby]");
        const q = (root, s) => root.querySelector(s)?.getAttribute("href") ?? "";
        const c = document.getElementById("contact");
        return {
          preview: d.querySelector("details p")?.textContent ?? "",
          sms: decodeURIComponent(q(d, 'a[href^="sms:"]')),
          mail: decodeURIComponent(q(d, 'a[href^="mailto:"]')),
          contactSms: decodeURIComponent(q(c, 'a[href^="sms:"]')),
          contactMail: decodeURIComponent(q(c, 'a[href^="mailto:"]')),
        };
      });
      const want = ["a night ride", "Dec 31, 2026", "7:30 PM", "42 Harness Lane", "Guests: 12", `Occasion: ${occasion}`, `Package: ${pkg}`, "Notes: Bring the disco lights & glow sticks"];
      const carries = Object.fromEntries(Object.entries(texts).map(([k, v]) => [k, want.filter((x) => !v.includes(x))]));
      // While it's open: the wheel (over the backdrop and over the panel) and the keys leave the world where it is.
      const was = await at(page);
      const box = await dialog.boundingBox();
      if (box.x >= 16) {
        await page.mouse.move(box.x / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 300);
      }
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 300);
      await dialog.getByRole("button", { name: "Close" }).focus();
      for (const key of ["PageDown", "ArrowRight", "End", "Home"]) await page.keyboard.press(key);
      await page.waitForTimeout(300);
      const held = { moved: (await settle(page)) - was, pageScrollY: await page.evaluate(() => scrollY) };
      return { steps, carries, subject: texts.mail.match(/subject=([^&]*)/)?.[1] ?? "", held };
    });
    check(`11 ${name}: the header's Book opens the booking panel`, a.opened.open && a.opened.title === "Book your ride" && a.opened.focusInside, a.opened);
    for (const s of a.extra.steps) check(`11 ${name}: typing the ${s.field} saves it, merged`, s.ok, { typed, stored: await stored() });
    for (const [k, missing] of Object.entries(a.extra.carries)) check(`11 ${name}: the ${k} carries every detail`, missing.length === 0, { missing });
    check(`11 ${name}: the email's subject carries the ride and the date`, a.extra.subject.includes("a night ride") && a.extra.subject.includes("Dec 31, 2026"), a.extra.subject);
    check(`11 ${name}: while it's open the wheel and keys don't move the world`, near(a.extra.held.moved, 0, 0.5) && a.extra.held.pageScrollY === 0, a.extra.held);
    check(`11 ${name}: Esc closes it, focus back on the header's Book`, !a.closed.open && a.closed.focusOnOpener, a.closed);

    // b. The tunnel's "Book your ride", after the home link to /#intro-end.
    await skyStill(page);
    await page.locator('[data-site-header] a[aria-label$="home"]').click();
    await settle(page);
    await page.waitForFunction(() => {
      const c = getComputedStyle(document.querySelector("[data-bus-ctas]"));
      return c.visibility === "visible" && +c.opacity > 0.99;
    }, null, { timeout: 15000 }).catch(() => {});
    const b = await openFrom("tunnel Book your ride", page.locator('[data-bus-ctas] a[data-action="book"]'), "backdrop");
    check(`11 ${name}: the tunnel's "Book your ride" opens it`, b.opened.open && b.opened.title === "Book your ride" && b.opened.focusInside, b.opened);
    check(`11 ${name}: the backdrop closes it, focus back on the tunnel's button`, !b.closed.open && b.closed.focusOnOpener, b.closed);

    // c, d. Contact's Book and Schedule (Schedule focuses the date).
    await goScene(page, "contact");
    const c = await openFrom("Contact Book", page.locator('#contact a[data-action="book"]'), "close button");
    check(`11 ${name}: Contact's Book opens it`, c.opened.open && c.opened.title === "Book your ride" && c.opened.focusInside, c.opened);
    check(`11 ${name}: the close button closes it, focus back on Contact's Book`, !c.closed.open && c.closed.focusOnOpener, c.closed);
    const d = await openFrom("Contact Schedule", page.locator('#contact a[data-action="schedule"]'), "Esc");
    check(`11 ${name}: Contact's Schedule opens it on the date`, d.opened.open && d.opened.title === "Pick your date" && d.opened.dateFocused, d.opened);
    check(`11 ${name}: Esc closes it, focus back on Schedule`, !d.closed.open && d.closed.focusOnOpener, d.closed);

    // e. A package's "Request pricing": the package is preset (and the rest kept).
    await goScene(page, "packages");
    const pricing = page.locator("#packages a[data-action][data-book-package]").last();
    const pkgName = await pricing.getAttribute("data-book-package");
    const e = await openFrom("package Request pricing", pricing, "backdrop", async () => ({
      select: await dialog.getByLabel("Package", { exact: true }).inputValue(),
      stored: await stored(),
    }));
    check(`11 ${name}: a package's "Request pricing" opens it with the package`, e.opened.open && e.opened.title === "Get a quote" && pkgName !== fields.pkg && e.extra.select === pkgName && e.extra.stored.package === pkgName, { opened: e.opened, pkgName, extra: e.extra });
    check(`11 ${name}: the preset keeps everything else`, e.extra.stored.vehicle === SEED.vehicle && e.extra.stored.pickup === "42 Harness Lane" && e.extra.stored.eventType === fields.occasion, e.extra.stored);
    check(`11 ${name}: the backdrop closes it, focus back on "Request pricing"`, !e.closed.open && e.closed.focusOnOpener, e.closed);

    // f. An occasion's "Plan this ride": the occasion is preset.
    await goScene(page, "events");
    const plan = page.locator("#events a[data-book-occasion]").first();
    const occName = await plan.getAttribute("data-book-occasion");
    const f = await openFrom("occasion Plan this ride", plan, "close button", async () => ({
      select: await dialog.getByLabel("Occasion", { exact: true }).inputValue(),
      stored: await stored(),
    }));
    check(`11 ${name}: an occasion's "Plan this ride" opens it with the occasion`, f.opened.open && f.opened.title === "Book your ride" && occName !== fields.occasion && f.extra.select === occName && f.extra.stored.eventType === occName, { opened: f.opened, occName, extra: f.extra });
    check(`11 ${name}: closed, focus back on "Plan this ride"`, !f.closed.open && f.closed.focusOnOpener, f.closed);
    r.panelWidth = `${a.opened.width}px of a ${opts.viewport.width}px screen`;
    out[name] = r;
    await ctx.close();
  }
  results["11 booking panel"] = out;
}


// 12. The loop: the join, the tunnel scene moving round, travel across the join, a trip past the tunnel, laps,
//     a tug at the very start.
if (want(12)) {
  const out = {};
  for (const [name, opts] of Object.entries(sizes)) {
    const r = { cross: {} };
    const { ctx, page } = await open(opts);
    const cdp = name === "phone" ? await ctx.newCDPSession(page) : null;
    const navSel = name === "desktop" ? 'nav[aria-label="Main"]' : 'nav[aria-label="Mobile"]';
    const geo = await page.evaluate(() => ({
      L: window.__t.lap(),
      W: window.__t.tunnel(),
      view: window.__t.width(),
      footer: document.getElementById("footer").offsetWidth,
      roundFrom: window.__t.roundFrom(),
      footerAt: window.__t.start("footer"),
      contactAt: window.__t.start("contact"),
    }));
    const { L, W, view } = geo;
    const span = W - view; // the tunnel's pinned stretch: its stage stays put (docked) while the journey goes this far
    r.geometry = geo;
    const state = () =>
      page.evaluate(() => {
        const v = document.querySelector("video[data-film]");
        const top = document.getElementById("top").getBoundingClientRect();
        return {
          a: window.__t.at(),
          sl: window.__t.scrollLeft(),
          round: window.__t.round(),
          topLeft: top.left,
          film: v.currentTime,
          parking: v.hasAttribute("data-parking"),
          roadShift: getComputedStyle(document.querySelector("[data-world]")).getPropertyValue("--road-shift").trim(),
          // The panels on screen, as they glide in (scroll-driven): the same place should show them the same.
          panels: [...document.querySelectorAll("[data-scene] > [data-panel]")]
            .filter((p) => {
              const r = p.getBoundingClientRect();
              return r.right > 0 && r.left < innerWidth;
            })
            .map((p) => `${p.parentElement.id}: ${getComputedStyle(p).transform} ${getComputedStyle(p).opacity}`),
        };
      });
    const unparked = () => page.waitForFunction(() => !document.querySelector("video[data-film][data-parking]"), null, { timeout: 5000 }).catch(() => {});

    // f. A tug at the very start of the world (wheeling up at lap position 0): the lap position never goes below 0,
    //    the tunnel scene is never moved round, and the world comes back to 0 (a tug never moves it on).
    {
      await page.mouse.move(view / 2, 400);
      const was = await state();
      await page.evaluate(() => window.__t.track());
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(150);
      await page.mouse.wheel(0, -100);
      await settle(page, 15);
      await page.waitForTimeout(300);
      const track = await page.evaluate(() => window.__t.untrack());
      const end = await state();
      r.tugAtStart = { was: was.a, min: Math.min(...track.map((f) => f.a)), minScrollLeft: Math.min(...track.map((f) => f.sl)), everRound: track.some((f) => f.round), end: end.a, endRound: end.round };
      check(`12 ${name}: a tug at the very start never takes the lap position below 0 nor moves the tunnel round`, was.a === 0 && !was.round && r.tugAtStart.min >= 0 && r.tugAtStart.minScrollLeft >= 0 && !r.tugAtStart.everRound && !end.round, r.tugAtStart);
      check(`12 ${name}: ... and the world comes back to 0 (a tug never moves it on)`, near(end.a, 0, 0.5), r.tugAtStart);
    }

    // The sky (its clouds drift with time) is hidden for the screenshots, and every infinite time-based
    // animation held at its start (window.__t.freeze; scroll-driven ones are left to the scroll).
    await page.addStyleTag({ content: "[data-sky-layer]{visibility:hidden!important}" });
    const shot = async (label) => {
      await page.evaluate(() => window.__t.freeze());
      const png = await page.screenshot();
      if (shotsDir) writeFileSync(`${shotsDir}/${name}-${label}.png`, png);
      return png;
    };

    // a. The join: held (html[data-loop-hold]) docked in the tunnel at the end of the lap (lap position L, the
    //    tunnel round at the end), then on by a trackpad's 0.5px into the next lap (the tunnel back at the start).
    {
      await page.evaluate(() => (document.documentElement.dataset.loopHold = ""));
      await go(page, L);
      await unparked();
      await page.waitForTimeout(900);
      const held = await state();
      const A = await shot("join-held");
      await page.evaluate(() => delete document.documentElement.dataset.loopHold);
      await page.mouse.move(view / 2, 400);
      await page.evaluate(() => window.__t.recordWheel());
      await page.mouse.wheel(0, name === "phone" ? 1 : 0.5); // (received as 0.5px: DPR 2 halves it)
      await page.waitForTimeout(700);
      const after = { ...(await state()), wheel: (await page.evaluate(() => window.__wheels))[0] ?? null };
      const B = await shot("join-on");
      r.join = { held, after, diff: await pixelDiff(A, B) };
      check(`12 ${name}: held at the join, the journey waits docked in the tunnel at the end of the lap`, near(held.a, L, 0.5) && held.round && near(held.topLeft, 0, 0.5) && held.film < FILM_HALF_FRAME && !held.parking, { ...held, halfFrame: FILM_HALF_FRAME });
      check(`12 ${name}: on past the join, the next lap starts (the tunnel back at the start, scrollLeft ≈ 0)`, after.wheel?.taken && near(after.wheel.dy, 0.5, 0.01) && !after.round && after.sl <= 1 && after.a >= 0 && after.a <= 1 && after.film === held.film, after);
      check(`12 ${name}: the join shows nothing (mean pixel difference < 0.35 levels)`, r.join.diff.mean < 0.35, r.join.diff);
    }

    // b. The tunnel scene moving round to the end, where it happens on the way forward (the turn: the footer about
    //    to come in, the scenes before it settled): the same lap position, a pixel short of the turn, in both
    //    arrangements (from among the scenes: not round; past the turn and back into the give: round). Both
    //    times it's reached from just ahead, so the panels on screen have come the same way.
    {
      const place = Math.floor(geo.roundFrom - 1);
      await go(page, W + 50);
      await go(page, place - 1);
      await go(page, place);
      await page.waitForTimeout(700);
      const before = await state();
      const C = await shot("shift-before");
      // (A control: the same place again, the same way there, NOT round: what the screenshots differ by anyway.)
      await go(page, place - 1);
      await go(page, place);
      await page.waitForTimeout(700);
      const control = await state();
      const C2 = await shot("shift-control");
      await go(page, geo.roundFrom + 200);
      await page.waitForTimeout(200);
      const past = await state();
      await go(page, place);
      await page.waitForTimeout(700);
      const after = await state();
      const D = await shot("shift-round");
      r.shift = { place, before, past, after, diff: await pixelDiff(C, D), control: { round: control.round, diff: await pixelDiff(C, C2) } };
      check(`12 ${name}: in the give, the same lap position in both arrangements`, !before.round && !control.round && past.round && after.round && near(before.a, place, 0.5) && near(after.a, place, 0.5), r.shift);
      check(`12 ${name}: the screenshots are stable (a control pair, the same arrangement, < 0.05 levels)`, r.shift.control.diff.mean < 0.05, r.shift.control);
      check(`12 ${name}: the road's dashes keep their place (--road-shift is the tunnel scene's width while it's round)`, after.roadShift === `${W}px` && past.roadShift === `${W}px` && (before.roadShift === "" || before.roadShift === "0px"), { before: before.roadShift, after: after.roadShift, W });
      check(`12 ${name}: moving the tunnel scene round shows nothing (mean pixel difference < 0.05 levels)`, r.shift.diff.mean < 0.05, r.shift.diff);
    }

    // c. Travel across the join, input by input: the lap position every frame, unwrapped.
    const crossing = async (label, from, act, skip = 0) => {
      await go(page, from);
      await settle(page);
      await unparked();
      await page.waitForTimeout(300);
      await blur(page);
      await page.evaluate(() => window.__t.track());
      const extra = await act();
      await settle(page, 15);
      const track = await page.evaluate(() => window.__t.untrack());
      const j = journey(track, L, skip);
      r.cross[label] = { from: Math.round(from), ...j, trips: [...new Set(track.map((f) => f.trip))], ...(extra ?? {}) };
      check(`12 ${name}: ${label} carries on across the join (one wrap, never a frame back, no jump)`, j.wraps === 1 && j.backward === 0 && j.jumps.length === 0 && (!skip || j.skipped?.whole === true), r.cross[label]);
      return track;
    };
    const centre = { x: Math.round(view / 2), y: 400 };
    await crossing("a stepped mouse wheel", L - 1.5 * view, async () => {
      await page.mouse.move(centre.x, centre.y);
      for (let i = 0; i < 25; i++) {
        await page.mouse.wheel(0, 100);
        await page.waitForTimeout(40);
      }
    });
    // (A trackpad's stream as it arrives, one event a frame: dispatched in the page, where the world takes it.)
    const tp = [12.4, 15.7, 18.1, 14.6, 16.9];
    await crossing("a trackpad stream", L - 400, () =>
      page.evaluate(([d, x, y]) => window.__t.paceWheel(d, x, y), [Array.from({ length: 60 }, (_, i) => tp[i % tp.length]), centre.x, centre.y]),
    );
    if (name === "desktop") {
      // Dragged on 500px from the road just before the arriving tunnel, let go while moving: the throw carries on round.
      await crossing("a mouse throw", L - 520, async () => {
        const from = await page.evaluate(() => window.__t.bare([500, 490, 480, 470, 460, 450]));
        if (!from) return { throwFrom: null };
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        for (let i = 1; i <= 30; i++) {
          await page.mouse.move(from.x - (500 * i) / 30, from.y);
          await page.waitForTimeout(16);
        }
        await page.mouse.up();
        return { throwFrom: from };
      });
    }
    if (cdp) {
      await crossing("a touch fling", L - 400, async () => {
        await cdp.send("Input.synthesizeScrollGesture", { x: 300, y: 500, xDistance: -240, yDistance: 0, gestureSourceType: "touch", speed: 1600, preventFling: false });
      });
    }
    await crossing("Page Down from the footer", geo.footerAt, async () => {
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("PageDown");
        await page.waitForTimeout(120);
      }
    });
    await crossing("the Next stop button from the footer", geo.footerAt, async () => {
      const next = page.locator('button[aria-label="Next stop"]');
      let clicks = 0;
      for (let i = 0; i < 4 && (await next.isVisible()); i++) {
        if (await next.click({ timeout: 2000 }).then(() => true, () => false)) clicks++;
        await page.waitForTimeout(120);
      }
      return { clicks };
    });
    check(`12 ${name}: the Next stop button was there to press from the footer`, r.cross["the Next stop button from the footer"].clicks >= 1, r.cross["the Next stop button from the footer"]);
    // d. A nav trip from #contact to Bus: past the tunnel (its pinned stretch passed in one frame), its film never
    //    moving while it's on screen; it ends with Bus at the left edge.
    const trip = await crossing(
      "a nav trip from #contact to Bus",
      geo.contactAt,
      async () => {
        if (name === "phone") {
          await page.locator('[data-site-header] button[aria-haspopup="dialog"]').click();
          await page.waitForTimeout(400);
        }
        await page.locator(`${navSel} a[href="/#bus"]`).click();
        await page.waitForTimeout(100);
      },
      span,
    );
    {
      const onScreen = trip.filter((f) => f.topL < view && f.topR > 0);
      const filmTimes = [...new Set(onScreen.map((f) => f.film))];
      const busEdge = await page.evaluate(() => Math.round(window.__t.edge("bus") * 10) / 10);
      r.tripPast = { framesWithTunnelOnScreen: onScreen.length, filmTimes, trips: [...new Set(trip.map((f) => f.trip))], busEdge };
      check(`12 ${name}: on a trip past the tunnel its film never moves while the tunnel is on screen`, onScreen.length > 0 && filmTimes.length === 1 && r.tripPast.trips.includes("past"), r.tripPast);
      check(`12 ${name}: ... and the trip ends with Bus at the left edge`, near(busEdge, 0, 1), r.tripPast);
    }

    // e. Three laps with the "Next stop" button (Page Down while the tunnel hides it): nothing builds up.
    {
      await blur(page);
      const a0 = await at(page);
      const before = await page.evaluate(() => ({ nodes: document.getElementsByTagName("*").length, history: history.length }));
      const errors = uncaught.length;
      await page.evaluate(() => window.__t.track());
      const next = page.locator('button[aria-label="Next stop"]');
      let clicks = 0;
      let keys = 0;
      for (let i = 0; i < 500; i++) {
        if ((await page.evaluate(() => window.__trackWraps)) >= 3) break;
        if ((await next.isVisible()) && (await next.click({ timeout: 2000 }).then(() => true, () => false))) clicks++;
        else {
          await page.keyboard.press("PageDown");
          keys++;
        }
        await page.waitForTimeout(100);
      }
      await settle(page, 15);
      const j = journey(await page.evaluate(() => window.__t.untrack()), L);
      await go(page, a0);
      await settle(page);
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => ({ nodes: document.getElementsByTagName("*").length, history: history.length }));
      r.laps = { clicks, keys, wraps: j.wraps, backward: j.backward, before, after, errors: uncaught.length - errors };
      check(`12 ${name}: three laps with Next stop / Page Down, only ever forward`, j.wraps === 3 && j.backward === 0 && clicks > 0 && keys > 0, r.laps);
      check(`12 ${name}: ... leave the DOM node count and history.length as they were, with no page errors`, after.nodes === before.nodes && after.history === before.history && r.laps.errors === 0, r.laps);
    }
    out[name] = r;
    await ctx.close();
  }
  results["12 the loop"] = out;
}

await browser.close();
console.log(JSON.stringify(results, null, 1));
if (uncaught.length) failures.push(...[...new Set(uncaught)].map((m) => `uncaught: ${m}`));
if (failures.length) {
  console.error(`\n${failures.length} of ${checked} check(s) failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else console.error(`\nAll ${checked} world checks passed.`);
