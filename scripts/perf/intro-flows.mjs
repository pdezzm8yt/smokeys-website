#!/usr/bin/env node
/**
 * Behaviour checks for the scroll-driven intro, in headless Chromium.
 *
 *   npm run test:intro -- [baseUrl]
 *
 * Needs a running production server (`npm run build && npx next start -p 3100`)
 * and Playwright's Chromium (`npx playwright-core install --only-shell chromium`).
 * Prints one JSON report: first visit (loader, scroll held until the footage
 * is in memory, scroll down and back up), unpinning, reduced motion, Skip
 * (also while loading, and before the page's JavaScript has run), deep links,
 * reload mid-intro, no JavaScript, keyboard, phone, rotation/resize, fast
 * scrolling, autoplay blocked, 32:9, home link. Exits with 1 if any page
 * throws an uncaught error; read the rest of the report for anything unexpected.
 */
import { chromium } from "playwright-core";
const URL = process.argv.slice(2).find((a) => a.startsWith("http")) ?? "http://localhost:3100/";
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const desktop = { viewport: { width: 1280, height: 800 } };
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"] });
const results = {};
/** Uncaught page errors from every flow: any one fails the run. */
const uncaught = [];
async function context(opts) {
  const ctx = await browser.newContext(opts);
  ctx.on("page", (p) => p.on("pageerror", (e) => uncaught.push(e.message)));
  return ctx;
}
const state = (page) =>
  page.evaluate(() => {
    const h = document.documentElement;
    const s = document.querySelector("#top");
    const op = (sel) => { const e = document.querySelector(sel); return e ? +(+getComputedStyle(e).opacity).toFixed(2) : null; };
    const range = s.offsetHeight - innerHeight;
    return {
      progress: range > 0 ? +(scrollY / range).toFixed(3) : null,
      sectionScreens: +(s.offsetHeight / innerHeight).toFixed(2),
      loading: h.getAttribute("data-intro-loading"), pending: h.hasAttribute("data-intro-pending"), lock: h.hasAttribute("data-scroll-lock"),
      final: h.hasAttribute("data-intro-final"), still: h.hasAttribute("data-intro-still"), header: h.dataset.introStage ?? "(none)",
      real: op('[data-scene="real"]'), cartoon: op('[data-scene="cartoon"]'), bus: op('[data-scene="bus"]'), h1: op("#intro-title"), ctas: op("[data-bus-ctas]"),
      ctasInert: document.querySelector("[data-bus-ctas]")?.inert, hint: op('[data-intro-hint="scroll"]'),
      playing: [...document.querySelectorAll("[data-clip]")].filter((v) => !v.paused).map((v) => v.dataset.clip),
      clipsWithSrc: [...document.querySelectorAll("[data-clip]")].filter((v) => v.currentSrc).length,
      focus: document.activeElement === document.body ? "BODY" : document.activeElement?.id || document.activeElement?.textContent?.trim().slice(0, 20),
      stageTop: Math.round(document.querySelector(".intro-stage").getBoundingClientRect().top),
      overflowX: document.documentElement.scrollWidth - innerWidth,
    };
  });
const to = (page, p) => page.evaluate((p) => { const s = document.querySelector("#top"); window.scrollTo(0, p * (s.offsetHeight - innerHeight)); }, p);
async function open(ctxOpts = {}, gotoOpts = {}) {
  const ctx = await context({ ...desktop, ...ctxOpts });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (ctxOpts.slowNet) {
    const c = await ctx.newCDPSession(page);
    await c.send("Network.enable");
    await c.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 700 * 1024, uploadThroughput: 200 * 1024 });
  }
  await page.goto(gotoOpts.url ?? URL, { waitUntil: gotoOpts.waitUntil ?? "load" });
  return { ctx, page, errors };
}
const ready = (page) => page.waitForFunction(() => !document.documentElement.hasAttribute("data-intro-pending") && !document.documentElement.hasAttribute("data-intro-loading"), null, { timeout: 90000 });

// 1. First visit: loader + scroll locked until footage is in memory, then scroll-driven, reversible.
{ const { ctx, page, errors } = await open();
  const atLoad = await state(page);
  await page.mouse.wheel(0, 600); await page.waitForTimeout(200);
  const lockedTry = await state(page);
  await ready(page); await page.waitForTimeout(400);
  const readyState = await state(page);
  await page.mouse.move(640, 400);
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 200); await page.waitForTimeout(60); }
  await page.waitForTimeout(1200);
  const afterWheel = await state(page);
  await to(page, 1); await page.waitForTimeout(1400); const end = await state(page);
  await to(page, 0.55); await page.waitForTimeout(1400); const backToDust = await state(page);
  await to(page, 0); await page.waitForTimeout(1400); const backToTop = await state(page);
  results["1 first visit, scroll down & back up"] = { atLoad, lockedTry, readyState, afterWheel, end, backToDust, backToTop, errors }; await ctx.close(); }

// 2. Past the intro the stage unpins and the page scrolls on normally.
{ const { ctx, page, errors } = await open(); await ready(page);
  await page.evaluate(() => { const s = document.querySelector("#top"); window.scrollTo(0, s.offsetHeight + 300); }); await page.waitForTimeout(800);
  const st = await state(page);
  const busSection = await page.evaluate(() => Math.round(document.querySelector("#bus").getBoundingClientRect().top));
  results["2 unpins after the intro"] = { stageTop: st.stageTop, header: st.header, busSectionTop: busSection, errors }; await ctx.close(); }

// 3. Reduced motion: stills (no clips downloaded), shorter scroll, same story.
{ const { ctx, page, errors } = await open({ reducedMotion: "reduce" }); await ready(page);
  const top = await state(page);
  await to(page, 0.3); await page.waitForTimeout(900); const mid = await state(page);
  await to(page, 1); await page.waitForTimeout(900); const end = await state(page);
  results["3 reduced motion"] = { top, mid, end, errors }; await ctx.close(); }

// 4. Skip: jumps to the end of the story with focus on the headline.
{ const { ctx, page, errors } = await open(); await ready(page);
  await page.getByRole("button", { name: "Skip intro" }).click(); await page.waitForTimeout(1500);
  results["4 skip"] = { ...(await state(page)), errors }; await ctx.close(); }

// 5. Skip while the footage is still loading (slow network): finished hero, then the engine takes over.
{ const { ctx, page, errors } = await open({ slowNet: true }, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-intro-hint="skip"]'); await page.waitForTimeout(800);
  const before = await state(page);
  await page.getByRole("button", { name: "Skip intro" }).click(); await page.waitForTimeout(600);
  const afterSkip = await state(page);
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-intro-final") && !document.documentElement.hasAttribute("data-intro-pending"), null, { timeout: 120000 }); await page.waitForTimeout(1500);
  results["5 skip during loading (slow network)"] = { before, afterSkip, afterReady: await state(page), errors }; await ctx.close(); }

// 6. Deep link (#packages): no loader, header visible, intro at its end state.
{ const { ctx, page, errors } = await open({}, { url: `${URL}#packages` }); await page.waitForTimeout(3000);
  results["6 deep link"] = { ...(await state(page)), errors }; await ctx.close(); }

// 7. Reload while scrolled into the intro: no scroll lock, the scene matches the scroll position.
{ const { ctx, page, errors } = await open(); await ready(page);
  await to(page, 0.3); await page.waitForTimeout(800);
  await page.reload({ waitUntil: "load" }); await page.waitForTimeout(3500);
  results["7 reload mid-intro"] = { ...(await state(page)), errors }; await ctx.close(); }

// 8. No JavaScript: the finished hero, no scroll story.
{ const { ctx, page, errors } = await open({ javaScriptEnabled: false }); await page.waitForTimeout(500);
  const st = await page.evaluate(() => ({ sectionScreens: +(document.querySelector("#top").offsetHeight / innerHeight).toFixed(2), bus: getComputedStyle(document.querySelector('[data-scene="bus"]')).opacity, real: getComputedStyle(document.querySelector('[data-scene="real"]')).visibility, h1: getComputedStyle(document.querySelector("#intro-title")).opacity, ctas: getComputedStyle(document.querySelector("[data-bus-ctas]")).opacity, busPoster: document.querySelector('[data-poster="bus"]').complete && document.querySelector('[data-poster="bus"]').naturalWidth }));
  results["8 no JavaScript"] = { ...st, errors }; await ctx.close(); }

// 9. Keyboard: Space scrolls the story; Tab reaches the CTAs only once they're visible.
{ const { ctx, page, errors } = await open(); await ready(page);
  await page.keyboard.press("Tab"); const firstTab = (await state(page)).focus;
  await page.evaluate(() => document.activeElement?.blur());
  for (let i = 0; i < 4; i++) { await page.keyboard.press("Space"); await page.waitForTimeout(250); }
  await page.waitForTimeout(1200); const afterSpace = await state(page);
  await to(page, 1); await page.waitForTimeout(1400);
  await page.evaluate(() => document.querySelector("#intro-title").focus()); await page.keyboard.press("Tab");
  results["9 keyboard"] = { firstTab, afterSpace: { progress: afterSpace.progress, cartoon: afterSpace.cartoon }, tabAfterHeadline: (await state(page)).focus, errors }; await ctx.close(); }

// 10. Phone: same story (phone crops), no horizontal overflow.
{ const { ctx, page, errors } = await open(phone); await ready(page);
  const files = await page.evaluate(() => [...document.querySelectorAll("[data-clip-box]")].map((b) => `${b.dataset.clipBox}:${getComputedStyle(b).getPropertyValue("--aspect")}${b.hasAttribute("data-banded") ? " banded" : ""}`));
  await to(page, 0.6); await page.waitForTimeout(1300); const swap = await state(page);
  await to(page, 1); await page.waitForTimeout(1300); const end = await state(page);
  results["10 phone"] = { files, swap: { bus: swap.bus, cartoon: swap.cartoon, playing: swap.playing }, end: { h1: end.h1, ctas: end.ctas, overflowX: end.overflowX }, errors }; await ctx.close(); }

// 11. Skip before any of the page's JavaScript has run (scripts held back): the boot script alone
// shows the finished hero at the end of the intro; then the engine takes over.
{ const ctx = await context(desktop);
  let release; const held = new Promise((r) => (release = r));
  await ctx.route((u) => u.pathname.startsWith("/_next/static/chunks/") && u.pathname.endsWith(".js"), async (route) => { await held; await route.continue(); });
  const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  const before = await state(page);
  await page.getByRole("button", { name: "Skip intro" }).click(); await page.waitForTimeout(400);
  const afterSkip = await state(page);
  release(); await page.waitForLoadState("load"); await page.waitForTimeout(3000);
  results["11 skip before JavaScript"] = { before: { loading: before.loading, lock: before.lock }, afterSkip, afterJs: await state(page), errors }; await ctx.close(); }


const st = (page) => page.evaluate(() => {
  const v = (s) => document.querySelector(`[data-clip="${s}"]`);
  const hdr = document.querySelector("[data-site-header]");
  return { header: document.documentElement.dataset.introStage, headerVis: getComputedStyle(hdr).visibility, playing: ["real", "cartoon", "dust", "bus"].filter((s) => !v(s).paused), busT: +v("bus").currentTime.toFixed(2), dustT: +v("dust").currentTime.toFixed(2), realHidden: v("real").style.visibility };
});

// A. Rotate / resize after scrolling past the intro: header stays, nothing replays.
{ const ctx = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage(); await page.goto(URL, { waitUntil: "load" }); await ready(page);
  await page.evaluate(() => { const s = document.querySelector("#top"); window.scrollTo(0, s.offsetHeight + 400); }); await page.waitForTimeout(1500);
  const before = await st(page);
  await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(2000);
  const afterRotate = await st(page);
  await page.evaluate(() => window.scrollBy(0, 300)); await page.waitForTimeout(800);
  results["A rotate below intro"] = { before, afterRotate, afterScroll: await st(page) }; await ctx.close(); }

// B. Desktop resize while parked at the branding: bus stays at rest.
{ const ctx = await context({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); await page.goto(URL, { waitUntil: "load" }); await ready(page);
  await to(page, 0.9); await page.waitForTimeout(1500); const before = await st(page);
  await page.setViewportSize({ width: 1180, height: 760 }); await page.waitForTimeout(1500);
  results["B resize at branding"] = { before, after: await st(page) }; await ctx.close(); }

// C. Fast wheel scroll to the end: the bus is scrubbed (monotonic, no snap).
{ const ctx = await context({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); await page.goto(URL, { waitUntil: "load" }); await ready(page);
  await page.mouse.move(640, 400);
  await page.evaluate(() => { window.__bus = []; const v = document.querySelector('[data-clip="bus"]'); const f = () => { window.__bus.push(+v.currentTime.toFixed(2)); if (window.__bus.length < 400) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(60); }
  await page.waitForTimeout(1500);
  const series = await page.evaluate(() => window.__bus);
  const drops = series.slice(1).filter((t, i) => t < series[i] - 0.01).length;
  const maxJump = Math.max(...series.slice(1).map((t, i) => t - series[i]));
  results["C fast scroll"] = { final: await st(page), backwardsSteps: drops, biggestForwardStepSec: +maxJump.toFixed(2) }; await ctx.close(); }

// D. Autoplay blocked (NotAllowedError): stills for the running clips, bus/dust still scrub; a tap unlocks.
{ const ctx = await context({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const orig = HTMLMediaElement.prototype.play;
    window.__unlocked = false;
    document.addEventListener("pointerdown", () => (window.__unlocked = true), true);
    HTMLMediaElement.prototype.play = function () { if (!window.__unlocked) return Promise.reject(new DOMException("blocked", "NotAllowedError")); return orig.call(this); };
  });
  await page.goto(URL, { waitUntil: "load" }); await ready(page); await page.waitForTimeout(500);
  const idle = await page.evaluate(() => ({ realVideoHidden: document.querySelector('[data-clip="real"]').style.visibility, realPoster: document.querySelector('[data-poster="real"]').currentSrc.split("/").pop() }));
  await to(page, 0.62); await page.waitForTimeout(1300); const dusty = await st(page);
  await to(page, 1); await page.waitForTimeout(1300); const end = await st(page);
  await to(page, 0.05); await page.waitForTimeout(1300);
  await page.mouse.click(640, 400); await page.waitForTimeout(800);
  results["D autoplay blocked"] = { idle, dusty, end, afterTap: await st(page) }; await ctx.close(); }

// E. 32:9 ultrawide: clips stay within the vertical limit (feet/wheels on screen).
{ const ctx = await context({ viewport: { width: 3840, height: 1080 } });
  const page = await ctx.newPage(); await page.goto(URL, { waitUntil: "load" }); await ready(page);
  const boxes = await page.evaluate(() => [...document.querySelectorAll("[data-clip-box]")].map((b) => ({ clip: b.dataset.clipBox, w: b.offsetWidth, h: b.offsetHeight, top: b.offsetTop, banded: b.dataset.banded ?? "-" })));
      results["E 32:9"] = { boxes }; await ctx.close(); }

// F. Header home link → the film's resting point.
{ const ctx = await context({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); await page.goto(`${URL}#faq`, { waitUntil: "load" }); await page.waitForTimeout(2500);
  await page.evaluate(() => document.documentElement.style.scrollBehavior = "auto");
  await page.click('[data-site-header] a[aria-label$="home"]'); await page.waitForTimeout(2000);
  const p = await page.evaluate(() => { const s = document.querySelector("#top"); return +(scrollY / (s.offsetHeight - innerHeight)).toFixed(3); });
  results["F home link"] = { progress: p, ...(await st(page)), ctas: await page.evaluate(() => getComputedStyle(document.querySelector("[data-bus-ctas]")).visibility) }; await ctx.close(); }

await browser.close();
console.log(JSON.stringify(results, null, 1));
if (uncaught.length) {
  console.error(`\n${uncaught.length} uncaught page error(s):\n${[...new Set(uncaught)].join("\n")}`);
  process.exitCode = 1;
}
