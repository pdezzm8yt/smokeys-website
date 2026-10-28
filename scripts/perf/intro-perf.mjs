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
 * For each device (desktop 1280x800, phone 390x844 touch) and CPU throttle:
 *   - waits until the film is in memory (the scroll hint stops showing progress),
 *   - scrolls the whole intro DOWN at a steady speed, then back UP, recording
 *     every animation frame, and reports FPS, slow frames (>25 ms), worst frame
 *     and long tasks per stretch of the story (by scroll progress), plus how
 *     many film frames per second reached the screen (requestVideoFrameCallback).
 * With --frames it also saves a filmstrip at fixed scroll positions (down, then
 * back up), once the scrubbed timeline has caught up, plus image fidelity.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

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
/** Scroll progress through the intro (0 = top, 1 = the stage unpins). */
const FILMSTRIP_AT = [0, 0.07, 0.13, 0.19, 0.26, 0.35, 0.44, 0.52, 0.58, 0.61, 0.66, 0.72, 0.8, 0.86, 0.93, 1];
const FILMSTRIP_BACK = [0.6, 0.45, 0.16, 0.02];
const STRETCHES = [
  ["run", 0, 0.25],
  ["tunnel", 0.25, 0.42],
  ["dust + swap", 0.42, 0.56],
  ["headlights + bus", 0.56, 0.78],
  ["branding + CTAs", 0.78, 1.01],
];

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

/** Scroll to a progress through the intro and wait for the scrubbed timeline to catch up. */
async function scrollTo(page, p) {
  await page.evaluate((p) => {
    const s = document.querySelector("#top");
    window.scrollTo(0, p * (s.offsetHeight - innerHeight));
  }, p);
  await page.waitForTimeout(1300);
}

/** Scroll steadily from one progress to another over `ms`, recording every frame. */
function sweep(page, from, to, ms) {
  return page.evaluate(
    ([from, to, ms]) =>
      new Promise((resolve) => {
        const s = document.querySelector("#top");
        const range = s.offsetHeight - innerHeight;
        const frames = [];
        const longTasks = [];
        // Film frames that actually reached the screen while scrubbing.
        const v = document.querySelector("[data-film]");
        let filmFrames = 0;
        let counting = true;
        const onFrame = () => { filmFrames++; if (counting) v.requestVideoFrameCallback(onFrame); };
        if (v?.requestVideoFrameCallback) v.requestVideoFrameCallback(onFrame);
        const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => longTasks.push(Math.round(e.duration))));
        po.observe({ type: "longtask", buffered: false });
        const t0 = performance.now();
        const step = (t) => {
          const k = Math.min(1, (t - t0) / ms);
          const p = from + (to - from) * k;
          window.scrollTo(0, p * range);
          frames.push([t, p]);
          if (k < 1) requestAnimationFrame(step);
          else setTimeout(() => { counting = false; po.disconnect(); resolve({ frames, longTasks, filmFps: +((1000 * filmFrames) / (performance.now() - t0)).toFixed(1) }); }, 50);
        };
        requestAnimationFrame(step);
      }),
    [from, to, ms],
  );
}

function summarize({ frames, longTasks, filmFps }) {
  const deltas = frames.slice(1).map(([t, p], i) => [t - frames[i][0], p]);
  const avg = deltas.reduce((a, [d]) => a + d, 0) / Math.max(1, deltas.length);
  const sorted = deltas.map(([d]) => d).sort((a, b) => a - b);
  return {
    fps: +(1000 / avg).toFixed(1),
    filmFps,
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
  const down = summarize(await sweep(page, 0, 1, 9000));
  await page.waitForTimeout(1200);
  const up = summarize(await sweep(page, 1, 0, 9000));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await context.close();
  return { device, throttle: `${throttle}x`, loaderMs, readyMs, film, down, up, horizontalOverflowPx: overflow, errors: errors.length ? errors : undefined };
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
        haze: op('[data-fx="haze"]'),
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
    await snap(`down-${p.toFixed(2)}`);
  }
  for (const p of FILMSTRIP_BACK) {
    await scrollTo(page, p);
    await snap(`up-${p.toFixed(2)}`);
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
