#!/usr/bin/env node
/**
 * Behaviour checks for the tunnel scene: the scroll-driven film that opens the homepage's world
 * (src/components/intro, src/components/world), in headless Chromium.
 *
 *   npm run test:intro -- [baseUrl]
 *
 * Needs a running production server (`npm run build && npx next start -p 3100`)
 * and Playwright's Chromium (`npx playwright-core install --only-shell chromium`).
 * Playwright's Chromium plays the H.264 files; flow 13 forces the VP9 fallback.
 *
 * The world runs SIDEWAYS (html[data-axis="x"]: [data-world] scrolls along x, the page itself never
 * scrolls) wherever the screen is at least 30rem tall; the tunnel scene (section#top) is its first
 * stretch: its stage stays pinned (sticky) while the scene's range (5 screens of min(100vw, 100svh); 2
 * for the stills) scrubs the film, then the stage slides out and the world carries on (#bus...). On
 * shorter screens, and without JS, the world is a column and the scene scrubs down the page. "Progress"
 * below is the place along that range (0 the start, 1 the branded end). The expected film times come
 * from the film's beats (src/content/intro-video.ts) through the story's stretches
 * (src/components/intro/intro-config.ts), laid out as the engine does (intro-engine.ts: storyFor).
 *
 * Flows (sideways on a 1280x800 desktop unless said):
 *   1  first visit: the world held at the start until the film is in memory (a mouse wheel down and
 *      sideways, Space, Page Down, the arrow, End, a mouse drag all stay put); then a stepped mouse
 *      wheel turns sideways and scrubs it, so do a trackpad's vertical and sideways swipes and a mouse
 *      drag; the end (bus at rest, branding, CTAs), back to the middle, back to the start
 *   2  the stage stays pinned through the scene's range, then slides out with the world, #bus behind it
 *   3  reduced motion: the stills on a 2-screen scene, the film never downloaded, the same ending
 *   4  "Skip to content" (keyboard, at the start): the world goes to the first scene after the tunnel,
 *      focus with it, the tunnel parked at its end
 *   5  a slower connection (~8 Mbps) still gets the film; leaving the start while it loads (the
 *      header's "Bus") lets go of the hold, and the film taking over later doesn't move the visitor
 *   6  deep links: /#packages and every nav link land on their scene's start, no loader, no hold, the
 *      header visible, the tunnel parked at its end
 *   7  reload mid-scene: back at the same place (not held), the film on the same frame
 *   8  no JavaScript: a column, the tunnel is its finished hero (one screen: the bus at rest, SMOKEY'S,
 *      the CTAs), every scene below it in order, "Book your ride" a plain link to the Contact scene
 *   9  keyboard: no Tab stop in the hidden CTAs; the world's keys along the scene (arrows, Space,
 *      Shift+Space, Page Down/Up, End, Home), the film following; at the end, Tab after the headline
 *      reaches "Book your ride", Enter opens the booking panel, Esc closes it, focus back, world put
 *   10 phone (390x844, sideways): the lighter file; a touch swipe moves the world; touch flicks through
 *      the darkness never show the swap; the middle and the end; not banded; the page never scrolls
 *   11 before any of the page's JS has run (scripts held back): the boot script's loader and hold; the
 *      header's "Bus" link works natively and the boot script lets go; the engine then takes over
 *      without moving the visitor
 *   12 the film can't load: the stills tell the story on the shorter scene
 *   13 VP9 only: the .webm is fetched and scrubs
 *   14 Home (the header's logo) while the film loads, then it fails: the scene's end shows the finished
 *      hero meanwhile, and the visitor stays at the end when the scene shortens for the stills
 *   15 2G: the stills at once, no film downloaded, the story ends on the bus
 *   16 a connection too slow for the film (400 kbps): the stills within seconds, the download cancelled
 *   17 a connection that slows down after the early check: still the film
 *   A  phone rotation (390x844 sideways ↔ 844x390 a column): mid-scene and past it, the visitor keeps
 *      their place and the film its frame across the switch (no replay, no hold), the column scrubs,
 *      and back
 *   B  desktop resize at the branding: smaller (still sideways), short (a column: 1280x460) and back:
 *      the film at rest and the branding kept, the place kept across the switch
 *   C  fast scrolling from the start, a stepped wheel and a trackpad: the film only moves forward, the
 *      world ends where the input took it, the film at rest
 *   D  autoplay blocked: the film still follows (it's only ever seeked)
 *   E  32:9: the portrait film is a feathered band, never cropped below its minVisible
 *   F  the header's Home link from /#faq: back to the scene's end, the film parked at rest all the way
 *   G  the film's files are named after their content, immutable, and a second visit takes them from cache
 *   T1 the darkness guarantee: a dense sweep of the scene's range (200 steps each way), the world parked
 *      at every pixel across the swap's point, and fast jumps across the darkness, the film and the black
 *      recorded at every step, every frame and every frame shown: the film never shows a time between
 *      the dark and lights beats (± a frame), and from the lights beat until the black starts lifting
 *      from its glimpse level it is at least that dark: no swap frame is ever seen
 *   T2 not an intro: the header visible (on top) from the very start, nothing says "Skip intro", #bus
 *      begins where the tunnel scene ends, and a wheel from the branded end carries straight on into
 *      #bus (no jump, no step back, the stage slides out with the world, the film stays at rest)
 *   T3 the branding appears IN the scene (not before the bus is out, all in by the end of its range);
 *      "Book your ride" opens the booking panel over the world (labelled, focus inside, Esc closes,
 *      focus back, the world put); "See the Bus" glides to #bus, and Back returns to the scene's end
 *   V  the column (844x390, a phone on its side), first visit: held until the film is in memory, then
 *      the whole story down the page and back, the darkness guarantee, #bus right below the scene
 * Exits with 1 if any page throws an uncaught error, logs an [intro] error, ends a flow with the scene
 * failed (data-intro-failed), or fails a check; read the rest of the report for anything unexpected.
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "playwright-core";
import { INTRO } from "../../src/components/intro/intro-config.ts";
import { introFilm } from "../../src/content/intro-video.ts";
import { nav } from "../../src/content/site.ts";

const URL = process.argv.slice(2).find((a) => a.startsWith("http")) ?? "http://localhost:3100/";
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
/** A phone on its side: too short for side-by-side scenes, so the world is a column (world-axis.ts: SHORT_SCREEN). */
const landscape = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const desktop = { viewport: { width: 1280, height: 800 } };
const FILM = /\/video\/intro\/.*\.(mp4|webm)$/;
const manifest = JSON.parse(readFileSync(path.join(import.meta.dirname, "../../src/content/intro-video.generated.json"), "utf8"));
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"] });
const results = {};
/** Uncaught page errors from every flow: any one fails the run. */
const uncaught = [];
/** Failed checks: any one fails the run. */
const failures = [];
let checked = 0;
const check = (name, ok, detail) => {
  checked++;
  if (!ok) failures.push(`${name}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  return ok;
};
const near = (a, b, tol = 1) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= tol;

/**
 * The story as the engine lays it out (intro-engine.ts: storyFor), as scroll progress (0-1) and film
 * seconds: the film follows a line through its beats, with a step from `dark` to `lights` half-way
 * through the complete black.
 */
function story(cut = "portrait") {
  const b = introFilm.cuts[cut].beats;
  const T = INTRO.timeline;
  const D = INTRO.darkness;
  const tunnel = T.run, dark = tunnel + T.enter, swap = dark + T.black / 2, lights = dark + T.black;
  const emerge = lights + T.lights, rest = emerge + T.out, brand = rest + T.brandAfterRest, ctas = brand + T.ctaAfterBrand;
  const end = ctas + T.ctaLength + T.travel;
  const line = [[0, 0], [tunnel, b.tunnel], [dark, b.dark], [swap, b.dark], [swap + 0.001, b.lights], [lights, b.lights], [emerge, b.lights + (b.rest - b.lights) * T.lightsShare], [rest, b.rest]];
  const map = (x) => {
    if (x <= 0) return 0;
    for (let i = 1; i < line.length; i++) {
      const [x0, y0] = line[i - 1], [x1, y1] = line[i];
      if (x <= x1) return x1 === x0 ? y1 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
    return b.rest;
  };
  const glimpse = lights + (emerge - lights) * D.glimpseAt;
  const fps = manifest[cut]?.fps ?? 30;
  const p = (u) => +(u / end).toFixed(4);
  return {
    cut, fps, frame: 1 / fps, beats: b, glimpse: D.glimpse, glimpseFilm: map(glimpse), filmAt: (progress) => map(progress * end),
    p: { tunnel: p(tunnel), dark: p(dark), swap: p(swap), lights: p(lights), glimpse: p(glimpse), emerge: p(emerge), rest: p(rest), brand: p(brand), ctas: p(ctas) },
  };
}
const cutOf = (files) => (files.some((f) => f.startsWith("film-wide")) ? "wide" : "portrait");
/** The film shows `expected` (seconds), give or take `frames` frames (the engine seeks to within half a frame). */
const filmNear = (t, expected, S, frames = 1) => near(t, expected, frames * S.frame + 0.005);
/**
 * Samples [film seconds, black opacity] that break the darkness guarantee: `inside`, a film time
 * strictly inside the jump the darkness hides (more than a frame past `dark`, more than a frame before
 * `lights`: frames of the swap itself, whatever the black); `early`, a frame from the `lights` beat
 * on, before the black starts lifting from its glimpse level, seen through less than that black
 * (0.01 for rounding and a frame of seek lag).
 */
function swapSeen(samples, S) {
  const f = S.frame, { dark, lights } = S.beats;
  return {
    inside: samples.filter(([t]) => t > dark + f && t < lights - f),
    early: samples.filter(([t, black]) => t >= lights - f && t <= S.glimpseFilm - f && black < S.glimpse - 0.01),
  };
}
const seenCount = (seen) => seen.inside.length + seen.early.length;
/** The samples went through the darkness: the film at the dark beat under complete black, and the first frames after the swap. */
function throughDark(samples, S) {
  const f = S.frame, { dark, lights } = S.beats;
  return { atDark: samples.some(([t, black]) => near(t, dark, f) && black >= 0.99), afterSwap: samples.some(([t]) => t >= lights - f && t <= S.glimpseFilm - f) };
}

async function context(opts) {
  const ctx = await browser.newContext(opts);
  ctx.on("page", (p) => {
    p.on("pageerror", (e) => uncaught.push(e.message));
    p.on("console", (m) => m.type() === "error" && m.text().includes("[intro]") && uncaught.push(m.text()));
  });
  return ctx;
}
const state = (page) =>
  page.evaluate(() => {
    const h = document.documentElement;
    const x = h.dataset.axis === "x";
    const w = document.querySelector("[data-world]");
    const s = document.querySelector("#top");
    const v = document.querySelector("[data-film]");
    const op = (sel) => { const e = document.querySelector(sel); return e ? +(+getComputedStyle(e).opacity).toFixed(2) : null; };
    const svh = document.querySelector("[data-frame]")?.offsetHeight || innerHeight;
    const start = x ? s.getBoundingClientRect().left - w.getBoundingClientRect().left + w.scrollLeft : s.getBoundingClientRect().top + scrollY;
    const range = x ? s.offsetWidth - w.clientWidth : s.offsetHeight - innerHeight;
    const at = x ? w.scrollLeft : scrollY;
    const stage = document.querySelector(".intro-stage").getBoundingClientRect();
    const hdr = document.querySelector("[data-site-header]");
    const hs = getComputedStyle(hdr);
    const hr = hdr.getBoundingClientRect();
    const ctas = document.querySelector("[data-bus-ctas]");
    return {
      axis: h.dataset.axis ?? "(none)", at: Math.round(at), progress: range > 0 ? +((at - start) / range).toFixed(4) : null,
      screens: +(range / (x ? Math.min(w.clientWidth, svh) : svh)).toFixed(2),
      loading: h.getAttribute("data-intro-loading"), pending: h.hasAttribute("data-intro-pending"), lock: h.hasAttribute("data-scroll-lock"),
      final: h.hasAttribute("data-intro-final"), still: h.hasAttribute("data-intro-still"), stage: h.dataset.introStage ?? "(none)",
      failed: h.hasAttribute("data-intro-failed"),
      film: v.hasAttribute("data-ready") ? (v.currentSrc.startsWith("blob:") ? "blob" : "network") : "-",
      filmT: +v.currentTime.toFixed(3), filmVisible: getComputedStyle(v).visibility === "visible" && getComputedStyle(v).display !== "none", playing: !v.paused,
      dark: op('[data-fx="dark"]'), still0: op('[data-still="start"]'), stillRest: op('[data-still="rest"]'),
      h1: op("#intro-title"), ctas: op("[data-bus-ctas]"), ctasVis: getComputedStyle(ctas).visibility,
      hint: op('[data-intro-hint="scroll"]'), banded: document.querySelector("[data-film-box]").dataset.banded ?? "-",
      focus: document.activeElement === document.body ? "BODY" : document.activeElement?.id || document.activeElement?.textContent?.trim().slice(0, 20),
      /** The stage's edge along the world (0 = pinned in place). */
      stageAt: Math.round(x ? stage.left : stage.top),
      header: hs.visibility === "visible" && hs.display !== "none" && +hs.opacity > 0.99 && hr.top >= 0 && hr.bottom > 0,
      overflowX: document.documentElement.scrollWidth - innerWidth, overflowY: x ? document.documentElement.scrollHeight - innerHeight : null,
    };
  });
/** Put the world at `p` of the tunnel scene's range (either layout), at once. */
const to = (page, p) =>
  page.evaluate((p) => {
    const x = document.documentElement.dataset.axis === "x";
    const w = document.querySelector("[data-world]");
    const s = document.querySelector("#top");
    if (x) w.scrollTo({ left: s.getBoundingClientRect().left - w.getBoundingClientRect().left + w.scrollLeft + p * (s.offsetWidth - w.clientWidth), behavior: "instant" });
    else window.scrollTo({ top: s.getBoundingClientRect().top + scrollY + p * (s.offsetHeight - innerHeight), behavior: "instant" });
  }, p);
/** Where an element starts along the world (either layout), px. */
const startOf = (page, sel) =>
  page.evaluate((sel) => {
    const x = document.documentElement.dataset.axis === "x";
    const w = document.querySelector("[data-world]");
    const r = document.querySelector(sel).getBoundingClientRect();
    return Math.round(x ? r.left - w.getBoundingClientRect().left + w.scrollLeft : r.top + scrollY);
  }, sel);
/** The scene under the middle of the screen (as the World tells the header's nav). */
const sceneInView = (page) =>
  page.evaluate(() => {
    const x = document.documentElement.dataset.axis === "x";
    const mid = x ? innerWidth / 2 : innerHeight / 2;
    return [...document.querySelectorAll("[data-scene]")].find((s) => { const r = s.getBoundingClientRect(); return x ? r.left <= mid && r.right > mid : r.top <= mid && r.bottom > mid; })?.id ?? null;
  });
/**
 * Wait until nothing moves: the world, the film (no seek under way), the black, the branding, the camera
 * and the stills unchanged for 15 frames in a row (the scrub's catch-up, an eased glide, a seek). A wait
 * that runs out is counted (the report's last line): the checks after it read a page still moving.
 */
let unsettled = 0;
const settle = async (page, ms = 15000) => {
  const still = await page.evaluate((ms) => new Promise((resolve) => {
    const v = document.querySelector("[data-film]");
    const w = document.querySelector("[data-world]");
    const els = ['[data-fx="dark"]', "#intro-title", "[data-bus-ctas]", "[data-camera]", '[data-still="rest"]', '[data-glow="rest"]'].map((s) => document.querySelector(s)).filter(Boolean);
    const t0 = performance.now();
    let last = "";
    let same = 0;
    const f = () => {
      const key = [w?.scrollLeft, scrollY, v.currentTime, v.seeking, ...els.map((e) => { const c = getComputedStyle(e); return c.opacity + c.transform + c.visibility; })].join("|");
      same = key === last ? same + 1 : 0;
      last = key;
      if (same >= 15 || performance.now() - t0 > ms) resolve(same >= 15);
      else requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }), ms);
  if (!still) unsettled++;
  return still;
};
/**
 * Record the film on every frame ([currentTime, black's opacity, world position]) and every frame the
 * video presents ([its media time, black's opacity]); returns a function that stops and returns them.
 */
async function recorder(page) {
  await page.evaluate(() => {
    const v = document.querySelector("[data-film]");
    const d = document.querySelector('[data-fx="dark"]');
    const w = document.querySelector("[data-world]");
    const r = (window.__rec = { on: true, frames: [], shown: [] });
    const black = () => +(+getComputedStyle(d).opacity).toFixed(3);
    const tick = () => {
      if (!r.on) return;
      r.frames.push([+v.currentTime.toFixed(4), black(), document.documentElement.dataset.axis === "x" ? w.scrollLeft : scrollY]);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const shown = (_, m) => {
      if (!r.on) return;
      r.shown.push([+m.mediaTime.toFixed(4), black()]);
      v.requestVideoFrameCallback(shown);
    };
    v.requestVideoFrameCallback?.(shown);
  });
  return () => page.evaluate(() => { const r = window.__rec; r.on = false; return { frames: r.frames, shown: r.shown }; });
}
const filmFiles = (page) => page.evaluate(() => performance.getEntriesByType("resource").map((r) => r.name).filter((n) => /\/video\/intro\/.*\.(mp4|webm)$/.test(n)).map((n) => n.split("/").pop()));
async function open(ctxOpts = {}, gotoOpts = {}) {
  const ctx = await context({ ...desktop, ...ctxOpts });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (ctxOpts.slowNet) {
    const c = await ctx.newCDPSession(page);
    await c.send("Network.enable");
    // ~8 Mbps: slow enough to leave the start while the film loads, fast enough that it's worth the wait (INTRO.slowNet).
    await c.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1024 * 1024, uploadThroughput: 200 * 1024 });
  }
  if (gotoOpts.before) await gotoOpts.before(ctx, page);
  await page.goto(gotoOpts.url ?? URL, { waitUntil: gotoOpts.waitUntil ?? "load" });
  return { ctx, page, errors };
}
/** The scene's engine has taken over: it says where the story is (data-intro-stage), nothing held or loading. */
const ready = (page, timeout = 90000) =>
  page.waitForFunction(() => {
    const h = document.documentElement;
    return (h.dataset.introStage || h.hasAttribute("data-intro-failed")) && !h.hasAttribute("data-intro-pending") && !h.hasAttribute("data-intro-loading");
  }, null, { timeout });
const pending = (page, timeout = 60000) => page.waitForFunction(() => document.documentElement.hasAttribute("data-intro-pending"), null, { timeout });
/** A mouse drag from (x0, y) to (x1, y), slow enough to leave no momentum (it pauses before letting go). */
async function drag(page, x0, x1, y = 420) {
  await page.mouse.move(x0, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(x0 + ((x1 - x0) * i) / 10, y); await page.waitForTimeout(110); }
  await page.waitForTimeout(200);
  await page.mouse.up();
}
/** The booking panel (ActionDrawer's <dialog>): open? its title (aria-labelledby), and where focus is. */
const panel = (page) =>
  page.evaluate(() => {
    const d = document.querySelector("dialog[open]");
    const a = document.activeElement;
    const w = document.querySelector("[data-world]");
    return {
      open: Boolean(d), title: d ? document.getElementById(d.getAttribute("aria-labelledby") ?? "")?.textContent?.trim() ?? null : null,
      focusInside: Boolean(d && a && d.contains(a)), focus: a === document.body ? "BODY" : a?.textContent?.trim().slice(0, 20) || a?.tagName,
      at: document.documentElement.dataset.axis === "x" ? w.scrollLeft : scrollY,
    };
  });
// The flows below start at a 1280x800 desktop, where the world runs sideways.
const S0 = story();

// 1. First visit: the world held at the start until the film is in memory (its download is held back here, so the
//    hold is tested while it really holds), then scrubbed by every kind of input, and back.
{ let release; const held = new Promise((r) => (release = r));
  const { ctx, page, errors } = await open({}, { before: (c) => c.route(FILM, async (r) => { await held; await r.continue(); }) });
  const atLoad = await state(page);
  await pending(page, 30000);
  // Beside the film's band, over the scene's copy layer: where a mouse drag can start.
  await page.mouse.move(400, 420);
  await page.mouse.wheel(0, 600); await page.mouse.wheel(600, 0);
  for (const key of ["Space", "PageDown", "ArrowRight", "End"]) await page.keyboard.press(key);
  await drag(page, 400, 200);
  await page.waitForTimeout(400);
  const lockedTry = await state(page);
  release(); await ready(page); await settle(page);
  const readyState = await state(page);
  // A stepped mouse wheel turns sideways: 12 notches of 200px, eased.
  await page.mouse.move(400, 420);
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 200); await page.waitForTimeout(60); }
  await settle(page); const afterWheel = await state(page);
  // A trackpad (a stream of small deltas): vertical turned sideways 1:1, then a sideways swipe (the browser's own).
  // Whole pixels: the world snaps each scroll to one (30.5 would land 31 at a time).
  await to(page, 0); await settle(page);
  for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, 30); await page.waitForTimeout(16); }
  await settle(page); const afterTrackpad = await state(page);
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(40, 0); await page.waitForTimeout(16); }
  await settle(page); const afterSwipe = await state(page);
  await drag(page, 400, 200); await settle(page); const afterDrag = await state(page);
  await to(page, 1); await settle(page); const end = await state(page);
  await to(page, 0.5); await settle(page); const backToMid = await state(page);
  await to(page, 0); await settle(page); const backToTop = await state(page);
  const S = story(cutOf(await filmFiles(page)));
  // The film was held back before its first byte: a slow start isn't a slow connection.
  check("1 the film after a slow start", readyState.film === "blob" && !readyState.still, readyState);
  check("1 the world held at the start while the film loads (wheel down and sideways, Space, Page Down, arrow, End, drag)", lockedTry.at === 0 && lockedTry.lock && lockedTry.pending && lockedTry.axis === "x", lockedTry);
  check("1 a stepped mouse wheel moves the world sideways (12 x 200px) and scrubs the film", near(afterWheel.at, 2400, 2) && filmNear(afterWheel.filmT, S.filmAt(afterWheel.progress), S), afterWheel);
  check("1 a trackpad's vertical swipe moves it 1:1, a sideways one natively", near(afterTrackpad.at, 600, 2) && near(afterSwipe.at - afterTrackpad.at, 400, 2) && filmNear(afterSwipe.filmT, S.filmAt(afterSwipe.progress), S), { afterTrackpad, afterSwipe });
  check("1 a mouse drag pulls the world along", near(afterDrag.at - afterSwipe.at, 200, 2), { before: afterSwipe.at, after: afterDrag.at });
  check("1 the end: the bus at rest, branding, CTAs", end.stage === "end" && filmNear(end.filmT, S.beats.rest, S) && end.h1 === 1 && end.ctasVis === "visible" && end.dark === 0 && !end.playing, end);
  check("1 back to the middle: the film follows backwards, the branding goes", backToMid.stage === "film" && filmNear(backToMid.filmT, S.filmAt(backToMid.progress), S) && backToMid.h1 === 0 && backToMid.ctasVis === "hidden", backToMid);
  check("1 back to the start: the first frame, the hint", backToTop.stage === "film" && backToTop.filmT <= S.frame && backToTop.dark === 0 && backToTop.hint === 1 && backToTop.ctasVis === "hidden", backToTop);
  results["1 first visit, every input, and back"] = { atLoad, lockedTry, readyState, afterWheel, afterTrackpad: afterTrackpad.at, afterSwipe: afterSwipe.at, afterDrag: afterDrag.at, end, backToMid, backToTop, errors }; await ctx.close(); }

// 2. The stage stays pinned while the scene scrubs; past its range it slides out with the world, #bus right behind it.
{ const { ctx, page, errors } = await open(); await ready(page);
  await to(page, 0.5); await settle(page); const mid = await state(page);
  await page.evaluate(() => { const w = document.querySelector("[data-world]"); const s = document.querySelector("#top"); w.scrollTo({ left: s.offsetWidth - w.clientWidth + 300, behavior: "instant" }); });
  await settle(page);
  const past = await state(page);
  const busLeft = await page.evaluate(() => Math.round(document.querySelector("#bus").getBoundingClientRect().left));
  check("2 the stage stays pinned while the scene scrubs", mid.stageAt === 0, mid);
  check("2 past the scene's range the stage slides out with the world, #bus right behind it", past.stageAt === -300 && busLeft === desktop.viewport.width - 300 && past.stage === "end", { stageAt: past.stageAt, busLeft });
  check("2 the page itself never scrolls (the world does)", past.overflowX === 0 && past.overflowY === 0 && mid.overflowX === 0, past);
  results["2 pinned, then slides out"] = { mid: { stageAt: mid.stageAt, filmT: mid.filmT }, past: { stageAt: past.stageAt, stage: past.stage }, busLeft, errors }; await ctx.close(); }

// 3. Reduced motion: stills (the film isn't downloaded), a shorter scene, the same story.
{ const { ctx, page, errors } = await open({ reducedMotion: "reduce" }); await ready(page);
  const top = await state(page);
  await to(page, 0.45); await settle(page); const mid = await state(page);
  await to(page, 1); await settle(page); const end = await state(page);
  const filmRequested = await page.evaluate(() => performance.getEntriesByType("resource").some((r) => /\/video\/intro\/.*\.(mp4|webm)$/.test(r.name)));
  check("3 reduced motion: the stills on a shorter scene, the film never downloaded", top.still && top.film === "-" && !filmRequested && top.screens === INTRO.scroll.stillScreens, { top, filmRequested });
  check("3 reduced motion: the same ending (the bus at rest, branding, CTAs)", end.stillRest === 1 && end.dark === 0 && end.h1 === 1 && end.ctasVis === "visible" && end.stage === "end", end);
  results["3 reduced motion"] = { top, mid, end, filmRequested, errors }; await ctx.close(); }

// 4. "Skip to content" (the first Tab stop) from the start: the world goes to the first scene after the tunnel
//    (#main starts with #bus), focus with it, and the tunnel is left parked at its end. ("Skip intro" is gone: T2.)
{ const { ctx, page, errors } = await open(); await ready(page); await settle(page);
  await page.keyboard.press("Tab");
  const first = await page.evaluate(() => document.activeElement?.textContent?.trim());
  await page.keyboard.press("Enter"); await settle(page);
  const st = await state(page);
  const mainStart = await startOf(page, "#main");
  const busStart = await startOf(page, "#bus");
  const hash = await page.evaluate(() => location.hash);
  check("4 Skip to content: the world goes to the first scene after the tunnel, focus with it", first === "Skip to content" && near(st.at, mainStart) && mainStart === busStart && st.focus === "main" && hash === "#main", { first, at: st.at, mainStart, busStart, focus: st.focus, hash });
  check("4 Skip to content: the tunnel parked at its end", st.stage === "end" && filmNear(st.filmT, S0.beats.rest, S0) && !st.lock, st);
  results["4 skip to content"] = { first, ...st, mainStart, hash, errors }; await ctx.close(); }

// 5. A slower connection (~8 Mbps): leaving the start while the film loads (the header's "Bus") lets go of the
//    hold; the film still arrives, and the engine taking over then doesn't move the visitor.
{ const { ctx, page, errors } = await open({ slowNet: true }, { waitUntil: "domcontentloaded" });
  await pending(page);
  const before = await state(page);
  await page.click('[data-site-header] nav a[href="/#bus"]'); await settle(page);
  const afterNav = await state(page);
  const busStart = await startOf(page, "#bus");
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-intro-pending") && document.querySelector("[data-film]").hasAttribute("data-ready"), null, { timeout: 120000 });
  await settle(page);
  const afterReady = await state(page);
  check("5 a slower connection still gets the film", afterReady.film === "blob" && !afterReady.still, afterReady);
  check("5 leaving the start while the film loads lets go of the hold", before.lock && !afterNav.lock && afterNav.loading === null && near(afterNav.at, busStart), { before, afterNav, busStart });
  check("5 the film taking over later doesn't move the visitor", near(afterReady.at, busStart) && afterReady.stage === "end" && filmNear(afterReady.filmT, S0.beats.rest, S0), { at: afterReady.at, busStart, stage: afterReady.stage, filmT: afterReady.filmT });
  results["5 leave the start while loading (slow network)"] = { before, afterNav, afterReady, busStart, errors }; await ctx.close(); }

// 6. Deep links: no loader, no hold, the header visible, the world at the linked scene's start, the tunnel behind
//    it parked at its end; every nav link (the logo's /#intro-end is the tunnel's end itself).
{ const { ctx, page, errors } = await open({}, { url: `${URL}#packages` });
  const atLoad = await state(page);
  const start = await startOf(page, "#packages");
  await ready(page); await settle(page);
  const st = await state(page);
  check("6 a deep link lands on its scene's start: no loader, no hold, the header visible", near(atLoad.at, start) && !atLoad.lock && atLoad.loading === null && atLoad.header, { atLoad, start });
  check("6 the tunnel behind it is parked at its end", st.stage === "end" && filmNear(st.filmT, S0.beats.rest, S0) && near(st.at, start), st);
  const links = {};
  for (const { href } of nav) {
    const hash = href.slice(href.indexOf("#"));
    await page.goto("about:blank");
    await page.goto(`${URL}${hash}`, { waitUntil: "load" });
    await ready(page); await settle(page);
    const s = await state(page);
    links[hash] = { at: s.at, start: await startOf(page, hash), lock: s.lock, loading: s.loading, header: s.header };
  }
  const off = Object.entries(links).filter(([, l]) => !near(l.at, l.start) || l.lock || l.loading !== null || !l.header);
  check("6 every nav link's deep link lands on its scene's start, not held", off.length === 0, Object.fromEntries(off));
  results["6 deep links"] = { atLoad, start, end: st, links, errors }; await ctx.close(); }

// 7. Reload part-way through the scene: the world comes back to the same place (not held), the film on the same frame.
{ const { ctx, page, errors } = await open(); await ready(page);
  await to(page, 0.3); await settle(page); const before = await state(page);
  await page.reload({ waitUntil: "load" }); await ready(page); await settle(page);
  const after = await state(page);
  check("7 a reload mid-scene comes back to the same place, not held", near(after.progress, before.progress, 0.003) && !after.lock && after.loading === null, { before: before.progress, after });
  check("7 a reload mid-scene: the film on the same frame", filmNear(after.filmT, before.filmT, S0), { before: before.filmT, after: after.filmT });
  results["7 reload mid-scene"] = { before: { progress: before.progress, filmT: before.filmT }, after, errors }; await ctx.close(); }

// 8. No JavaScript: the world is a column; the tunnel is its finished hero (the film's resting frame, SMOKEY'S, the
//    CTAs) on one screen, every scene below it; the booking CTA is a plain link to the Contact scene.
{ const { ctx, page, errors } = await open({ javaScriptEnabled: false }); await page.waitForTimeout(500);
  const st = await page.evaluate(() => {
    const css = (sel, p) => getComputedStyle(document.querySelector(sel))[p];
    const rest = document.querySelector('[data-still="rest"] img');
    const scenes = [...document.querySelectorAll("[data-scene]")].map((e) => { const r = e.getBoundingClientRect(); return { id: e.id, top: r.top + scrollY, bottom: r.bottom + scrollY }; });
    const book = document.querySelector("[data-bus-ctas] a[data-action]");
    return {
      axis: document.documentElement.dataset.axis ?? "(none)", sectionScreens: +(document.querySelector("#top").offsetHeight / innerHeight).toFixed(2),
      rest: css('[data-still="rest"]', "opacity"), film: css("[data-film]", "display"), h1: css("#intro-title", "opacity"), ctas: css("[data-bus-ctas]", "opacity"), ctasVis: css("[data-bus-ctas]", "visibility"),
      restLoaded: rest.complete && rest.naturalWidth, loader: css("[data-intro-loader]", "visibility"), header: css("[data-site-header]", "visibility"),
      scenes: scenes.map((s) => s.id), stacked: scenes.every((s, i) => i === 0 || s.top >= scenes[i - 1].bottom - 1),
      book: book ? { href: book.getAttribute("href"), label: book.textContent.trim() } : null,
    };
  });
  await page.locator("[data-bus-ctas] a[data-action]").click();
  // The column glides to an anchor (html: scroll-behavior smooth): wait for it to land (no page JS to wait with).
  let booked = null;
  for (let i = 0, last = null; i < 40; i++, last = booked.contactTop) {
    await page.waitForTimeout(250);
    booked = await page.evaluate(() => ({ hash: location.hash, contactTop: Math.round(document.querySelector("#contact").getBoundingClientRect().top), h: innerHeight }));
    if (booked.contactTop === last) break;
  }
  check("8 no JavaScript: a column, every scene below the tunnel in order", st.axis === "(none)" && st.stacked && st.scenes[0] === "top" && st.scenes.includes("bus") && st.scenes.at(-1) === "footer", st);
  check("8 no JavaScript: the tunnel is its finished hero on one screen", st.sectionScreens === 1 && st.rest === "1" && st.film === "none" && st.h1 === "1" && st.ctas === "1" && st.ctasVis === "visible" && st.restLoaded > 0 && st.loader === "hidden" && st.header === "visible", st);
  check("8 no JavaScript: 'Book your ride' is a plain link to the Contact scene", st.book?.label === "Book your ride" && st.book.href === "/#contact" && booked.hash === "#contact" && booked.contactTop >= 0 && booked.contactTop < booked.h / 2, { book: st.book, booked });
  results["8 no JavaScript"] = { ...st, booked, errors }; await ctx.close(); }

// 9. Keyboard: Tab never stops in the hidden CTAs (from the header it goes straight to the next scene); the world's
//    keys move along the scene with the film following; at the end the CTAs are reached and open the booking panel.
{ const { ctx, page, errors } = await open(); await ready(page); await settle(page);
  const stops = [];
  for (let i = 0; i < 24; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => { const a = document.activeElement; return { label: a?.textContent?.trim().slice(0, 20) || a?.getAttribute("aria-label") || a?.tagName, inCtas: Boolean(a?.closest("[data-bus-ctas]")), scene: a?.closest("[data-scene]")?.id ?? null }; });
    stops.push(stop);
    if (stop.scene && stop.scene !== "top") break;
  }
  check("9 no Tab stop in the hidden CTAs: from the header straight to the next scene", !stops.some((s) => s.inCtas || s.scene === "top") && stops.at(-1)?.scene === "bus", stops);
  await page.evaluate(() => document.activeElement?.blur());
  await to(page, 0); await settle(page);
  const w = desktop.viewport.width;
  // The world's end, measured once there (the panels further on, still gliding in, add a few px of overflow before).
  const max = () => page.evaluate(() => { const e = document.querySelector("[data-world]"); return e.scrollWidth - e.clientWidth; });
  // Arrows: a fifth of a screen; Space / Page Down: the next scene's start, at most a screen on (the tunnel is long).
  const keys = [["ArrowRight", w * 0.2], ["ArrowDown", w * 0.4], ["Space", w * 1.4], ["Shift+Space", w * 0.4], ["PageDown", w * 1.4], ["PageUp", w * 0.4], ["ArrowLeft", w * 0.2], ["ArrowUp", 0], ["End", max], ["Home", 0]];
  const moves = [];
  for (const [key, to_] of keys) {
    await page.keyboard.press(key); await settle(page);
    const s = await state(page);
    const want = typeof to_ === "function" ? await to_() : to_;
    moves.push({ key, want: Math.round(want), at: s.at, filmT: s.filmT, filmWant: +S0.filmAt(Math.min(1, s.progress)).toFixed(3) });
  }
  check("9 the world's keys move along the scene, the film following", moves.every((m) => near(m.at, m.want) && filmNear(m.filmT, m.filmWant, S0)), moves);
  await to(page, 1); await settle(page);
  const atEnd = (await state(page)).at;
  await page.evaluate(() => document.querySelector("#intro-title").focus()); await page.keyboard.press("Tab");
  const tabAfterHeadline = (await state(page)).focus;
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("dialog[open]")?.contains(document.activeElement), null, { timeout: 5000 }).catch(() => {});
  const opened = await panel(page);
  await page.keyboard.press("Escape"); await page.waitForTimeout(500);
  const closed = await panel(page);
  check("9 at the end, Tab after the headline reaches 'Book your ride'", tabAfterHeadline === "Book your ride", tabAfterHeadline);
  check("9 Enter opens the booking panel (focus inside), Esc closes it: focus back, the world put", opened.open && opened.title === "Book your ride" && opened.focusInside && !closed.open && closed.focus === "Book your ride" && opened.at === atEnd && closed.at === atEnd, { atEnd, opened, closed });
  results["9 keyboard"] = { stops: stops.map((s) => s.label), moves, tabAfterHeadline, opened, closed, errors }; await ctx.close(); }

// 10. Phone (sideways): the lighter file; touch moves the world (a swipe, then flicks through the darkness and back,
//     the film recorded on every frame); the film fills the screen; the branding at the end; the page never scrolls.
{ const { ctx, page, errors } = await open(phone); await ready(page); await settle(page);
  const files = await filmFiles(page);
  const S = story(cutOf(files));
  const cdp = await ctx.newCDPSession(page);
  const gesture = (dx) => cdp.send("Input.synthesizeScrollGesture", { x: 280, y: 560, xDistance: dx, yDistance: 0, gestureSourceType: "touch", speed: 2400, preventFling: true });
  const start = await state(page);
  await gesture(-300); await settle(page);
  const swiped = await state(page);
  const stop = await recorder(page);
  for (const dx of [-450, -450, 450, 450]) { await gesture(dx); await page.waitForTimeout(150); }
  await settle(page);
  const flick = await stop();
  const seen = swapSeen([...flick.frames, ...flick.shown], S);
  const through = throughDark([...flick.frames, ...flick.shown], S);
  await to(page, 0.5); await settle(page); const mid = await state(page);
  await to(page, 1); await settle(page); const end = await state(page);
  check("10 phone: the lighter film file", files.length === 1 && /-small\.[0-9a-f]{10}\.mp4$/.test(files[0]), files);
  check("10 phone: a touch swipe moves the world sideways", swiped.at - start.at >= 250 && filmNear(swiped.filmT, S.filmAt(swiped.progress), S), { start: start.at, swiped });
  check("10 phone: touch flicks through the darkness never show the swap", seenCount(seen) === 0 && through.atDark && through.afterSwap, { inside: seen.inside.slice(0, 8), early: seen.early.slice(0, 8), through, frames: flick.frames.length, shown: flick.shown.length });
  check("10 phone: the film fills the screen, the branding at the end, the page itself never scrolls", mid.banded === "-" && filmNear(mid.filmT, S.filmAt(mid.progress), S) && end.h1 === 1 && end.ctas === 1 && end.overflowX === 0 && end.overflowY === 0, { mid, end });
  results["10 phone"] = { files, swiped: swiped.at, flick: { frames: flick.frames.length, shown: flick.shown.length, through, inside: seen.inside.length, early: seen.early.length }, mid: { filmT: mid.filmT, banded: mid.banded }, end: { filmT: end.filmT, h1: end.h1, ctas: end.ctas, overflowX: end.overflowX, overflowY: end.overflowY }, errors }; await ctx.close(); }

// 11. Before any of the page's JavaScript has run (its scripts held back): the boot script alone shows the loader and
//     holds the world; the header's links work natively and the boot script lets go; then the engine takes over
//     without moving the visitor.
{ const ctx = await context(desktop);
  let release; const held = new Promise((r) => (release = r));
  await ctx.route((u) => u.pathname.startsWith("/_next/static/chunks/") && u.pathname.endsWith(".js"), async (route) => { await held; await route.continue(); });
  const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  const boot = () => page.evaluate(() => {
    const h = document.documentElement;
    const b = document.querySelector("#bus").getBoundingClientRect();
    return { axis: h.dataset.axis ?? "(none)", loading: h.getAttribute("data-intro-loading"), lock: h.hasAttribute("data-scroll-lock"), at: document.querySelector("[data-world]").scrollLeft, hash: location.hash, busOnScreen: b.left < innerWidth && b.right > 0 };
  });
  const before = await boot();
  await page.mouse.move(400, 420); await page.mouse.wheel(600, 0); await page.mouse.wheel(0, 600); await page.waitForTimeout(400);
  const heldTry = await boot();
  await page.click('[data-site-header] nav a[href="/#bus"]'); await page.waitForTimeout(600);
  const afterJump = await boot();
  release(); await page.waitForLoadState("load");
  const tookOver = await ready(page, 60000).then(() => true, () => false);
  await settle(page);
  const afterJs = await state(page);
  const busStart = await startOf(page, "#bus");
  check("11 before any JS: the boot script's loader and hold", before.axis === "x" && before.loading === "" && before.lock && heldTry.at === 0, { before, heldTry });
  check("11 before any JS: the header's links work natively, and the boot script lets go", afterJump.hash === "#bus" && afterJump.busOnScreen && !afterJump.lock && afterJump.loading === null, afterJump);
  check("11 the engine takes over without moving the visitor", tookOver && near(afterJs.at, busStart) && afterJs.stage === "end" && filmNear(afterJs.filmT, S0.beats.rest, S0), { tookOver, afterJs, busStart, jumpedTo: afterJump.at });
  results["11 before JavaScript"] = { before, heldTry, afterJump, tookOver, afterJs, errors }; await ctx.close(); }

// 12. The film can't load (its files fail): the stills tell the story on the shorter scene.
{ const { ctx, page, errors } = await open({}, { before: (c) => c.route(FILM, (r) => r.abort()) }); await ready(page);
  const top = await state(page);
  await to(page, 1); await settle(page);
  const end = await state(page);
  check("12 the film can't load: the stills on the shorter scene, the same ending", top.still && !top.failed && top.film === "-" && top.screens === INTRO.scroll.stillScreens && end.h1 === 1 && end.ctasVis === "visible" && end.stillRest === 1 && end.stage === "end", { top, end });
  results["12 film fails to load"] = { top, end, errors }; await ctx.close(); }

// 13. A browser that can't play the H.264 files: the VP9 version is the one fetched, and it scrubs.
{ const { ctx, page, errors } = await open({}, { before: (c, p) => p.addInitScript(() => {
    const orig = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function (type) { return type.startsWith("video/mp4") ? "" : orig.call(this, type); };
  }) });
  await ready(page);
  const files = await filmFiles(page);
  const S = story(cutOf(files));
  await to(page, 0.5); await settle(page); const mid = await state(page);
  await to(page, 1); await settle(page); const end = await state(page);
  check("13 VP9 only: the .webm is fetched and scrubs", files.length > 0 && files.every((f) => f.endsWith(".webm")) && mid.film === "blob" && filmNear(mid.filmT, S.filmAt(mid.progress), S) && filmNear(end.filmT, S.beats.rest, S) && end.h1 === 1, { files, mid, end });
  results["13 VP9 fallback"] = { files, mid: { film: mid.film, filmT: mid.filmT }, end: { filmT: end.filmT, h1: end.h1 }, errors }; await ctx.close(); }

// 14. Home (the header's logo: /#intro-end, the scene's end) while the film loads, then the film can't load: the
//     scene's end shows the finished hero meanwhile (the bus, SMOKEY'S, the CTAs: never the roadrunner's first frame
//     without a headline), and the scene getting shorter for the stills must not move the visitor off its end.
{ let fail; const failNow = new Promise((r) => (fail = r));
  const { ctx, page, errors } = await open({}, { waitUntil: "domcontentloaded", before: (c) => c.route(FILM, async (r) => { await failNow; await r.abort(); }) });
  await pending(page);
  await page.click('[data-site-header] a[aria-label$="home"]'); await settle(page);
  const atEnd = await state(page);
  fail(); await ready(page); await settle(page);
  const after = await state(page);
  const h1Box = await page.evaluate(() => { const r = document.querySelector("#intro-title").getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: innerWidth, h: innerHeight }; });
  check("14 Home while the film loads: the scene's end shows the finished hero meanwhile", near(atEnd.progress, 1, 0.005) && atEnd.h1 === 1 && atEnd.ctasVis === "visible" && atEnd.stillRest === 1, atEnd);
  check("14 then the film can't load: the visitor stays at the scene's end, the headline on screen", near(after.progress, 1, 0.005) && after.still && after.screens === INTRO.scroll.stillScreens && after.h1 === 1 && after.ctasVis === "visible" && h1Box.left >= 0 && h1Box.right <= h1Box.w && h1Box.top >= 0 && h1Box.bottom <= h1Box.h, { after, h1Box });
  results["14 home while loading, then the film fails"] = { atEnd: { progress: atEnd.progress, h1: atEnd.h1, ctasVis: atEnd.ctasVis, stills: `${atEnd.still0}/${atEnd.stillRest}`, pending: atEnd.pending }, after: { progress: after.progress, still: after.still, h1: after.h1, ctasVis: after.ctasVis, focus: after.focus }, h1Box, errors }; await ctx.close(); }

// 15. A 2G connection (navigator.connection): the stills story at once, the film isn't downloaded.
{ const { ctx, page, errors } = await open({}, { before: (c, p) => p.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "connection", { configurable: true, get: () => ({ effectiveType: "2g", saveData: false }) });
  }) });
  await ready(page);
  const top = await state(page);
  const filmRequested = await page.evaluate(() => performance.getEntriesByType("resource").some((r) => /\/video\/intro\/.*\.(mp4|webm)$/.test(r.name)));
  await to(page, 1); await settle(page); const end = await state(page);
  check("15 2G: the stills at once, no film downloaded", top.still && top.film === "-" && !filmRequested, { top, filmRequested });
  check("15 2G: the story ends on the bus", end.h1 === 1 && end.ctasVis === "visible", end);
  results["15 2G connection"] = { top, filmRequested, end, errors }; await ctx.close(); }

// 16. A connection too slow for the film: ~400 kbps from the moment the film is requested (the page itself loads at full
//     speed: at 400 kbps throughout, its ~0.5 MB would meet the boot script's 12 s failsafe first). The stills tell the
//     story within seconds, not after INTRO.filmTimeoutMs (25 s), and the download is cancelled (one request, never finished).
{ let release; const held = new Promise((r) => (release = r));
  const net = { requested: 0, finished: 0, failed: [] };
  const { ctx, page, errors } = await open({}, { before: (c, p) => {
    p.on("request", (r) => FILM.test(r.url()) && net.requested++);
    p.on("requestfinished", (r) => FILM.test(r.url()) && net.finished++);
    p.on("requestfailed", (r) => FILM.test(r.url()) && net.failed.push(r.failure()?.errorText));
    return c.route(FILM, async (r) => { await held; await r.continue(); });
  } });
  await pending(page, 30000);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 50 * 1024, uploadThroughput: 50 * 1024 });
  const t0 = Date.now(); release(); await ready(page);
  const waitedMs = Date.now() - t0;
  await page.waitForTimeout(400); const top = await state(page);
  await to(page, 1); await settle(page); const end = await state(page);
  check("16 too slow for the film: the stills within seconds", waitedMs < 12000 && top.still && top.film === "-" && !top.lock, { waitedMs, top });
  check("16 too slow for the film: its download is cancelled", net.requested === 1 && net.finished === 0 && net.failed.length === 1, net);
  check("16 too slow for the film: the story ends on the bus", end.h1 === 1 && end.ctasVis === "visible", end);
  results["16 film too slow (400 kbps)"] = { waitedMs, net, top, end, errors }; await ctx.close(); }

// 17. A connection that passes the early check, then slows down: the film must still arrive (it's judged once, ~2 s
//     after its first byte, and never cancelled later, however slow the rest is). Chromium's network throttling is too
//     erratic for this (its real rate drifts far from the one set), so a small local server delivers the film at set
//     speeds: ~850 KB/s for 2.4 s (on course for ~7 s: passes the check), then ~360 KB/s (it ends ~13 s in, past the
//     10 s budget a repeated check would cut it off at, inside INTRO.filmTimeoutMs).
{ const filmFiles = path.join(import.meta.dirname, "../../public/video/intro");
  const pace = { size: 0, atSwitch: null, doneMs: null, aborted: false };
  const server = createServer((req, res) => {
    const body = readFileSync(path.join(filmFiles, path.basename(req.url)));
    pace.size = body.length;
    res.writeHead(200, { "content-type": req.url.endsWith(".webm") ? "video/webm" : "video/mp4", "content-length": body.length });
    const t0 = Date.now(); let sent = 0;
    const tick = setInterval(() => {
      const ms = Date.now() - t0;
      if (ms >= 2400 && pace.atSwitch === null) pace.atSwitch = sent;
      const n = Math.min(body.length - sent, Math.round((ms < 2400 ? 850_000 : 360_000) / 20));
      res.write(body.subarray(sent, sent + n)); sent += n;
      if (sent >= body.length) { clearInterval(tick); res.end(); pace.doneMs = Date.now() - t0; }
    }, 50);
    res.on("close", () => { if (sent < body.length) { pace.aborted = true; clearInterval(tick); } });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let release; const held = new Promise((r) => (release = r));
  const { ctx, page, errors } = await open({}, { before: (c) => c.route(FILM, async (r) => { await held; await r.continue({ url: `http://127.0.0.1:${server.address().port}/${r.request().url().split("/").pop()}` }); }) });
  await pending(page, 30000);
  const t0 = Date.now(); release(); await ready(page); const waitedMs = Date.now() - t0;
  await page.waitForTimeout(400); const top = await state(page);
  server.close();
  const slowedAt = pace.atSwitch === null ? null : +(pace.atSwitch / pace.size).toFixed(2);
  // The case really happened: it slowed down well before the end, and the whole download took longer than the budget.
  check("17 the download slowed down early and took over 10 s", slowedAt !== null && slowedAt < 0.6 && pace.doneMs > 10000, { slowedAt, ...pace });
  check("17 slows down after the check: still the film", top.film === "blob" && !top.still && !pace.aborted, { waitedMs, top, aborted: pace.aborted });
  results["17 slows down after the check"] = { waitedMs, slowedAt, downloadMs: pace.doneMs, top, errors }; await ctx.close(); }

/** Resize, then let the page re-lay itself out (the axis follows a media query; ScrollTrigger re-measures after a debounce). */
async function resize(page, viewport) {
  await page.setViewportSize(viewport); await page.waitForTimeout(500); await settle(page);
}
/** The film across a resize or rotation: it must stay on its frame (no replay, no trip back to the start). */
const stayed = (rec, filmT, S) => { const off = rec.frames.filter(([t]) => !filmNear(t, filmT, S)); return { frames: rec.frames.length, off: off.length, range: off.length ? [Math.min(...off.map((f) => f[0])), Math.max(...off.map((f) => f[0]))] : null }; };

// A. Phone rotation: the world sideways (390x844) ↔ a column (844x390). Mid-scene, the visitor keeps their place and the
//    film its frame across the switch (no replay, no loader, no hold), the column scrubs, and back; past the scene they
//    stay in the scene they were in, the film parked at rest, the header there.
{ const { ctx, page, errors } = await open(phone); await ready(page);
  const S = story(cutOf(await filmFiles(page)));
  await to(page, 0.6); await settle(page); const before = await state(page);
  let stop = await recorder(page);
  await resize(page, landscape.viewport);
  const turned = await state(page); const turnRec = stayed(await stop(), before.filmT, S);
  await page.evaluate(() => window.scrollBy({ top: 300, behavior: "instant" })); await settle(page);
  const down = await state(page);
  stop = await recorder(page);
  await resize(page, phone.viewport);
  const back = await state(page); const backRec = stayed(await stop(), down.filmT, S);
  // Past the scene: 100px into the bus scene.
  await page.evaluate(() => { const w = document.querySelector("[data-world]"); w.scrollTo({ left: document.querySelector("#bus").getBoundingClientRect().left + w.scrollLeft + 100, behavior: "instant" }); });
  await settle(page);
  const inBus = { ...(await state(page)), scene: await sceneInView(page) };
  stop = await recorder(page);
  await resize(page, landscape.viewport);
  const busTurned = { ...(await state(page)), scene: await sceneInView(page) }; const busRec = stayed(await stop(), S.beats.rest, S);
  await page.evaluate(() => window.scrollBy({ top: 300, behavior: "instant" })); await settle(page);
  const busDown = { ...(await state(page)), scene: await sceneInView(page) };
  check("A turning the phone mid-scene (sideways → column) keeps the place and the film's frame, not held", turned.axis === "y" && near(turned.progress, before.progress, 0.01) && filmNear(turned.filmT, before.filmT, S) && !turned.lock && turned.loading === null && turnRec.off === 0, { before: { progress: before.progress, filmT: before.filmT }, turned, film: turnRec });
  check("A the column scrubs on down", down.axis === "y" && down.progress > turned.progress && filmNear(down.filmT, S.filmAt(down.progress), S), down);
  check("A turning it back (column → sideways) keeps the place and the frame", back.axis === "x" && near(back.progress, down.progress, 0.01) && filmNear(back.filmT, down.filmT, S) && backRec.off === 0, { down: { progress: down.progress, filmT: down.filmT }, back, film: backRec });
  check("A turning the phone past the scene keeps the visitor where they were, the film parked at rest", inBus.scene === "bus" && busTurned.scene === "bus" && busTurned.stage === "end" && filmNear(busTurned.filmT, S.beats.rest, S) && busRec.off === 0 && busTurned.header && !busTurned.playing, { inBus: { at: inBus.at, scene: inBus.scene }, busTurned, film: busRec });
  results["A rotate (sideways ↔ column)"] = { before: { progress: before.progress, filmT: before.filmT }, turned, turnRec, down: { progress: down.progress, filmT: down.filmT }, back, backRec, inBus: { at: inBus.at, scene: inBus.scene }, busTurned, busRec, busDown: { scene: busDown.scene, stage: busDown.stage, filmT: busDown.filmT }, errors }; await ctx.close(); }

// B. Desktop resize while parked at the branding: a smaller window (still sideways), a short one (a column) and back:
//    the film stays at rest and the branding in; across the switch the place is kept.
{ const { ctx, page, errors } = await open(); await ready(page);
  await to(page, 0.9); await settle(page); const before = await state(page);
  await resize(page, { width: 1180, height: 760 }); const smaller = await state(page);
  let stop = await recorder(page);
  await resize(page, { width: 1280, height: 460 }); const short = await state(page); const shortRec = stayed(await stop(), S0.beats.rest, S0);
  stop = await recorder(page);
  await resize(page, desktop.viewport); const back = await state(page); const backRec = stayed(await stop(), S0.beats.rest, S0);
  const branded = (s) => s.stage === "end" && filmNear(s.filmT, S0.beats.rest, S0) && s.h1 === 1 && s.ctasVis === "visible" && !s.playing;
  check("B a smaller window (still sideways): the film at rest, the branding in", smaller.axis === "x" && branded(smaller), smaller);
  check("B a short window (a column) keeps the place, the film at rest and the branding", short.axis === "y" && near(short.progress, smaller.progress, 0.02) && branded(short) && shortRec.off === 0, { smaller: smaller.progress, short, film: shortRec });
  check("B and back (sideways again): the same", back.axis === "x" && near(back.progress, short.progress, 0.02) && branded(back) && backRec.off === 0, { short: short.progress, back, film: backRec });
  results["B resize at the branding"] = { before: { progress: before.progress, filmT: before.filmT }, smaller: { axis: smaller.axis, progress: smaller.progress, filmT: smaller.filmT }, short, shortRec, back, backRec, errors }; await ctx.close(); }

// C. Fast scrolling from the start: a fast stepped wheel (60 notches of 120px, 60 ms apart) and a fast trackpad (100
//    small 45px deltas, 16 ms apart): the film is scrubbed forward only (never back, no snap back), the world ends where the
//    input took it, the film at rest.
{ const { ctx, page, errors } = await open(); await ready(page); await settle(page);
  const runs = {};
  for (const [name, n, dy, gap, want] of [["wheel", 60, 120, 60, 7200], ["trackpad", 100, 45, 16, 4500]]) {
    await to(page, 0); await settle(page);
    await page.mouse.move(400, 420);
    const stop = await recorder(page);
    for (let i = 0; i < n; i++) { await page.mouse.wheel(0, dy); await page.waitForTimeout(gap); }
    await settle(page);
    const rec = await stop();
    const final = await state(page);
    const series = rec.frames.map((f) => f[0]);
    runs[name] = {
      want, at: final.at, filmT: final.filmT, playing: final.playing,
      backwardsSteps: series.slice(1).filter((t, i) => t < series[i] - 0.01).length,
      worldBack: rec.frames.slice(1).filter((f, i) => f[2] < rec.frames[i][2] - 0.5).length,
      biggestForwardStepSec: series.length > 1 ? +Math.max(...series.slice(1).map((t, i) => t - series[i])).toFixed(2) : null,
    };
  }
  for (const [name, r] of Object.entries(runs)) check(`C a fast ${name} from the start: the film only moves forward, the world ends where it took it, the film at rest`, r.backwardsSteps === 0 && near(r.at, r.want, 2) && filmNear(r.filmT, S0.beats.rest, S0) && !r.playing, r);
  results["C fast scroll"] = { ...runs, errors }; await ctx.close(); }

// D. Autoplay blocked (NotAllowedError): the film is only ever seeked, so it still follows the scroll.
{ const ctx = await context(desktop);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () { return Promise.reject(new DOMException("blocked", "NotAllowedError")); };
  });
  await page.goto(URL, { waitUntil: "load" }); await ready(page); await settle(page);
  const idle = await state(page);
  await to(page, 0.5); await settle(page); const mid = await state(page);
  await to(page, 1); await settle(page); const end = await state(page);
  check("D autoplay blocked: the film still follows the scroll", idle.film === "blob" && !idle.still && filmNear(mid.filmT, S0.filmAt(mid.progress), S0) && filmNear(end.filmT, S0.beats.rest, S0) && !mid.playing && !end.playing, { idle, mid, end });
  results["D autoplay blocked"] = { idle: { film: idle.film, filmT: idle.filmT, still: idle.still }, mid: { filmT: mid.filmT, playing: mid.playing }, end: { filmT: end.filmT, playing: end.playing } }; await ctx.close(); }

// E. 32:9 ultrawide: the portrait film is a feathered band, never cropped below its minVisible, never stretched.
{ const ctx = await context({ viewport: { width: 3840, height: 1080 } });
  const page = await ctx.newPage(); await page.goto(URL, { waitUntil: "load" }); await ready(page);
  const S = story(cutOf(await filmFiles(page)));
  const box = await page.evaluate(() => { const b = document.querySelector("[data-film-box]"); return { w: b.offsetWidth, h: b.offsetHeight, top: b.offsetTop, left: b.offsetLeft, banded: b.dataset.banded ?? "-", frameH: document.querySelector("[data-frame]").offsetHeight, axis: document.documentElement.dataset.axis }; });
  const m = manifest[S.cut];
  const minVisible = introFilm.cuts[S.cut].minVisible;
  check("E 32:9: the film is a feathered band in its own shape, never cropped below its minVisible", box.axis === "x" && box.banded === "x" && near(box.w / box.h, m.width / m.height, (0.01 * m.width) / m.height) && box.frameH / box.h >= minVisible.y - 0.005, { box, aspect: m.width / m.height, minVisible });
  results["E 32:9"] = { box }; await ctx.close(); }

// F. The header's Home link (/#intro-end) from /#faq: the world glides back to the scene's end; the film stays parked at
//    rest all the way (it never plays backwards through the dark), the CTAs there, "Home" marked as where you are.
{ const ctx = await context(desktop);
  const page = await ctx.newPage(); await page.goto(`${URL}#faq`, { waitUntil: "load" }); await ready(page); await settle(page);
  const stop = await recorder(page);
  await page.click('[data-site-header] a[aria-label$="home"]'); await settle(page);
  const rec = await stop();
  const st = await state(page);
  const where = await page.evaluate(() => ({ hash: location.hash, current: document.querySelector('[data-site-header] nav a[href="/#intro-end"]')?.getAttribute("aria-current") ?? null }));
  const offRest = rec.frames.filter(([t]) => !filmNear(t, S0.beats.rest, S0)).length;
  check("F the header's Home link from /#faq: back to the scene's end, CTAs there, Home marked", near(st.progress, 1, 0.002) && st.stage === "end" && st.ctasVis === "visible" && where.hash === "#intro-end" && where.current === "location", { st, where });
  check("F ... the film parked at rest all the way back", rec.frames.length > 10 && offRest === 0 && filmNear(st.filmT, S0.beats.rest, S0), { frames: rec.frames.length, offRest });
  results["F home link"] = { progress: st.progress, filmT: st.filmT, playing: st.playing, ctas: st.ctasVis, ...where, glideFrames: rec.frames.length, offRest }; await ctx.close(); }

// G. The film's files are named after their content and cached for good: everything the page fetches from
//    /video/intro (stills, glows and the film: the desktop, phone and VP9 files) has a hashed name and an
//    immutable Cache-Control, and a second visit takes them from the cache (nothing downloaded or revalidated
//    again before the world lets go). The second visit is on the phone: its film fits the test browser's
//    in-memory cache, which may not keep the larger desktop file.
{ const IMMUTABLE = "public, max-age=31536000, immutable";
  const HASHED = /^[\w-]+\.[0-9a-f]{10}\.(mp4|webm|webp)$/;
  const vp9Only = (p) => p.addInitScript(() => {
    const orig = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function (type) { return type.startsWith("video/mp4") ? "" : orig.call(this, type); };
  });
  const fetched = [];
  let secondVisit = [];
  for (const [opts, before] of [[desktop], [phone], [desktop, vp9Only]]) {
    const ctx = await context(opts);
    const page = await ctx.newPage();
    if (before) await before(page);
    page.on("response", (r) => { const u = r.url().split("?")[0]; if (u.includes("/video/intro/")) fetched.push({ file: u.split("/").pop(), cacheControl: r.headers()["cache-control"] ?? null }); });
    await page.goto(URL, { waitUntil: "load" }); await ready(page);
    if (opts === phone) {
      // A return visit: the first tab closed, a new one in the same browser (its HTTP cache).
      await page.close();
      const again = await ctx.newPage(); await again.goto(URL, { waitUntil: "load" }); await ready(again);
      secondVisit = await again.evaluate(() => performance.getEntriesByType("resource").filter((r) => r.name.includes("/video/intro/")).map((r) => ({ file: r.name.split("/").pop(), bytes: r.transferSize })));
    }
    await ctx.close();
  }
  const files = [...new Set(fetched.map((f) => f.file))];
  results["G cached for good"] = {
    files, films: files.filter((f) => /\.(mp4|webm)$/.test(f)).length,
    unhashed: files.filter((f) => !HASHED.test(f)),
    notImmutable: [...new Set(fetched.filter((f) => f.cacheControl !== IMMUTABLE).map((f) => `${f.file}: ${f.cacheControl}`))],
    secondVisitFiles: secondVisit.length,
    secondVisitTransferred: secondVisit.filter((r) => r.bytes > 0).map((r) => `${r.file}: ${r.bytes} B`),
  };
  const g = results["G cached for good"];
  check("G the film's files have content-hashed names", g.films > 0 && g.unhashed.length === 0, { files: g.files, unhashed: g.unhashed });
  check("G they're served immutable", g.notImmutable.length === 0, g.notImmutable);
  check("G a second visit takes them from the cache", g.secondVisitFiles > 0 && g.secondVisitTransferred.length === 0, { files: g.secondVisitFiles, transferred: g.secondVisitTransferred }); }

/**
 * Sweep the tunnel scene's range in `n` steps forward and back (either layout), three frames per step, recording
 * the film's currentTime and the black's opacity at the end of every step, on every frame, and on every frame the
 * video presents (requestVideoFrameCallback: what was actually shown); then let it land back at the start.
 */
const sweep = (page, n) =>
  page.evaluate(async (n) => {
    const x = document.documentElement.dataset.axis === "x";
    const w = document.querySelector("[data-world]");
    const s = document.querySelector("#top");
    const v = document.querySelector("[data-film]");
    const d = document.querySelector('[data-fx="dark"]');
    const start = x ? s.getBoundingClientRect().left - w.getBoundingClientRect().left + w.scrollLeft : s.getBoundingClientRect().top + scrollY;
    const range = x ? s.offsetWidth - w.clientWidth : s.offsetHeight - innerHeight;
    const go = (p) => (x ? w.scrollTo({ left: start + p * range, behavior: "instant" }) : window.scrollTo({ top: start + p * range, behavior: "instant" }));
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const black = () => +(+getComputedStyle(d).opacity).toFixed(3);
    const steps = [], frames = [], shown = [];
    let on = true;
    const tick = () => { if (!on) return; frames.push([+v.currentTime.toFixed(4), black()]); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const onShown = (_, m) => { if (!on) return; shown.push([+m.mediaTime.toFixed(4), black()]); v.requestVideoFrameCallback(onShown); };
    v.requestVideoFrameCallback?.(onShown);
    for (const dir of [1, -1]) {
      for (let i = 0; i <= n; i++) {
        go(dir > 0 ? i / n : 1 - i / n);
        await frame(); await frame(); await frame();
        steps.push([+v.currentTime.toFixed(4), black()]);
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
    on = false;
    return { steps, frames, shown, range, final: [+v.currentTime.toFixed(4), black()], maxBlack: Math.max(...frames.map((f) => f[1])) };
  }, n);
/** Jump the world at once from `from` to `to` (progress), the scrub catching up on its own: the film recorded on the way. */
async function jump(page, from, to_) {
  await to(page, from); await settle(page);
  const stop = await recorder(page);
  await to(page, to_); await settle(page);
  return stop();
}
const darknessReport = (samples, S) => {
  const seen = swapSeen(samples, S);
  return { samples: samples.length, inside: seen.inside.length, early: seen.early.length, examples: [...seen.inside, ...seen.early].slice(0, 8), ...throughDark(samples, S) };
};
/** Every report in a tree of darkness reports (sweep steps / frames / shown, each jump's frames / shown). */
const reports = (o) => (o && typeof o === "object" ? ("inside" in o ? [o] : Object.values(o).flatMap(reports)) : []);

// T1. The darkness guarantee: nothing of the change from the roadrunner to the bus is ever on screen. A dense sweep of
//     the scene's range (200 steps each way), and fast jumps across the darkness (the scrub catching up in a fraction of
//     a second): at every step, every frame and every frame the video presented, the film never shows a time strictly
//     between the dark and lights beats (± a frame), and from the lights beat until the black starts lifting from its
//     glimpse level (only the headlights glow through) the black is at least that level.
{ const { ctx, page, errors } = await open(); await ready(page); await settle(page);
  const S = story(cutOf(await filmFiles(page)));
  const sw = await sweep(page, 200);
  const sweepRep = { steps: darknessReport(sw.steps, S), frames: darknessReport(sw.frames, S), shown: darknessReport(sw.shown, S), final: sw.final, maxBlack: sw.maxBlack, range: sw.range };
  const jumps = {};
  for (const [name, from, to_] of [["the drive-out → the run", S.p.emerge, S.p.tunnel], ["the run → the drive-out", S.p.tunnel, S.p.emerge], ["the end → the start", 1, 0], ["the start → the end", 0, 1]]) {
    const rec = await jump(page, from, to_);
    jumps[name] = { frames: darknessReport(rec.frames, S), shown: darknessReport(rec.shown, S) };
  }
  // Parked (settled) at every pixel across the swap's point: wherever the world comes to rest, the film is on one side.
  const swapAt = Math.round(S.p.swap * sw.range);
  const parked = [];
  for (let px = swapAt - 6; px <= swapAt + 6; px++) {
    await page.evaluate((px) => document.querySelector("[data-world]").scrollTo({ left: px, behavior: "instant" }), px); await settle(page);
    parked.push([...(await page.evaluate(() => [+document.querySelector("[data-film]").currentTime.toFixed(4), +(+getComputedStyle(document.querySelector('[data-fx="dark"]')).opacity).toFixed(3)])), px]);
  }
  const parkedRep = { ...darknessReport(parked, S), at: parked.filter((p) => swapSeen([p], S).inside.length).map(([t, black, px]) => ({ px, filmT: t, black })) };
  const named = { "sweep steps": sweepRep.steps, "sweep frames": sweepRep.frames, "sweep shown": sweepRep.shown, "parked across the swap": parkedRep, ...Object.fromEntries(Object.entries(jumps).flatMap(([n, j]) => [[`${n} frames`, j.frames], [`${n} shown`, j.shown]])) };
  const where = (key) => Object.fromEntries(Object.entries(named).filter(([, r]) => r[key] > 0).map(([n, r]) => [n, { [key]: r[key], of: r.samples, examples: r.examples }]));
  check("T1 the film never shows a time inside the darkness's jump (dark < t < lights, ± a frame): sweep steps, frames, frames shown, parked by the pixel across the swap, fast jumps", Object.values(named).every((r) => r.inside === 0), where("inside"));
  check("T1 from the lights beat until the black lifts from its glimpse level, the black is at least that level", Object.values(named).every((r) => r.early === 0), where("early"));
  check("T1 the sweep went through the darkness: complete black at the dark beat, the lights frames after, back to the first frame", sweepRep.steps.atDark && sweepRep.steps.afterSwap && sweepRep.shown.afterSwap && sweepRep.maxBlack === 1 && sweepRep.final[0] <= S.frame && sweepRep.final[1] === 0, sweepRep);
  check("T1 the fast jumps were recorded, frame by frame and frame shown", Object.values(jumps).every((j) => j.frames.samples > 0 && j.shown.samples > 0), jumps);
  results["T1 darkness guarantee"] = { story: { progress: S.p, beats: S.beats, fps: S.fps, glimpseLevel: S.glimpse, glimpseFilm: +S.glimpseFilm.toFixed(3) }, sweep: sweepRep, parked: parkedRep, jumps, errors }; await ctx.close(); }

// T2. Not an intro: the header is visible (on top, not hidden) from the very start; nothing says "Skip intro"; the
//     world's next scene (#bus) begins exactly where the tunnel scene ends; and a wheel from the branded end carries
//     straight on into #bus: no jump, no step back, the stage slides out with the world, the film stays at rest.
{ let release; const held = new Promise((r) => (release = r));
  const { ctx, page, errors } = await open({}, { waitUntil: "domcontentloaded", before: (c) => c.route(FILM, async (r) => { await held; await r.continue(); }) });
  const header = () => page.evaluate(() => {
    const hdr = document.querySelector("[data-site-header]");
    const cs = getComputedStyle(hdr);
    const logo = hdr.querySelector('a[aria-label$="home"]').getBoundingClientRect();
    const hit = document.elementFromPoint(logo.left + logo.width / 2, logo.top + logo.height / 2);
    const r = hdr.getBoundingClientRect();
    return { visible: cs.visibility === "visible" && cs.display !== "none" && +cs.opacity > 0.99 && r.top === 0 && r.height > 0, onTop: Boolean(hit?.closest("[data-site-header]")), hidden: Boolean(hdr.closest("[inert], [aria-hidden='true']")), loading: document.documentElement.getAttribute("data-intro-loading") };
  });
  const first = await header();
  await pending(page);
  const whileLoading = await header();
  release(); await ready(page); await settle(page);
  const atStart = { ...(await header()), stage: (await state(page)).stage };
  const html = await (await fetch(URL)).text();
  const skipInDom = await page.evaluate(() => /skip intro/i.test(document.body.textContent) || [...document.querySelectorAll("[aria-label], [title], [value]")].some((e) => /skip intro/i.test([e.getAttribute("aria-label"), e.getAttribute("title"), e.getAttribute("value")].join(" "))));
  const geo = await page.evaluate(() => {
    const w = document.querySelector("[data-world]");
    const at = (e) => e.getBoundingClientRect().left - w.getBoundingClientRect().left + w.scrollLeft;
    const top = document.querySelector("#top");
    return { topStart: at(top), topEnd: at(top) + top.offsetWidth, busStart: at(document.querySelector("#bus")), range: top.offsetWidth - w.clientWidth };
  });
  // From the branded end, a mouse wheel: 16 notches of 100px, 50 ms apart; the world, the stage, #bus and the film every frame.
  await to(page, 1); await settle(page);
  await page.evaluate(() => {
    const w = document.querySelector("[data-world]"), st = document.querySelector(".intro-stage"), bus = document.querySelector("#bus"), v = document.querySelector("[data-film]");
    const r = (window.__carry = { on: true, frames: [] });
    const f = () => { if (!r.on) return; r.frames.push([w.scrollLeft, st.getBoundingClientRect().left, bus.getBoundingClientRect().left, v.currentTime]); requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  await page.mouse.move(400, 420);
  for (let i = 0; i < 16; i++) { await page.mouse.wheel(0, 100); await page.waitForTimeout(50); }
  await settle(page);
  const carry = await page.evaluate(() => { window.__carry.on = false; return window.__carry.frames; });
  const sceneAfter = await sceneInView(page);
  const steps = carry.slice(1).map((f, i) => f[0] - carry[i][0]);
  const S = S0;
  const carryRep = {
    frames: carry.length, from: carry[0]?.[0], to: carry.at(-1)?.[0], want: geo.range + 1600,
    biggestStep: Math.max(0, ...steps), stepsBack: steps.filter((d) => d < -0.5).map((d) => +d.toFixed(1)),
    stageOff: carry.filter(([at, stage]) => !near(stage, -Math.max(0, at - geo.range), 1)).length,
    busOff: carry.filter(([at, , bus]) => !near(bus, geo.busStart - at, 1)).length,
    filmOff: carry.filter(([, , , t]) => !filmNear(t, S.beats.rest, S)).length, sceneAfter,
  };
  check("T2 the header is visible, on top, from the very start (before and while the film loads, at the start of the story)", [first, whileLoading, atStart].every((h) => h.visible && h.onTop && !h.hidden), { first, whileLoading, atStart });
  check("T2 nothing says 'Skip intro' (the server's page, the live page)", !/skip intro/i.test(html) && !skipInDom && html.length > 1000, { inHtml: /skip intro/i.test(html), skipInDom });
  check("T2 #bus begins exactly where the tunnel scene ends", near(geo.topStart, 0, 0.5) && near(geo.busStart, geo.topEnd, 0.5), geo);
  check("T2 a wheel from the branded end carries straight on into #bus: no jump, the stage slides out with the world, the film at rest", carry.length > 20 && carryRep.biggestStep <= desktop.viewport.width / 4 && carryRep.stageOff === 0 && carryRep.busOff === 0 && carryRep.filmOff === 0 && near(carryRep.to, carryRep.want, 2) && sceneAfter === "bus", carryRep);
  check("T2 ... and never steps back on the way", carryRep.stepsBack.length === 0, carryRep);
  results["T2 not an intro"] = { header: { first, whileLoading, atStart }, skip: { inHtml: /skip intro/i.test(html), skipInDom }, geo, carry: carryRep, errors }; await ctx.close(); }

// T3. The branding appears IN the scene: not before the bus is out, all in by the end of the scene's range, inside
//     its stage; the scene's "Book your ride" opens the booking panel over the world; "See the Bus" glides to #bus.
{ const { ctx, page, errors } = await open(); await ready(page); await settle(page);
  const S = story(cutOf(await filmFiles(page)));
  await to(page, S.p.brand - 0.05); await settle(page); const before = await state(page);
  await to(page, 1); await settle(page); const end = await state(page);
  const boxes = await page.evaluate(() => {
    const r = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; };
    return { h1: r("#intro-title"), ctas: r("[data-bus-ctas]"), stage: r(".intro-stage"), w: innerWidth, h: innerHeight };
  });
  const inside = (b, o) => b.left >= o.left - 0.5 && b.right <= o.right + 0.5 && b.top >= o.top - 0.5 && b.bottom <= o.bottom + 0.5;
  const screen = { left: 0, top: 0, right: boxes.w, bottom: boxes.h };
  check("T3 the branding appears in the scene: not before the bus is out, all in by the end of its range", before.h1 === 0 && before.ctasVis === "hidden" && before.stage === "film" && end.h1 === 1 && end.ctas === 1 && end.ctasVis === "visible" && end.stage === "end" && inside(boxes.h1, boxes.stage) && inside(boxes.ctas, boxes.stage) && inside(boxes.h1, screen) && inside(boxes.ctas, screen), { before, end, boxes });
  await page.locator('[data-bus-ctas] a[data-action="book"]').click();
  await page.waitForFunction(() => document.querySelector("dialog[open]")?.contains(document.activeElement), null, { timeout: 5000 }).catch(() => {});
  const opened = await panel(page);
  await page.keyboard.press("Escape"); await page.waitForTimeout(500);
  const closed = await panel(page);
  check("T3 'Book your ride' opens the booking panel over the world (labelled, focus inside), the world put", opened.open && opened.title === "Book your ride" && opened.focusInside && opened.at === end.at, { atEnd: end.at, opened });
  check("T3 Esc closes it, focus back on 'Book your ride', the world where it was", !closed.open && closed.focus === "Book your ride" && closed.at === end.at, closed);
  await page.locator("[data-bus-ctas] a", { hasText: "See the Bus" }).click(); await settle(page);
  const seen = { at: (await state(page)).at, busStart: await startOf(page, "#bus"), hash: await page.evaluate(() => location.hash) };
  check("T3 'See the Bus' glides to the bus scene's start", near(seen.at, seen.busStart) && seen.hash === "#bus", seen);
  // Back (the link added a history entry): the world glides back to where the visitor was, the scene's branded end.
  await page.goBack(); await settle(page);
  const back = { ...(await state(page)), hash: await page.evaluate(() => location.hash) };
  check("T3 Back after 'See the Bus' returns to the scene's end", near(back.at, end.at) && back.hash === "" && back.stage === "end", { atEnd: end.at, back: { at: back.at, hash: back.hash, stage: back.stage } });
  results["T3 branding in the scene, its CTAs"] = { before: { progress: before.progress, h1: before.h1, ctasVis: before.ctasVis }, end: { h1: end.h1, ctas: end.ctas, ctasVis: end.ctasVis }, opened, closed, seen, back: { at: back.at, hash: back.hash }, errors }; await ctx.close(); }

// V. The column (a phone on its side, 844x390: too short for the world sideways), first visit: the page held at the top
//    until the film is in memory (wheel, Space, Page Down, a touch swipe), then the whole story down the page and back,
//    the darkness guarantee down the page, and #bus right below the scene once its stage has scrolled away.
{ let release; const held = new Promise((r) => (release = r));
  const { ctx, page, errors } = await open(landscape, { before: (c) => c.route(FILM, async (r) => { await held; await r.continue(); }) });
  await pending(page, 30000);
  const cdp = await ctx.newCDPSession(page);
  await page.mouse.move(420, 200);
  await page.mouse.wheel(0, 600);
  for (const key of ["Space", "PageDown"]) await page.keyboard.press(key);
  await cdp.send("Input.synthesizeScrollGesture", { x: 420, y: 300, xDistance: 0, yDistance: -300, gestureSourceType: "touch", speed: 1200, preventFling: true });
  await page.waitForTimeout(400);
  const lockedTry = await state(page);
  release(); await ready(page); await settle(page);
  const readyState = await state(page);
  const S = story(cutOf(await filmFiles(page)));
  await page.mouse.move(420, 200);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 150); await page.waitForTimeout(80); }
  await settle(page); const afterWheel = await state(page);
  await to(page, 1); await settle(page); const end = await state(page);
  await to(page, 0.5); await settle(page); const backToMid = await state(page);
  await to(page, 0); await settle(page); const backToTop = await state(page);
  const sw = await sweep(page, 100);
  const sweepRep = { steps: darknessReport(sw.steps, S), frames: darknessReport(sw.frames, S), shown: darknessReport(sw.shown, S), maxBlack: sw.maxBlack };
  await page.evaluate(() => { const s = document.querySelector("#top"); window.scrollTo({ top: s.offsetHeight - innerHeight + 300, behavior: "instant" }); });
  await settle(page);
  const past = await state(page);
  const geo = await page.evaluate(() => ({ topBottom: Math.round(document.querySelector("#top").getBoundingClientRect().bottom), busTop: Math.round(document.querySelector("#bus").getBoundingClientRect().top), h: innerHeight }));
  check("V the column: held at the top while the film loads (wheel, Space, Page Down, a touch swipe)", lockedTry.axis === "y" && lockedTry.at === 0 && lockedTry.lock && lockedTry.pending, lockedTry);
  check("V the column: the film, the scene 5 screens long, scrubbed down the page by the wheel", readyState.film === "blob" && !readyState.still && readyState.screens === INTRO.scroll.screens && afterWheel.at >= 600 && filmNear(afterWheel.filmT, S.filmAt(afterWheel.progress), S), { readyState, afterWheel });
  check("V the column: the end (bus at rest, branding, CTAs), back to the middle, back to the start", end.stage === "end" && filmNear(end.filmT, S.beats.rest, S) && end.h1 === 1 && end.ctasVis === "visible" && backToMid.stage === "film" && filmNear(backToMid.filmT, S.filmAt(backToMid.progress), S) && backToMid.ctasVis === "hidden" && backToTop.filmT <= S.frame && backToTop.ctasVis === "hidden", { end, backToMid, backToTop });
  check("V the column: the darkness guarantee down the page (100 steps each way)", reports(sweepRep).every((r) => r.inside === 0 && r.early === 0) && sweepRep.steps.atDark && sweepRep.steps.afterSwap && sweepRep.maxBlack === 1, sweepRep);
  check("V the column: past the scene its stage scrolls away and #bus is right below it, nothing sideways", past.stageAt === -300 && geo.busTop === geo.topBottom && geo.busTop === geo.h - 300 && past.overflowX === 0, { past, geo });
  results["V the column (844x390)"] = { lockedTry, readyState: { film: readyState.film, screens: readyState.screens }, afterWheel: { at: afterWheel.at, progress: afterWheel.progress, filmT: afterWheel.filmT }, end: { filmT: end.filmT, h1: end.h1, ctasVis: end.ctasVis }, backToMid: { progress: backToMid.progress, filmT: backToMid.filmT }, backToTop: { filmT: backToTop.filmT }, sweep: sweepRep, past: { stageAt: past.stageAt }, geo, errors }; await ctx.close(); }

await browser.close();
console.log(JSON.stringify(results, null, 1));
// No flow sets out to break the engine: any flow that ended with the scene failed (finished hero instead of the film) is a failure.
const failedFlows = Object.entries(results).filter(([, r]) => JSON.stringify(r).includes('"failed":true')).map(([name]) => name);
if (failedFlows.length) {
  console.error(`\nThe tunnel scene failed (data-intro-failed) in: ${failedFlows.join(", ")}`);
  process.exitCode = 1;
}
if (uncaught.length) {
  console.error(`\n${uncaught.length} uncaught page error(s):\n${[...new Set(uncaught)].join("\n")}`);
  process.exitCode = 1;
}
if (unsettled) console.error(`\n${unsettled} wait(s) for the page to settle ran out (the machine may be loaded): read the checks after them with care.`);
console.error(`\n${failures.length} of ${checked} check(s) failed${failures.length ? `:\n- ${failures.join("\n- ")}` : "."}`);
if (failures.length) process.exitCode = 1;
