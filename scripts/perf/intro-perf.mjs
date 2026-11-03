#!/usr/bin/env node
/**
 * Scroll-driven intro: smoothness + continuity check in headless Chromium.
 *
 *   npm run perf:intro -- [baseUrl] [--frames] [--gpu] [--device=phone] [--throttle=1,4]
 *
 * Needs a running production server (`npm run build && npx next start -p 3100`)
 * and Playwright's Chromium (`npx playwright-core install --only-shell chromium`).
 * It scrubs whichever file the page picks for that screen (the phone version
 * on the phone profile).
 *
 * Both profiles (desktop 1280x800, phone 390x844 touch) run the world SIDEWAYS
 * (html[data-axis="x"]): the page itself never scrolls, the world's own scroll
 * container ([data-world]) does, so that's what is driven (scrollLeft; a column,
 * on a screen too short for sideways, is driven by the page's scroll). The
 * tunnel scene is the first stretch of the world: its "progress" is the place
 * along its range (the section's length less the stage's), 0 at the start, 1
 * where the stage starts moving off.
 *
 * For each device and CPU throttle:
 *   - waits until the film is in memory (the scroll hint stops showing progress),
 *   - sweeps the tunnel scene FORWARD at a steady speed, then BACK (a
 *     programmatic jump back is still possible: focus, find-in-page), then,
 *     sideways, the NEXT LAP: from the footer (the tunnel round at the end of
 *     the world, src/components/world/world-scroll.ts) across the join and on
 *     through the next lap's tunnel, recording every animation frame, and
 *     reports FPS, slow frames (>25 ms), worst frame and long tasks per stretch
 *     of the story (by progress, from the film's beats), plus how many DISTINCT
 *     film frames per second reached the screen (requestVideoFrameCallback
 *     media times; a sweep can show at most the film's frame count), and how
 *     far the world actually moved (a sweep that moved nothing measures nothing).
 * With --frames it also saves a filmstrip at fixed progress (forward, then
 * back), once the scrubbed timeline has caught up, plus image fidelity.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { INTRO } from "../../src/components/intro/intro-config.ts";

const args = process.argv.slice(2);
const baseUrl = args.find((a) => a.startsWith("http")) ?? "http://localhost:3100/";
const wantFrames = args.includes("--frames");
const outDir = path.resolve(".cache/perf");
mkdirSync(outDir, { recursive: true });

const DEVICES = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const onlyDevice = args.find((a) => a.startsWith("--device="))?.split("=")[1];
const THROTTLES = (args.find((a) => a.startsWith("--throttle="))?.split("=")[1] ?? "1,4,6").split(",").map(Number);
/** Progress through the tunnel scene (0 = its start, 1 = its stage starts moving off). */
const FILMSTRIP_AT = [0, 0.07, 0.13, 0.19, 0.26, 0.35, 0.44, 0.52, 0.58, 0.61, 0.66, 0.72, 0.8, 0.86, 0.93, 1];
const FILMSTRIP_BACK = [0.6, 0.45, 0.16, 0.02];
/** The story's stretches by progress, laid out as the engine does (intro-engine.ts: storyFor; timeline units = scroll). */
const T = INTRO.timeline;
const units = { tunnel: T.run, dark: T.run + T.enter, lights: T.run + T.enter + T.black, rest: T.run + T.enter + T.black + T.lights + T.out };
const total = units.rest + T.brandAfterRest + T.ctaAfterBrand + T.ctaLength + T.travel;
const STRETCHES = [
  ["run", 0, units.tunnel / total],
  ["into the tunnel", units.tunnel / total, units.dark / total],
  ["darkness + swap", units.dark / total, units.lights / total],
  ["headlights + bus", units.lights / total, units.rest / total],
  ["branding + CTAs", units.rest / total, 1.01],
];
/**
 * In the page: the tunnel scene's measures and how to put the world at a place (either layout). Sideways the
 * world's lap position a = (tunnel round at the end ? its width : 0) + scrollLeft; `p` is progress through the
 * tunnel scene in lap `lap` (0 this one, 1 the next: written past the join, the world comes round into it).
 */
const WORLD = `(() => {
  const x = document.documentElement.dataset.axis === "x";
  const w = document.querySelector("[data-world]");
  const s = document.querySelector("#top");
  const lapLength = () => [...w.children].reduce((sum, c) => sum + c.offsetWidth, 0);
  const range = () => (x ? s.offsetWidth - w.clientWidth : s.offsetHeight - innerHeight);
  const round = () => s.hasAttribute("data-round");
  const a = () => (round() ? s.offsetWidth : 0) + w.scrollLeft;
  const put = (pos) => {
    if (!x) return window.scrollTo(0, pos);
    // In the next lap (pos past the lap's length): while the tunnel is still round at the end, the place past the
    // join (the world wraps once it gets there); once it has wrapped, the place in the new lap.
    const L = lapLength();
    if (round()) w.scrollTo({ left: pos - s.offsetWidth, behavior: "instant" });
    else w.scrollTo({ left: pos >= L ? pos - L : pos, behavior: "instant" });
  };
  const at = () => (x ? a() : scrollY);
  return { x, w, s, lapLength, range, round, at, put };
})()`;

async function openIntro(browser, device, throttle) {
  const context = await browser.newContext(DEVICES[device]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  const t0 = Date.now();
  await page.goto(baseUrl, { waitUntil: "load" });
  // Ready = loader gone and the film in memory (scroll unlocked).
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-intro-loading"), null, { timeout: 60000 });
  const loaderMs = Date.now() - t0;
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-intro-pending"), null, { timeout: 60000 });
  const readyMs = Date.now() - t0;
  const film = await page.evaluate(() => {
    const v = document.querySelector("[data-film]");
    const file = performance.getEntriesByType("resource").map((r) => r.name).filter((n) => /\/video\/intro\/.*\.(mp4|webm)$/.test(n)).pop()?.split("/").pop();
    return `${file ?? "?"} ${v.readyState >= 2 ? "ready" : "NOT READY"} ${v.videoWidth}x${v.videoHeight}`;
  });
  // Programmatic scrolling must be instant (the page smooth-scrolls in-page links).
  await page.evaluate(() => (document.documentElement.style.scrollBehavior = "auto"));
  await page.waitForTimeout(400);
  return { context, page, errors, loaderMs, readyMs, film };
}

/** Put the world at a progress through the tunnel scene and wait for the scrubbed timeline to catch up. */
async function scrollTo(page, p) {
  await page.evaluate(([p, WORLD]) => {
    const world = (0, eval)(WORLD);
    world.put(p * world.range());
  }, [p, WORLD]);
  await page.waitForTimeout(1300);
}

/**
 * Move the world steadily from one progress to another over `ms` (in lap `fromLap` → `toLap`: 0 this one, 1 the
 * next; -x is that many ranges before the tunnel's start in the next lap), recording every frame.
 */
function sweep(page, from, to, ms, lap = 0) {
  return page.evaluate(
    ([from, to, ms, lap, WORLD]) =>
      new Promise((resolve) => {
        const world = (0, eval)(WORLD);
        const range = world.range();
        const base = lap * world.lapLength();
        const startAt = world.at();
        const frames = [];
        const longTasks = [];
        // Film frames that reached the screen while scrubbing: DISTINCT frames (by their media time; a seek that
        // lands on the frame already shown presents it again), and raw presentations.
        const v = document.querySelector("[data-film]");
        const distinct = new Set();
        let presented = 0;
        let counting = true;
        const onFrame = (_now, md) => { presented++; distinct.add(md.mediaTime.toFixed(3)); if (counting) v.requestVideoFrameCallback(onFrame); };
        if (v?.requestVideoFrameCallback) v.requestVideoFrameCallback(onFrame);
        const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => longTasks.push(Math.round(e.duration))));
        po.observe({ type: "longtask", buffered: false });
        const t0 = performance.now();
        let moved = 0;
        let last = world.at();
        const step = (t) => {
          const k = Math.min(1, (t - t0) / ms);
          const p = from + (to - from) * k;
          // How far the world really moved since the last frame (a wrap into the next lap counts as going on).
          const now = world.at();
          const d = now - last;
          moved += Math.abs(d) > world.lapLength() / 2 ? d + Math.sign(-d) * world.lapLength() : d;
          last = now;
          world.put(base + p * range);
          frames.push([t, p]);
          if (k < 1) requestAnimationFrame(step);
          else setTimeout(() => { counting = false; po.disconnect(); const secs = (performance.now() - t0) / 1000; resolve({ frames, longTasks, filmFps: +(distinct.size / secs).toFixed(1), filmFrames: distinct.size, presentationsPerSec: +(presented / secs).toFixed(1), movedPx: Math.round(moved + (world.at() - last)), fromPx: Math.round(startAt), toPx: Math.round(world.at()), axis: world.x ? "x" : "y", round: world.round() }); }, 50);
        };
        requestAnimationFrame(step);
      }),
    [from, to, ms, lap, WORLD],
  );
}

function summarize({ frames, longTasks, filmFps, filmFrames, presentationsPerSec, movedPx, axis }) {
  const deltas = frames.slice(1).map(([t, p], i) => [t - frames[i][0], p]);
  const avg = deltas.reduce((a, [d]) => a + d, 0) / Math.max(1, deltas.length);
  const sorted = deltas.map(([d]) => d).sort((a, b) => a - b);
  return {
    axis,
    movedPx,
    fps: +(1000 / avg).toFixed(1),
    filmFps,
    filmFrames,
    presentationsPerSec,
    slowPct: +((100 * deltas.filter(([d]) => d > 25).length) / Math.max(1, deltas.length)).toFixed(1),
    worstMs: Math.round(Math.max(...deltas.map(([d]) => d))),
    p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
    longTasks,
    stretches: Object.fromEntries(
      STRETCHES.map(([name, a, b]) => {
        const ds = deltas.filter(([, p]) => p >= a && p < b).map(([d]) => d);
        return [name, `${Math.round((100 * ds.filter((d) => d > 25).length) / Math.max(1, ds.length))}% slow, worst ${Math.round(Math.max(0, ...ds))}ms`];
      }),
    ),
  };
}

async function measure(browser, device, throttle) {
  const { context, page, errors, loaderMs, readyMs, film } = await openIntro(browser, device, throttle);
  const forward = summarize(await sweep(page, 0, 1, 9000));
  await page.waitForTimeout(1200);
  const back = summarize(await sweep(page, 1, 0, 9000));
  // Sideways: round the loop. To the footer's start (the tunnel scene goes round to the end of the world, ahead, and
  // its timeline back to its start, off screen), then on across the join and through the next lap's tunnel.
  let nextLap;
  const geo = await page.evaluate((WORLD) => { const world = (0, eval)(WORLD); return { x: world.x, L: world.lapLength(), F: document.querySelector("#footer").offsetWidth, range: world.range() }; }, WORLD);
  if (geo.x) {
    await page.evaluate(([WORLD, at]) => (0, eval)(WORLD).put(at), [WORLD, geo.L - geo.F]);
    await page.waitForTimeout(1300);
    nextLap = summarize(await sweep(page, -geo.F / geo.range, 1, 9000 * (1 + geo.F / geo.range), 1));
    nextLap.wrapped = await page.evaluate((WORLD) => !(0, eval)(WORLD).round(), WORLD);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await context.close();
  return { device, throttle: `${throttle}x`, loaderMs, readyMs, film, forward, back, nextLap, horizontalOverflowPx: overflow, errors: errors.length ? errors : undefined };
}

async function filmstrip(browser, device) {
  const { context, page, errors, film } = await openIntro(browser, device, 1);
  const dir = path.join(outDir, `filmstrip-${device}`);
  rmSync(dir, { recursive: true, force: true }); // frames are named by position: never mix runs
  mkdirSync(dir, { recursive: true });
  const states = [];
  const snap = async (label) => {
    const st = await page.evaluate(() => {
      const op = (s) => +(+getComputedStyle(document.querySelector(s)).opacity).toFixed(2);
      return {
        filmT: +document.querySelector("[data-film]").currentTime.toFixed(2),
        dark: op('[data-fx="dark"]'),
        camera: getComputedStyle(document.querySelector("[data-camera]")).transform,
        glows: ["start", "tunnel", "cover", "headlights", "rest"].map((n) => op(`[data-glow="${n}"]`)).join("/"),
        caption: op("[data-caption]"),
        h1: op("#intro-title"),
        header: document.documentElement.dataset.introStage,
        ctas: getComputedStyle(document.querySelector("[data-bus-ctas]")).visibility,
      };
    });
    states.push({ at: label, ...st });
    await page.screenshot({ path: path.join(dir, `${String(states.length).padStart(2, "0")}-${label}.jpg`), type: "jpeg", quality: 70 });
  };
  for (const p of FILMSTRIP_AT) {
    await scrollTo(page, p);
    await snap(`fwd-${p.toFixed(2)}`);
  }
  for (const p of FILMSTRIP_BACK) {
    await scrollTo(page, p);
    await snap(`back-${p.toFixed(2)}`);
  }
  // Fidelity: the framed film keeps its own aspect ratio (never stretched).
  const fidelity = await page.evaluate(() => {
    const box = document.querySelector("[data-film-box]");
    const v = box.querySelector("video");
    return { box: +(box.offsetWidth / box.offsetHeight).toFixed(3), video: v?.videoWidth ? +(v.videoWidth / v.videoHeight).toFixed(3) : null, banded: box.dataset.banded ?? "-" };
  });
  await context.close();
  return { device, dir, film, fidelity, states, errors };
}

const useGpu = args.includes("--gpu");
const browser = await chromium.launch(useGpu ? { args: ["--use-angle=metal", "--enable-gpu-rasterization", "--ignore-gpu-blocklist", "--enable-zero-copy"] } : {});
const results = [];
try {
  if (wantFrames) for (const d of Object.keys(DEVICES)) if (!onlyDevice || d === onlyDevice) results.push(await filmstrip(browser, d));
  for (const d of Object.keys(DEVICES)) {
    if (onlyDevice && d !== onlyDevice) continue;
    for (const t of THROTTLES) results.push(await measure(browser, d, t));
  }
} finally {
  await browser.close();
}
writeFileSync(path.join(outDir, "intro-perf.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
