#!/usr/bin/env node
/**
 * Scroll-driven intro: smoothness + continuity check in headless Chromium.
 *
 *   npm run perf:intro -- [baseUrl] [--frames] [--gpu] [--device=phone] [--throttle=1,4]
 *
 * Needs a running production server (`npm run build && npx next start -p 3100`)
 * and Playwright's Chromium (`npx playwright-core install --only-shell chromium`).
 * Playwright's Chromium has no H.264, so it exercises the WebM versions; the
 * MP4 versions are what Safari and branded Chrome pick.
 *
 * For each device (desktop 1280x800, phone 390x844 touch) and CPU throttle:
 *   - waits until every clip is in memory (the scroll hint stops showing progress),
 *   - scrolls the whole intro DOWN at a steady speed, then back UP, recording
 *     every animation frame, and reports FPS, slow frames (>25 ms), worst frame
 *     and long tasks per stretch of the story (by scroll progress).
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
  ["real + camera", 0, 0.1],
  ["real → cartoon", 0.1, 0.3],
  ["cartoon run", 0.3, 0.42],
  ["dust build + swap", 0.42, 0.63],
  ["clear + bus", 0.63, 0.81],
  ["branding + CTAs", 0.81, 1.01],
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
  // Ready = loader gone and every clip in memory (scroll unlocked).
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-intro-loading"), null, { timeout: 60000 });
  const loaderMs = Date.now() - t0;
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-intro-pending"), null, { timeout: 60000 });
  const readyMs = Date.now() - t0;
  const clips = await page.evaluate(() =>
    [...document.querySelectorAll("[data-clip]")].map((v) => `${v.dataset.clip}:${v.readyState >= 2 ? "ready" : "NOT READY"}`),
  );
  await page.waitForTimeout(400);
  return { context, page, errors, loaderMs, readyMs, clips };
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
        const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => longTasks.push(Math.round(e.duration))));
        po.observe({ type: "longtask", buffered: false });
        const t0 = performance.now();
        const step = (t) => {
          const k = Math.min(1, (t - t0) / ms);
          const p = from + (to - from) * k;
          window.scrollTo(0, p * range);
          frames.push([t, p]);
          if (k < 1) requestAnimationFrame(step);
          else setTimeout(() => (po.disconnect(), resolve({ frames, longTasks })), 50);
        };
        requestAnimationFrame(step);
      }),
    [from, to, ms],
  );
}

function summarize({ frames, longTasks }) {
  const deltas = frames.slice(1).map(([t, p], i) => [t - frames[i][0], p]);
  const avg = deltas.reduce((a, [d]) => a + d, 0) / Math.max(1, deltas.length);
  const sorted = deltas.map(([d]) => d).sort((a, b) => a - b);
  return {
    fps: +(1000 / avg).toFixed(1),
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
  const { context, page, errors, loaderMs, readyMs, clips } = await openIntro(browser, device, throttle);
  const down = summarize(await sweep(page, 0, 1, 9000));
  await page.waitForTimeout(1200);
  const up = summarize(await sweep(page, 1, 0, 9000));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await context.close();
  return { device, throttle: `${throttle}x`, loaderMs, readyMs, clips, down, up, horizontalOverflowPx: overflow, errors: errors.length ? errors : undefined };
}

async function filmstrip(browser, device) {
  const { context, page, errors, clips } = await openIntro(browser, device, 1);
  const dir = path.join(outDir, `filmstrip-${device}`);
  rmSync(dir, { recursive: true, force: true }); // frames are named by position: never mix runs
  mkdirSync(dir, { recursive: true });
  const states = [];
  const snap = async (label) => {
    const st = await page.evaluate(() => {
      const op = (s) => +(+getComputedStyle(document.querySelector(s)).opacity).toFixed(2);
      const v = (s) => document.querySelector(`[data-clip="${s}"]`);
      return {
        real: op('[data-scene="real"]'),
        cartoon: op('[data-scene="cartoon"]'),
        bus: op('[data-scene="bus"]'),
        haze: op('[data-fx="haze"]'),
        dust: op("[data-dust]"),
        playing: ["real", "cartoon", "dust", "bus"].filter((s) => v(s) && !v(s).paused),
        dustT: +(v("dust")?.currentTime ?? 0).toFixed(2),
        busT: +(v("bus")?.currentTime ?? 0).toFixed(2),
        header: document.documentElement.dataset.introStage,
        ctasInert: document.querySelector("[data-bus-ctas]")?.inert,
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
  // Fidelity: every framed clip keeps its own aspect ratio (never stretched).
  const fidelity = await page.evaluate(() =>
    [...document.querySelectorAll("[data-clip-box]")].map((box) => {
      const v = box.querySelector("video");
      return { clip: box.dataset.clipBox, box: +(box.offsetWidth / box.offsetHeight).toFixed(3), video: v?.videoWidth ? +(v.videoWidth / v.videoHeight).toFixed(3) : null };
    }),
  );
  await context.close();
  return { device, dir, clips, fidelity, states, errors };
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
