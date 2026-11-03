#!/usr/bin/env node
/**
 * Checks for the homepage's sideways world (src/components/world) in Chromium, GPU on.
 *
 *   npm run test:world -- [baseUrl] [--only=2,6]
 *
 * Needs a running production server (`npm run build && npx next start -p 3100`).
 * Each flow runs on a 1280x800 desktop and a 390x844 phone (touch, DPR 2) unless it says otherwise.
 * Prints a JSON report and exits 1 if a check fails or any page throws:
 *   1  the axis: sideways on the desktop and the phone (the world scrolls along x, every scene side by side
 *      in travel order, the page itself never scrolls); a column on short screens (an 844x390 phone on its side, 1280x440): the window scrolls,
 *      nothing overflows sideways; turning between the two keeps the visitor at the scene they were on
 *   2  the wheel: a stepped wheel moves the world sideways, eased (it carries on for frames after the
 *      event); small fractional (trackpad) deltas move it 1:1 as they come; Ctrl+wheel doesn't move it;
 *      a horizontal wheel moves it natively; over a panel that can still scroll vertically the panel
 *      scrolls first, then the world; with reduced motion a stepped wheel isn't eased (desktop)
 *   3  mouse drag (desktop: a phone has no mouse, flow 5 swipes): the world follows the pointer 1:1, a throw
 *      carries on; the click that ends a drag reaches nothing (the link under it isn't activated) while a
 *      plain click on that link still opens it; a drag started on text doesn't move the world
 *   4  keys: arrows step a fifth of a screen; Page Down / Space go to the next scene's start (at most a
 *      screen on), Page Up / Shift+Space back; Home / End; an arrow right after a busy moment (a 30 ms
 *      task) at either end of the world still moves it; keys in a form field, on the day/night radios
 *      and on the bus tabs are theirs (they act, the world stays)
 *   5  phone: a real touch swipe (CDP synthesizeScrollGesture, touch) moves the world, both ways
 *   6  nav: every header link (desktop) and every phone drawer link glides to its scene's START, updates
 *      the hash, marks the link aria-current="location" and moves focus into the scene; Back returns to
 *      the previous scene; the tunnel's "See the Bus" and "Skip to content" glide too, and a link still
 *      glides when it's followed right after a busy moment (a 30 ms task); a deep link
 *      (/#packages) opens at that scene; a reload without a hash comes back to the same place (sessionStorage)
 *   7  keyboard focus: Tab / Shift+Tab to an occasion card or a gallery tile only partly on screen
 *      brings all of it on screen
 *   8  every scene's panel fits without scrolling inside it (scrollHeight - clientHeight <= 1) at
 *      1280x800, 1440x900, 1920x1080, 390x844 and 375x667
 *   9  the progress line along the bottom grows with the position; the guide bus is hidden while the
 *      tunnel is on screen and shows once past it; the header's border shows once the visitor moves along
 *   10 no JavaScript: one vertical column, every scene there, every action a link to /#contact (it works)
 *   11 the booking panel: opens from the header's Book, the tunnel's "Book your ride" (after the home link
 *      to /#intro-end), Contact's Book and Schedule (the date field focused), a package's "Request
 *      pricing" (package preset) and an occasion's "Plan this ride" (occasion preset); every field saves
 *      to localStorage as it's typed, merged with what was there (an unrelated stored key survives);
 *      the preview and the text/email links carry the values; Esc, the backdrop and the close button
 *      close it, focus back on the opener; while it's open the wheel and the keys don't move the world
 */
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const URL = args.find((a) => a.startsWith("http")) ?? "http://localhost:3100/";
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

/** In-page helpers (window.__t), installed before the page's own scripts on every document. */
function helpers() {
  const w = () => document.querySelector("[data-world]");
  const sideways = () => document.documentElement.dataset.axis === "x";
  const t = {
    sideways,
    /** Where the visitor is along the world: its scrollLeft sideways, the window's scrollY in a column. */
    at: () => (sideways() ? w().scrollLeft : window.scrollY),
    max: () => (sideways() ? w().scrollWidth - w().clientWidth : document.documentElement.scrollHeight - innerHeight),
    width: () => w().clientWidth,
    /** Where an element starts along the world (px). */
    start: (id) => document.getElementById(id).getBoundingClientRect().left - w().getBoundingClientRect().left + w().scrollLeft,
    /** An element's left edge against the world's left edge (0: the world is lined up on it). */
    edge: (id) => document.getElementById(id).getBoundingClientRect().left - w().getBoundingClientRect().left,
    go: (left) => w().scrollTo({ left, behavior: "instant" }),
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
    /** Resolves with the position once it hasn't changed for `frames` frames (eased moves, glides, native smooth scrolls). */
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
      const xs = x === undefined ? [innerWidth / 2, innerWidth * 0.3, innerWidth * 0.7] : [x];
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
const go = async (page, left) => {
  await page.evaluate((x) => window.__t.go(x), left);
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
    await page.evaluate(() => window.__t.recordWheel());
    const deltas = [3.2, 5.7, 8.4, 6.1, 4.9, 7.3, 2.6, 9.8, 5.5, 6.7];
    before = await at(page);
    for (const d of deltas) await page.mouse.wheel(0, d);
    const evs = await page.evaluate(() => window.__wheels);
    const final2 = await settle(page);
    const received = evs.map((e) => +e.dy.toFixed(2));
    const steps = evs.map((e, i) => +(e.at - (i ? evs[i - 1].at : before)).toFixed(2));
    const sum = received.reduce((a, b) => a + b, 0);
    r.trackpad = { received, steps, moved: +(final2 - before).toFixed(2), sum: +sum.toFixed(2), afterLastEvent: +(final2 - evs.at(-1).at).toFixed(2) };
    // Each step within a pixel of its delta (the position snaps to device pixels), the total within that rounding, nothing after.
    check(
      `2 ${name}: trackpad deltas move the world 1:1 as they come`,
      evs.length === deltas.length && evs.every((e) => e.taken && !Number.isInteger(e.dy)) && steps.every((s, i) => near(s, received[i], 1)) && near(final2 - before, sum, deltas.length * 0.5 + 0.5) && near(final2, evs.at(-1).at, 0.5),
      r.trackpad,
    );

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

    // d. A horizontal wheel: the browser's own scroll moves the world (not taken by the handler).
    await page.evaluate(() => window.__t.recordWheel());
    before = await at(page);
    await page.mouse.wheel(120, 0);
    await page.waitForTimeout(150);
    const final4 = await settle(page);
    const hev = (await page.evaluate(() => window.__wheels))[0];
    r.horizontal = { received: hev?.dx, taken: hev?.taken, moved: final4 - before };
    // (The browser scrolls by the physical delta: 120px even where the page is told 60.)
    check(`2 ${name}: a horizontal wheel moves the world natively`, hev && !hev.taken && final4 - before >= hev.dx - 2 && final4 - before <= 122, r.horizontal);

    // e. Over a panel that can still scroll vertically (a test-only tall block inside the Features panel): the
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
  // f. Reduced motion: a stepped wheel moves the world at once (no easing).
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
    await ctx.close();
  }
  results["2 wheel"] = out;
}

// 3. Mouse drag (desktop).
if (want(3)) {
  const { ctx, page } = await open(desktop, { url: `${URL}#features` });
  const out = {};
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

  // c. A drag that ends over an occasion card ("Plan this ride", a booking link): its click reaches nothing
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
  const afterDrag = await page.evaluate(() => ({ clicks: window.__clicks.length, dialog: !!document.querySelector("dialog[open]"), hash: location.hash }));
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
  out.overLink = { start, overCard, moved, afterDrag, afterClick };
  check("3 the click ending a drag over a link reaches nothing and opens nothing", start && overCard && near(moved, 300, 2) && afterDrag.clicks === 0 && !afterDrag.dialog && afterDrag.hash === "#features", out.overLink);
  check("3 a plain click on that link still opens it", afterClick.clicks === 1 && afterClick.dialog, out.overLink);

  // d. A drag started on text (selecting it) doesn't move the world.
  await goScene(page, "features");
  const h2 = await page.locator("#features h2").boundingBox();
  before = await at(page);
  const midD = await drag({ x: h2.x + 20, y: h2.y + h2.height / 2 }, -200, 0);
  out.fromText = { midDragging: midD, moved: (await settle(page)) - before };
  check("3 a drag from text doesn't move the world", !midD && near(out.fromText.moved, 0, 0.5), out.fromText);
  results["3 mouse drag (desktop)"] = out;
  await ctx.close();
}

// 4. Keys.
if (want(4)) {
  const out = {};
  for (const [name, opts] of Object.entries(sizes)) {
    const { ctx, page } = await open(opts, { url: `${URL}#features` });
    const w = await page.evaluate(() => window.__t.width());
    const max = await page.evaluate(() => window.__t.max());
    const starts = await page.evaluate(() => window.__t.starts());
    const S = (id) => starts.find((s) => s.id === id);
    /** The world's own rule, independently: the next scene start more than 8px away, at most a screen. */
    const nextStop = (from, dir) => {
      if (dir > 0) return Math.min(starts.map((s) => s.start).find((s) => s > from + 8) ?? max, from + w);
      return Math.max([...starts].reverse().map((s) => s.start).find((s) => s < from - 8) ?? 0, from - w);
    };
    const press = async (key, from) => {
      await go(page, from);
      await blur(page);
      const was = await at(page);
      await page.keyboard.press(key);
      return { key, from: Math.round(was), to: Math.round(await settle(page)) };
    };
    const r = { width: w, steps: [] };
    const expect = (label, res, want, tol = 1.5) => {
      r.steps.push({ ...res, want: Math.round(want) });
      check(`4 ${name}: ${label}`, near(res.to, want, tol), { ...res, want });
    };
    const f = S("features").start;
    expect("ArrowRight steps a fifth of a screen on", await press("ArrowRight", f), f + 0.2 * w);
    expect("ArrowDown steps a fifth of a screen on", await press("ArrowDown", f), f + 0.2 * w);
    expect("ArrowLeft steps a fifth of a screen back", await press("ArrowLeft", f), f - 0.2 * w);
    expect("ArrowUp steps a fifth of a screen back", await press("ArrowUp", f), f - 0.2 * w);
    // Page Down short of a scene start lands on it; from the start of a long scene, a screen on.
    const p1 = S("day-night").start - 0.4 * w;
    const p2 = S("events").start;
    const p3 = S("packages").start + 0.3 * w;
    const p4 = S("events").start + 2 * w;
    check(`4 ${name}: the key cases are what they say`, nextStop(p1, 1) === S("day-night").start && nextStop(p2, 1) === p2 + w && nextStop(p3, -1) === S("packages").start && nextStop(p4, -1) === p4 - w && S("events").width > 2.5 * w, { p1, p2, p3, p4, events: S("events") });
    expect("PageDown goes to the next scene's start", await press("PageDown", p1), nextStop(p1, 1));
    expect("PageDown in a long scene goes a screen on", await press("PageDown", p2), nextStop(p2, 1));
    expect("PageUp goes back to the scene's start", await press("PageUp", p3), nextStop(p3, -1));
    expect("PageUp in a long scene goes a screen back", await press("PageUp", p4), nextStop(p4, -1));
    expect("Space goes to the next scene's start", await press("Space", p1), nextStop(p1, 1));
    expect("Shift+Space goes back to the scene's start", await press("Shift+Space", p3), nextStop(p3, -1));
    expect("Home goes to the start", await press("Home", p4), 0);
    // (Against the end as it is then: panels still gliding in, off screen, can stretch the world by a few px at first.)
    const end = await press("End", f);
    expect("End goes to the end", end, await page.evaluate(() => window.__t.max()));
    // The same keys right after a busy moment (a 30 ms task), at either end of the world.
    const busyKey = async (key, from) => {
      await go(page, from);
      await blur(page);
      const was = await at(page);
      await page.evaluate((k) => window.__t.afterBusyTask(k), key);
      await page.waitForTimeout(50);
      return { key: `${key} after a busy task`, from: Math.round(was), to: Math.round(await settle(page)) };
    };
    const maxNow = await page.evaluate(() => window.__t.max());
    expect("ArrowRight at the start, after a busy task, still steps on", await busyKey("ArrowRight", 0), 0.2 * w);
    expect("ArrowLeft at the end, after a busy task, still steps back", await busyKey("ArrowLeft", maxNow), maxNow - 0.2 * w);

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
  results["4 keys"] = out;
}

// 5. Phone: a real touch swipe moves the world (the browser's own scrolling), both ways.
if (want(5)) {
  const { ctx, page } = await open(phone, { url: `${URL}#features` });
  const cdp = await ctx.newCDPSession(page);
  const swipe = async (xDistance) => {
    const before = await at(page);
    await cdp.send("Input.synthesizeScrollGesture", { x: 195, y: 420, xDistance, yDistance: 0, gestureSourceType: "touch", speed: 800, preventFling: true });
    return Math.round((await settle(page)) - before);
  };
  await goScene(page, "events");
  const left = await swipe(-300); // the finger moves left: on along the world
  const right = await swipe(300);
  results["5 touch swipe (phone)"] = { onward: left, back: right };
  check("5 a touch swipe moves the world on", left >= 250 && left <= 330, { left });
  check("5 a touch swipe back moves it back", right <= -250 && right >= -330, { right });
  await ctx.close();
}

// 6. Nav: the links glide to their scene's start, the hash, aria-current, focus; Back; deep link; reload.
if (want(6)) {
  const out = {};
  /** After following a link to #id: where the scene is, the hash, which links say "you are here", where focus is. */
  const arrived = (page, id, navSel) =>
    page.evaluate(
      ([id, navSel]) => {
        const scene = document.getElementById(id).closest("[data-scene]");
        return {
          edge: Math.round(window.__t.edge(id)),
          hash: location.hash,
          current: [...document.querySelectorAll(`${navSel} a[aria-current="location"]`)].map((a) => a.getAttribute("href")),
          focusInScene: scene.contains(document.activeElement),
          menuOpen: !!document.querySelector("[data-site-header] dialog[open]"),
        };
      },
      [id, navSel],
    );
  const verify = (label, id, a) =>
    check(label, near(a.edge, 0, 3) && a.hash === `#${id}` && a.current.length === 1 && a.current[0] === `/#${id}` && a.focusInScene && !a.menuOpen, a);

  for (const [name, opts] of Object.entries(sizes)) {
    const { ctx, page } = await open(opts);
    const r = { links: {} };
    const navSel = name === "desktop" ? 'nav[aria-label="Main"]' : 'nav[aria-label="Mobile"]';
    const hrefs = await page.locator(`${navSel} a`).evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    check(`6 ${name}: the nav has every scene's link`, hrefs.length === 8, hrefs);
    for (const href of hrefs) {
      const id = href.split("#")[1];
      if (name === "phone") {
        await page.locator('[data-site-header] button[aria-haspopup="dialog"]').click();
        await page.waitForTimeout(400);
      }
      await page.locator(`${navSel} a[href="${href}"]`).click();
      await page.waitForTimeout(100);
      await settle(page);
      await page.waitForTimeout(200);
      const a = await arrived(page, id, navSel);
      r.links[href] = a;
      verify(`6 ${name}: ${href} glides to the scene's start (hash, aria-current, focus)`, id, a);
    }
    // Back: the previous scene, then the one before.
    const back = [];
    for (const id of ["about", "events"]) {
      await page.evaluate(() => history.back());
      await page.waitForTimeout(150);
      await settle(page);
      await page.waitForTimeout(200);
      const a = await arrived(page, id, navSel);
      back.push(a);
      check(`6 ${name}: Back returns to #${id}`, near(a.edge, 0, 3) && a.hash === `#${id}` && a.current[0] === `/#${id}`, a);
    }
    r.back = back;
    // The other in-page links: the tunnel's "See the Bus" (after the home link brings the branding in), and
    // "Skip to content" (to #main, the first scene, from the far end of the world), by keyboard.
    await page.locator('[data-site-header] a[aria-label$="home"]').click();
    await page.waitForTimeout(100);
    await settle(page);
    const ctas = await page
      .waitForFunction(() => {
        const c = getComputedStyle(document.querySelector("[data-bus-ctas]"));
        return c.visibility === "visible" && +c.opacity > 0.99;
      }, null, { timeout: 15000 })
      .then(() => true, () => false);
    const home = { ...(await arrived(page, "intro-end", navSel)), ctas };
    await page.locator("[data-bus-ctas] a", { hasText: "See the Bus" }).click();
    await page.waitForTimeout(100);
    await settle(page);
    await page.waitForTimeout(200);
    r.seeTheBus = { home, arrived: await arrived(page, "bus", navSel) };
    check(`6 ${name}: the home link brings the tunnel's branding in`, near(home.edge, 0, 3) && home.hash === "#intro-end" && home.ctas, home);
    verify(`6 ${name}: the tunnel's "See the Bus" glides to #bus`, "bus", r.seeTheBus.arrived);
    await go(page, await page.evaluate(() => window.__t.max()));
    await page.locator('a[href="#main"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
    await settle(page);
    r.skipToContent = await page.evaluate(() => ({ edge: Math.round(window.__t.edge("main")), hash: location.hash, focus: document.activeElement?.id ?? null }));
    check(`6 ${name}: "Skip to content" glides to the first scene and focuses it`, near(r.skipToContent.edge, 0, 3) && r.skipToContent.hash === "#main" && r.skipToContent.focus === "main", r.skipToContent);
    // A link followed right after a busy moment (a 30 ms task), from the very start of the world, still glides.
    await go(page, 0);
    await page.evaluate(() => window.__t.afterBusyTask("home"));
    await page.waitForTimeout(50);
    await settle(page);
    r.afterBusyTask = { edge: Math.round(await page.evaluate(() => window.__t.edge("intro-end"))), hash: await page.evaluate(() => location.hash) };
    check(`6 ${name}: a link from the start, right after a busy task, still glides`, near(r.afterBusyTask.edge, 0, 3) && r.afterBusyTask.hash === "#intro-end", r.afterBusyTask);
    await ctx.close();

    // A deep link opens at its scene (not held for the film).
    {
      const { ctx, page } = await open(opts, { url: `${URL}#packages` });
      const a = await arrived(page, "packages", navSel);
      a.held = await page.evaluate(() => document.documentElement.hasAttribute("data-scroll-lock"));
      r.deepLink = a;
      check(`6 ${name}: a deep link to #packages opens at its start`, near(a.edge, 0, 3) && a.hash === "#packages" && a.current[0] === "/#packages" && !a.held, a);
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
        window.__t.go(window.__t.at() + b.left - (innerWidth - 60));
      }, [sel, i]);
      await page.waitForTimeout(150);
      const partlyRight = await rect(i);
      await page.keyboard.press("Tab");
      await settle(page);
      const right = { before: partlyRight, active: await isActive(i), after: await rect(i) };
      // Shift+Tab back to item i - 1, with only its last 60px on screen at the left.
      await page.evaluate(([sel, i]) => {
        const b = document.querySelectorAll(sel)[i - 1].getBoundingClientRect();
        window.__t.go(window.__t.at() + b.right - 60);
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

// 9. The progress line and the guide bus.
if (want(9)) {
  const out = {};
  for (const [name, opts] of Object.entries(sizes)) {
    const { ctx, page } = await open(opts);
    const { max, w, top, bus } = await page.evaluate(() => ({
      max: window.__t.max(),
      w: window.__t.width(),
      top: document.getElementById("top").offsetWidth,
      bus: window.__t.start("bus"),
    }));
    const samples = [];
    for (const [where, x] of [
      ["start", 0],
      ["mid-tunnel", (top - w) / 2],
      ["#bus", bus],
      ["half-way", max / 2],
      ["the end", max],
    ]) {
      await go(page, x);
      await page.waitForTimeout(400); // (the header's border fades in over 300 ms)
      samples.push({
        where,
        ...(await page.evaluate(() => {
          const bar = document.querySelector("[data-guide-bus] + div > div");
          const g = getComputedStyle(document.querySelector("[data-guide-bus]"));
          return {
            share: +(window.__t.at() / window.__t.max()).toFixed(3),
            headerBorder: getComputedStyle(document.querySelector("[data-site-header]")).borderBottomColor,
            line: +(bar.getBoundingClientRect().width / bar.parentElement.getBoundingClientRect().width).toFixed(3),
            busShown: g.visibility === "visible" && +g.opacity > 0.99,
            busHidden: g.visibility === "hidden" && +g.opacity === 0,
          };
        })),
      });
    }
    out[name] = samples;
    check(`9 ${name}: the progress line shows the position`, samples.every((s) => near(s.line, s.share, 0.01)) && samples.every((s, i) => i === 0 || s.line > samples[i - 1].line) && samples[0].line === 0 && samples.at(-1).line === 1, samples);
    check(`9 ${name}: the guide bus waits while the tunnel is on screen`, samples[0].busHidden && samples[1].busHidden, samples.slice(0, 2));
    check(`9 ${name}: the guide bus shows once past the tunnel`, samples.slice(2).every((s) => s.busShown), samples.slice(2));
    // The header's border: none at the very start, there once the visitor has moved along (the world's own scroll).
    await go(page, 0);
    await page.waitForTimeout(400);
    const borderBack = await page.evaluate(() => getComputedStyle(document.querySelector("[data-site-header]")).borderBottomColor);
    const clear = (c) => /rgba\(0, 0, 0, 0\)|transparent/.test(c);
    check(`9 ${name}: the header's border shows once moved along, and goes at the start`, clear(samples[0].headerBorder) && samples.slice(1).every((s) => !clear(s.headerBorder)) && clear(borderBack), { samples: samples.map((s) => s.headerBorder), borderBack });
    await ctx.close();
  }
  results["9 progress line and guide bus"] = out;
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

await browser.close();
console.log(JSON.stringify(results, null, 1));
if (uncaught.length) failures.push(...[...new Set(uncaught)].map((m) => `uncaught: ${m}`));
if (failures.length) {
  console.error(`\n${failures.length} of ${checked} check(s) failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else console.error(`\nAll ${checked} world checks passed.`);
