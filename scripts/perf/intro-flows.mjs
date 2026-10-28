#!/usr/bin/env node
/**
 * Behaviour checks for the scroll-driven intro, in headless Chromium.
 *
 *   npm run test:intro -- [baseUrl]
 *
 * Needs a running production server (`npm run build && npx next start -p 3100`)
 * and Playwright's Chromium (`npx playwright-core install --only-shell chromium`).
 * Playwright's Chromium plays the H.264 files; flow 13 forces the VP9 fallback.
 * Prints one JSON report: first visit (loader, scroll held until the film
 * is in memory, scroll down and back up), unpinning, reduced motion, Skip
 * (also while loading, and before the page's JavaScript has run), deep links,
 * reload mid-intro, no JavaScript, keyboard, phone, a film that can't load,
 * rotation/resize, fast scrolling, autoplay blocked, 32:9, home link.
 * Exits with 1 if any page throws an uncaught error, logs an [intro] error, or
 * ends a flow with the intro failed (data-intro-failed); read the rest of the
 * report for anything unexpected.
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
  ctx.on("page", (p) => {
    p.on("pageerror", (e) => uncaught.push(e.message));
    p.on("console", (m) => m.type() === "error" && m.text().includes("[intro]") && uncaught.push(m.text()));
  });
  return ctx;
}
const state = (page) =>
  page.evaluate(() => {
    const h = document.documentElement;
    const s = document.querySelector("#top");
    const v = document.querySelector("[data-film]");
    const op = (sel) => { const e = document.querySelector(sel); return e ? +(+getComputedStyle(e).opacity).toFixed(2) : null; };
    const range = s.offsetHeight - innerHeight;
    return {
      progress: range > 0 ? +(scrollY / range).toFixed(3) : null,
      sectionScreens: +(s.offsetHeight / innerHeight).toFixed(2),
      loading: h.getAttribute("data-intro-loading"), pending: h.hasAttribute("data-intro-pending"), lock: h.hasAttribute("data-scroll-lock"),
      final: h.hasAttribute("data-intro-final"), still: h.hasAttribute("data-intro-still"), header: h.dataset.introStage ?? "(none)",
      film: v.hasAttribute("data-ready") ? (v.currentSrc.startsWith("blob:") ? "blob" : "network") : "-",
      failed: h.hasAttribute("data-intro-failed"),
      filmT: +v.currentTime.toFixed(2), filmVisible: getComputedStyle(v).visibility === "visible" && getComputedStyle(v).display !== "none",
      stills: ["start", "cover", "rest"].map((n) => op(`[data-still="${n}"]`)).join("/"),
      haze: op('[data-fx="haze"]'), h1: op("#intro-title"), ctas: op("[data-bus-ctas]"), ctasVis: getComputedStyle(document.querySelector("[data-bus-ctas]")).visibility,
      hint: op('[data-intro-hint="scroll"]'), banded: document.querySelector("[data-film-box]").dataset.banded ?? "-",
      focus: document.activeElement === document.body ? "BODY" : document.activeElement?.id || document.activeElement?.textContent?.trim().slice(0, 20),
      stageTop: Math.round(document.querySelector(".intro-stage").getBoundingClientRect().top),
      overflowX: document.documentElement.scrollWidth - innerWidth,
    };
  });
const to = (page, p) => page.evaluate((p) => { const s = document.querySelector("#top"); window.scrollTo({ top: p * (s.offsetHeight - innerHeight), behavior: "instant" }); }, p);
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
  if (gotoOpts.before) await gotoOpts.before(ctx, page);
  await page.goto(gotoOpts.url ?? URL, { waitUntil: gotoOpts.waitUntil ?? "load" });
  return { ctx, page, errors };
}
const ready = (page) => page.waitForFunction(() => !document.documentElement.hasAttribute("data-intro-pending") && !document.documentElement.hasAttribute("data-intro-loading"), null, { timeout: 90000 });

// 1. First visit: loader + scroll locked until the film is in memory, then scrubbed by the scroll, reversible.
//    The film's download is held back, so the lock is tested while it really holds (wheel, Space, PageDown).
{ let release; const held = new Promise((r) => (release = r));
  const { ctx, page, errors } = await open({}, { before: (c) => c.route(/\/video\/intro\/.*\.(mp4|webm)$/, async (r) => { await held; await r.continue(); }) });
  const atLoad = await state(page);
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-intro-pending"), null, { timeout: 30000 });
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, 600); await page.keyboard.press("Space"); await page.keyboard.press("PageDown"); await page.waitForTimeout(400);
  const lockedTry = { ...(await state(page)), scrollY: await page.evaluate(() => scrollY) };
  release(); await ready(page); await page.waitForTimeout(400);
  const readyState = await state(page);
  await page.mouse.move(640, 400);
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 200); await page.waitForTimeout(60); }
  await page.waitForTimeout(1200);
  const afterWheel = await state(page);
  await to(page, 1); await page.waitForTimeout(1400); const end = await state(page);
  await to(page, 0.5); await page.waitForTimeout(1400); const backToDust = await state(page);
  await to(page, 0); await page.waitForTimeout(1400); const backToTop = await state(page);
  results["1 first visit, scroll down & back up"] = { atLoad, lockedTry, readyState, afterWheel, end, backToDust, backToTop, errors }; await ctx.close(); }

// 2. Past the intro the stage unpins and the page scrolls on normally.
{ const { ctx, page, errors } = await open(); await ready(page);
  await page.evaluate(() => { const s = document.querySelector("#top"); window.scrollTo({ top: s.offsetHeight + 300, behavior: "instant" }); }); await page.waitForTimeout(800);
  const st = await state(page);
  const busSection = await page.evaluate(() => Math.round(document.querySelector("#bus").getBoundingClientRect().top));
  results["2 unpins after the intro"] = { stageTop: st.stageTop, header: st.header, busSectionTop: busSection, errors }; await ctx.close(); }

// 3. Reduced motion: stills (the film isn't downloaded), shorter scroll, same story.
{ const { ctx, page, errors } = await open({ reducedMotion: "reduce" }); await ready(page);
  const top = await state(page);
  await to(page, 0.45); await page.waitForTimeout(900); const mid = await state(page);
  await to(page, 1); await page.waitForTimeout(900); const end = await state(page);
  const filmRequested = await page.evaluate(() => performance.getEntriesByType("resource").some((r) => /\/video\/intro\/.*\.(mp4|webm)$/.test(r.name)));
  results["3 reduced motion"] = { top, mid, end, filmRequested, errors }; await ctx.close(); }

// 4. Skip: jumps to the end of the story with focus on the headline.
{ const { ctx, page, errors } = await open(); await ready(page);
  await page.getByRole("button", { name: "Skip intro" }).click(); await page.waitForTimeout(1500);
  results["4 skip"] = { ...(await state(page)), errors }; await ctx.close(); }

// 5. Skip while the film is still loading (slow network): finished hero, then the engine takes over.
{ const { ctx, page, errors } = await open({ slowNet: true }, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-intro-hint="skip"]'); await page.waitForFunction(() => document.documentElement.hasAttribute("data-intro-pending"), null, { timeout: 60000 });
  const before = await state(page);
  await page.getByRole("button", { name: "Skip intro" }).click(); await page.waitForTimeout(600);
  const afterSkip = await state(page);
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-intro-final") && !document.documentElement.hasAttribute("data-intro-pending"), null, { timeout: 120000 }); await page.waitForTimeout(1500);
  results["5 skip during loading (slow network)"] = { before, afterSkip, afterReady: await state(page), errors }; await ctx.close(); }

// 6. Deep link (#packages): no loader, header visible, intro at its end state.
{ const { ctx, page, errors } = await open({}, { url: `${URL}#packages` }); await page.waitForTimeout(3000);
  results["6 deep link"] = { ...(await state(page)), errors }; await ctx.close(); }

// 7. Reload while scrolled into the intro: no scroll lock, the film matches the scroll position.
{ const { ctx, page, errors } = await open(); await ready(page);
  await to(page, 0.3); await page.waitForTimeout(800);
  await page.reload({ waitUntil: "load" }); await page.waitForTimeout(3500);
  results["7 reload mid-intro"] = { ...(await state(page)), errors }; await ctx.close(); }

// 8. No JavaScript: the finished hero (the film's resting frame), no scroll story.
{ const { ctx, page, errors } = await open({ javaScriptEnabled: false }); await page.waitForTimeout(500);
  const st = await page.evaluate(() => {
    const css = (sel, p) => getComputedStyle(document.querySelector(sel))[p];
    const rest = document.querySelector('[data-still="rest"] img');
    return { sectionScreens: +(document.querySelector("#top").offsetHeight / innerHeight).toFixed(2), rest: css('[data-still="rest"]', "opacity"), film: css("[data-film]", "display"), h1: css("#intro-title", "opacity"), ctas: css("[data-bus-ctas]", "opacity"), restLoaded: rest.complete && rest.naturalWidth, loader: css("[data-intro-loader]", "visibility") };
  });
  results["8 no JavaScript"] = { ...st, errors }; await ctx.close(); }

// 9. Keyboard: Space scrolls the story; Tab reaches the CTAs only once they're visible.
//    At the top, every Tab stop up to "Skip intro" is recorded: none may be a (still hidden) CTA.
{ const { ctx, page, errors } = await open(); await ready(page);
  const stops = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => { const a = document.activeElement; return { label: a?.textContent?.trim().slice(0, 20) || a?.getAttribute("aria-label") || a?.tagName, inCtas: Boolean(a?.closest("[data-bus-ctas]")) }; });
    stops.push(stop);
    if (stop.label === "Skip intro") break;
  }
  const firstTab = { stops: stops.map((s) => s.label), ctaReachedWhileHidden: stops.some((s) => s.inCtas) };
  await page.evaluate(() => document.activeElement?.blur());
  for (let i = 0; i < 4; i++) { await page.keyboard.press("Space"); await page.waitForTimeout(250); }
  await page.waitForTimeout(1200); const afterSpace = await state(page);
  await to(page, 1); await page.waitForTimeout(1400);
  await page.evaluate(() => document.querySelector("#intro-title").focus()); await page.keyboard.press("Tab");
  results["9 keyboard"] = { firstTab, afterSpace: { progress: afterSpace.progress, filmT: afterSpace.filmT, ctasVis: afterSpace.ctasVis }, tabAfterHeadline: (await state(page)).focus, errors }; await ctx.close(); }

// 10. Phone: the same story full-screen (no band), no horizontal overflow.
{ const { ctx, page, errors } = await open(phone); await ready(page);
  const file = await page.evaluate(() => performance.getEntriesByType("resource").map((r) => r.name).filter((n) => /\/video\/intro\/.*\.(mp4|webm)$/.test(n)).map((n) => n.split("/").pop()));
  await to(page, 0.5); await page.waitForTimeout(1300); const dust = await state(page);
  await to(page, 1); await page.waitForTimeout(1300); const end = await state(page);
  results["10 phone"] = { file, dust: { filmT: dust.filmT, haze: dust.haze, banded: dust.banded }, end: { filmT: end.filmT, h1: end.h1, ctas: end.ctas, overflowX: end.overflowX }, errors }; await ctx.close(); }

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
  release(); await page.waitForLoadState("load");
  // The engine has taken over once the finished hero is gone and the film is in memory.
  const tookOver = await page.waitForFunction(() => { const h = document.documentElement; return !h.hasAttribute("data-intro-final") && !h.hasAttribute("data-intro-pending") && document.querySelector("[data-film]").hasAttribute("data-ready"); }, null, { timeout: 60000 }).then(() => true, () => false);
  await page.waitForTimeout(800);
  results["11 skip before JavaScript"] = { before: { loading: before.loading, lock: before.lock }, afterSkip, tookOver, afterJs: await state(page), errors }; await ctx.close(); }

// 12. The film can't load (its files fail): the stills tell the story on the shorter scroll.
{ const { ctx, page, errors } = await open({}, { before: (c) => c.route(/\/video\/intro\/.*\.(mp4|webm)$/, (r) => r.abort()) }); await ready(page);
  const top = await state(page);
  await to(page, 1); await page.waitForTimeout(1200);
  results["12 film fails to load"] = { top, end: await state(page), errors }; await ctx.close(); }

// 13. A browser that can't play the H.264 files: the VP9 version is the one fetched, and it scrubs.
{ const { ctx, page, errors } = await open({}, { before: (c, p) => p.addInitScript(() => {
    const orig = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function (type) { return type.startsWith("video/mp4") ? "" : orig.call(this, type); };
  }) });
  await ready(page);
  const files = await page.evaluate(() => performance.getEntriesByType("resource").map((r) => r.name).filter((n) => /\/video\/intro\/.*\.(mp4|webm)$/.test(n)).map((n) => n.split("/").pop()));
  await to(page, 0.5); await page.waitForTimeout(1400); const dust = await state(page);
  await to(page, 1); await page.waitForTimeout(1400); const end = await state(page);
  results["13 VP9 fallback"] = { files, dust: { film: dust.film, filmT: dust.filmT }, end: { filmT: end.filmT, h1: end.h1 }, errors }; await ctx.close(); }

// 14. Skip while loading, then the film can't load: the finished hero stays where the visitor is
//     (the intro getting shorter for the stills must not throw them 3 screens down the page).
{ let fail; const failNow = new Promise((r) => (fail = r));
  const { ctx, page, errors } = await open({}, { waitUntil: "domcontentloaded", before: (c) => c.route(/\/video\/intro\/.*\.(mp4|webm)$/, async (r) => { await failNow; await r.abort(); }) });
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-intro-pending"), null, { timeout: 60000 });
  await page.getByRole("button", { name: "Skip intro" }).click(); await page.waitForTimeout(500);
  const afterSkip = await state(page);
  fail(); await ready(page); await page.waitForTimeout(1200);
  const after = await state(page);
  const h1Top = await page.evaluate(() => Math.round(document.querySelector("#intro-title").getBoundingClientRect().top));
  results["14 skip then the film fails"] = { afterSkip: { progress: afterSkip.progress, final: afterSkip.final, h1: afterSkip.h1 }, after: { progress: after.progress, still: after.still, h1: after.h1, ctasVis: after.ctasVis, focus: after.focus }, h1Top, errors }; await ctx.close(); }

const film = (page) => page.evaluate(() => {
  const v = document.querySelector("[data-film]");
  const hdr = document.querySelector("[data-site-header]");
  return { header: document.documentElement.dataset.introStage, headerVis: getComputedStyle(hdr).visibility, filmT: +v.currentTime.toFixed(2), playing: !v.paused, banded: document.querySelector("[data-film-box]").dataset.banded ?? "-" };
});

// A. Rotate / resize after scrolling past the intro: header stays, nothing replays.
{ const ctx = await context(phone);
  const page = await ctx.newPage(); await page.goto(URL, { waitUntil: "load" }); await ready(page);
  await page.evaluate(() => { const s = document.querySelector("#top"); window.scrollTo({ top: s.offsetHeight + 400, behavior: "instant" }); }); await page.waitForTimeout(1500);
  const before = await film(page);
  await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(2000);
  const afterRotate = await film(page);
  await page.evaluate(() => window.scrollBy(0, 300)); await page.waitForTimeout(800);
  results["A rotate below intro"] = { before, afterRotate, afterScroll: await film(page) }; await ctx.close(); }

// B. Desktop resize while parked at the branding: the film stays at rest.
{ const ctx = await context(desktop);
  const page = await ctx.newPage(); await page.goto(URL, { waitUntil: "load" }); await ready(page);
  await to(page, 0.9); await page.waitForTimeout(1500); const before = await film(page);
  await page.setViewportSize({ width: 1180, height: 760 }); await page.waitForTimeout(1500);
  results["B resize at branding"] = { before, after: await film(page) }; await ctx.close(); }

// C. Fast wheel scroll to the end: the film is scrubbed (monotonic, no snap back).
{ const ctx = await context(desktop);
  const page = await ctx.newPage(); await page.goto(URL, { waitUntil: "load" }); await ready(page);
  await page.mouse.move(640, 400);
  await page.evaluate(() => { window.__film = []; const v = document.querySelector("[data-film]"); const f = () => { window.__film.push(+v.currentTime.toFixed(2)); if (window.__film.length < 400) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(60); }
  await page.waitForTimeout(1500);
  const series = await page.evaluate(() => window.__film);
  const drops = series.slice(1).filter((t, i) => t < series[i] - 0.01).length;
  const maxJump = Math.max(...series.slice(1).map((t, i) => t - series[i]));
  results["C fast scroll"] = { final: await film(page), backwardsSteps: drops, biggestForwardStepSec: +maxJump.toFixed(2) }; await ctx.close(); }

// D. Autoplay blocked (NotAllowedError): the film is only ever seeked, so it still follows the scroll.
{ const ctx = await context(desktop);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () { return Promise.reject(new DOMException("blocked", "NotAllowedError")); };
  });
  await page.goto(URL, { waitUntil: "load" }); await ready(page); await page.waitForTimeout(500);
  const idle = await state(page);
  await to(page, 0.5); await page.waitForTimeout(1400); const dust = await film(page);
  await to(page, 1); await page.waitForTimeout(1400);
  results["D autoplay blocked"] = { idle: { film: idle.film, filmT: idle.filmT, still: idle.still }, dust, end: await film(page) }; await ctx.close(); }

// E. 32:9 ultrawide: the portrait film is a feathered band, never cropped below its minVisible.
{ const ctx = await context({ viewport: { width: 3840, height: 1080 } });
  const page = await ctx.newPage(); await page.goto(URL, { waitUntil: "load" }); await ready(page);
  const box = await page.evaluate(() => { const b = document.querySelector("[data-film-box]"); return { w: b.offsetWidth, h: b.offsetHeight, top: b.offsetTop, left: b.offsetLeft, banded: b.dataset.banded ?? "-" }; });
  results["E 32:9"] = { box }; await ctx.close(); }

// F. Header home link → the film's resting point.
{ const ctx = await context(desktop);
  const page = await ctx.newPage(); await page.goto(`${URL}#faq`, { waitUntil: "load" }); await page.waitForTimeout(2500);
  await page.evaluate(() => document.documentElement.style.scrollBehavior = "auto");
  await page.click('[data-site-header] a[aria-label$="home"]'); await page.waitForTimeout(2000);
  const p = await page.evaluate(() => { const s = document.querySelector("#top"); return +(scrollY / (s.offsetHeight - innerHeight)).toFixed(3); });
  results["F home link"] = { progress: p, ...(await film(page)), ctas: await page.evaluate(() => getComputedStyle(document.querySelector("[data-bus-ctas]")).visibility) }; await ctx.close(); }

await browser.close();
console.log(JSON.stringify(results, null, 1));
// No flow sets out to break the engine: any flow that ended with the intro failed (finished hero instead of the film) is a failure.
const failedFlows = Object.entries(results).filter(([, r]) => JSON.stringify(r).includes('"failed":true')).map(([name]) => name);
if (failedFlows.length) {
  console.error(`\nThe intro failed (data-intro-failed) in: ${failedFlows.join(", ")}`);
  process.exitCode = 1;
}
if (uncaught.length) {
  console.error(`\n${uncaught.length} uncaught page error(s):\n${[...new Set(uncaught)].join("\n")}`);
  process.exitCode = 1;
}
