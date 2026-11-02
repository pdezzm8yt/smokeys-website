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
 * a 2G connection, a film too slow to download (stills within seconds), a
 * connection that slows down after the early check (still the film),
 * rotation/resize, fast scrolling, autoplay blocked, 32:9, home link, and the
 * film's files cached for good (content-hashed names, immutable).
 * Exits with 1 if any page throws an uncaught error, logs an [intro] error,
 * ends a flow with the intro failed (data-intro-failed), or fails a check
 * (the film where it should play, the stills early where it can't, the film's
 * files cached for good); read the rest of the report for anything unexpected.
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "playwright-core";
const URL = process.argv.slice(2).find((a) => a.startsWith("http")) ?? "http://localhost:3100/";
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const desktop = { viewport: { width: 1280, height: 800 } };
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"] });
const results = {};
/** Uncaught page errors from every flow: any one fails the run. */
const uncaught = [];
/** Failed checks: any one fails the run. */
const failures = [];
const check = (name, ok, detail) => {
  if (!ok) failures.push(`${name}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  return ok;
};
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
    // ~8 Mbps: slow enough to Skip while the film loads, fast enough that it's worth the wait (INTRO.slowNet).
    await c.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1024 * 1024, uploadThroughput: 200 * 1024 });
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
  // The film was held back before its first byte: a slow start isn't a slow connection.
  check("1 the film after a slow start", readyState.film === "blob" && !readyState.still, readyState);
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
  const afterReady = await state(page);
  check("5 a slower connection still gets the film", afterReady.film === "blob" && !afterReady.still, afterReady);
  results["5 skip during loading (slow network)"] = { before, afterSkip, afterReady, errors }; await ctx.close(); }

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

// 15. A 2G connection (navigator.connection): the stills story at once, the film isn't downloaded.
{ const { ctx, page, errors } = await open({}, { before: (c, p) => p.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "connection", { configurable: true, get: () => ({ effectiveType: "2g", saveData: false }) });
  }) });
  await ready(page);
  const top = await state(page);
  const filmRequested = await page.evaluate(() => performance.getEntriesByType("resource").some((r) => /\/video\/intro\/.*\.(mp4|webm)$/.test(r.name)));
  await to(page, 1); await page.waitForTimeout(1200); const end = await state(page);
  check("15 2G: the stills at once, no film downloaded", top.still && top.film === "-" && !filmRequested, { top, filmRequested });
  check("15 2G: the story ends on the bus", end.h1 === 1 && end.ctasVis === "visible", end);
  results["15 2G connection"] = { top, filmRequested, end, errors }; await ctx.close(); }

// 16. A connection too slow for the film: ~400 kbps from the moment the film is requested (the page itself loads at full
//     speed: at 400 kbps throughout, its ~0.5 MB would meet the boot script's 12 s failsafe first). The stills tell the
//     story within seconds, not after INTRO.filmTimeoutMs (25 s), and the download is cancelled (one request, never finished).
{ let release; const held = new Promise((r) => (release = r));
  const filmFile = /\/video\/intro\/.*\.(mp4|webm)$/;
  const net = { requested: 0, finished: 0, failed: [] };
  const { ctx, page, errors } = await open({}, { before: (c, p) => {
    p.on("request", (r) => filmFile.test(r.url()) && net.requested++);
    p.on("requestfinished", (r) => filmFile.test(r.url()) && net.finished++);
    p.on("requestfailed", (r) => filmFile.test(r.url()) && net.failed.push(r.failure()?.errorText));
    return c.route(filmFile, async (r) => { await held; await r.continue(); });
  } });
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-intro-pending"), null, { timeout: 30000 });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 50 * 1024, uploadThroughput: 50 * 1024 });
  const t0 = Date.now(); release(); await ready(page);
  const waitedMs = Date.now() - t0;
  await page.waitForTimeout(400); const top = await state(page);
  await to(page, 1); await page.waitForTimeout(1200); const end = await state(page);
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
  const { ctx, page, errors } = await open({}, { before: (c) => c.route(/\/video\/intro\/.*\.(mp4|webm)$/, async (r) => { await held; await r.continue({ url: `http://127.0.0.1:${server.address().port}/${r.request().url().split("/").pop()}` }); }) });
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-intro-pending"), null, { timeout: 30000 });
  const t0 = Date.now(); release(); await ready(page); const waitedMs = Date.now() - t0;
  await page.waitForTimeout(400); const top = await state(page);
  server.close();
  const slowedAt = pace.atSwitch === null ? null : +(pace.atSwitch / pace.size).toFixed(2);
  // The case really happened: it slowed down well before the end, and the whole download took longer than the budget.
  check("17 the download slowed down early and took over 10 s", slowedAt !== null && slowedAt < 0.6 && pace.doneMs > 10000, { slowedAt, ...pace });
  check("17 slows down after the check: still the film", top.film === "blob" && !top.still && !pace.aborted, { waitedMs, top, aborted: pace.aborted });
  results["17 slows down after the check"] = { waitedMs, slowedAt, downloadMs: pace.doneMs, top, errors }; await ctx.close(); }

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

// G. The film's files are named after their content and cached for good: everything the page fetches from
//    /video/intro (stills, glows and the film: the desktop, phone and VP9 files) has a hashed name and an
//    immutable Cache-Control, and a second visit takes them from the cache (nothing downloaded or revalidated
//    again before the scroll unlocks). The second visit is on the phone: its film fits the test browser's
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
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
}
