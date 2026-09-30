#!/usr/bin/env node
/**
 * Intro smoothness + continuity check in headless Chromium.
 *
 *   npm run perf:intro -- [baseUrl] [--frames]
 *
 * Needs a running server (production build recommended: `npm run build && npm start`)
 * and Playwright's Chromium (`npx playwright-core install --only-shell chromium`).
 *
 * For each device (desktop 1280x800, phone 390x844 touch) and CPU throttle (1x, 4x, 6x):
 *   - waits for the branded loader to finish (all intro assets decoded),
 *   - taps/clicks to start, records every animation frame until the CTAs land,
 *   - reports FPS, dropped frames (>1.5x the 16.7 ms budget), worst frame, long tasks,
 *     and how long the whole shot took (GSAP is time-based, so it should stay on schedule).
 * With --frames it also saves a filmstrip of screenshots through the shot (unthrottled only).
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const baseUrl = args.find((a) => a.startsWith("http")) ?? "http://localhost:3100/";
const wantFrames = args.includes("--frames");
const injectCss = args.find((a) => a.startsWith("--css="))?.slice(6);
const outDir = path.resolve(".cache/perf");
mkdirSync(outDir, { recursive: true });

const DEVICES = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const onlyDevice = args.find((a) => a.startsWith("--device="))?.split("=")[1];
const THROTTLES = (args.find((a) => a.startsWith("--throttle="))?.split("=")[1] ?? "1,4,6").split(",").map(Number);
const FILMSTRIP_AT = [0.15, 0.4, 0.6, 0.85, 1.4, 2.2, 2.9, 3.3, 3.6, 3.9, 4.3, 4.8, 5.6, 6.3, 7.2];

async function openIntro(browser, device, throttle) {
  const dpr = Number(args.find((a) => a.startsWith("--dpr="))?.split("=")[1]) || undefined;
  const vp = args.find((a) => a.startsWith("--viewport="))?.split("=")[1]?.split("x").map(Number);
  const mobileFlag = args.find((a) => a.startsWith("--mobile="))?.split("=")[1];
  const context = await browser.newContext({
    ...DEVICES[device],
    ...(dpr ? { deviceScaleFactor: dpr } : {}),
    ...(vp ? { viewport: { width: vp[0], height: vp[1] } } : {}),
    ...(mobileFlag ? { isMobile: mobileFlag === "1", hasTouch: mobileFlag === "1" } : {}),
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  const t0 = Date.now();
  await page.goto(baseUrl, { waitUntil: "load" });
  if (injectCss) await page.addStyleTag({ content: injectCss }); // A/B experiments: --css="selector{...}"
  // Ready = loader gone (every intro asset decoded) and the prompt visible.
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-intro-loading"), null, { timeout: 30000 });
  const loaderMs = Date.now() - t0;
  const renderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
  });
  console.error(`[${device} ${throttle}x] renderer: ${renderer}`);
  await page.waitForTimeout(600); // let the idle loops settle
  return { context, page, errors, loaderMs };
}

async function tap(page, device) {
  const box = await page.locator("#top").boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.35;
  if (device === "phone") await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function measure(browser, device, throttle) {
  const { context, page, errors, loaderMs } = await openIntro(browser, device, throttle);
  await page.evaluate(() => {
    window.__perf = { frames: [], longTasks: [], start: 0, end: 0 };
    new PerformanceObserver((list) => {
      // [ms after the tap, duration]: where in the shot each long task landed.
      for (const e of list.getEntries()) window.__perf.longTasks.push([Math.round(e.startTime - window.__perf.start), Math.round(e.duration)]);
    }).observe({ type: "longtask", buffered: false });
    const loop = (t) => {
      window.__perf.frames.push(t);
      if (!window.__perf.end) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    // "Landed" = the CTAs are fully shown (last beat of the master timeline).
    const ctas = document.querySelector("[data-bus-ctas]");
    const watch = () => {
      if (window.__perf.start && ctas && getComputedStyle(ctas).opacity === "1" && document.querySelector("#top")?.dataset.stage === "bus") {
        window.__perf.end = performance.now();
      } else requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  await page.evaluate(() => (window.__perf.start = performance.now()));
  await tap(page, device);
  await page.waitForFunction(() => window.__perf.end > 0, null, { timeout: 60000 });
  const r = await page.evaluate(() => {
    const { frames, start, end, longTasks } = window.__perf;
    const inShot = frames.filter((t) => t >= start && t <= end);
    const deltas = inShot.slice(1).map((t, i) => t - inShot[i]);
    const avg = deltas.reduce((a, b) => a + b, 0) / Math.max(1, deltas.length);
    return {
      shotSeconds: +((end - start) / 1000).toFixed(2),
      frames: deltas.length,
      fps: +(1000 / avg).toFixed(1),
      droppedPct: +((100 * deltas.filter((d) => d > 25).length) / Math.max(1, deltas.length)).toFixed(1),
      worstFrameMs: Math.round(Math.max(...deltas)),
      p95FrameMs: Math.round([...deltas].sort((a, b) => a - b)[Math.floor(deltas.length * 0.95)] ?? 0),
      longTasks,
      // Where the slow frames are: % of frames over budget per phase of the shot.
      phases: Object.fromEntries(
        [["0-1s morph", 0, 1], ["1-3s run", 1, 3], ["3-4.2s storm", 3, 4.2], ["4.2-5.6s reveal", 4.2, 5.6], ["5.6s+ brand", 5.6, 99]].map(([name, a, b]) => {
          const ds = inShot.slice(1).map((t, i) => [(t - start) / 1000, t - inShot[i]]).filter(([s]) => s >= a && s < b).map(([, d]) => d);
          return [name, `${Math.round((100 * ds.filter((d) => d > 25).length) / Math.max(1, ds.length))}% slow, worst ${Math.round(Math.max(0, ...ds))}ms`];
        }),
      ),
      docWidth: document.documentElement.scrollWidth,
      viewport: innerWidth,
    };
  });
  await context.close();
  return { device, throttle: `${throttle}x`, loaderMs, ...r, errors: errors.length ? errors : undefined };
}

async function filmstrip(browser, device) {
  const { context, page, errors } = await openIntro(browser, device, 1);
  const dir = path.join(outDir, `filmstrip-${device}`);
  rmSync(dir, { recursive: true, force: true }); // frames are named by their actual time: never mix runs
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, "00-idle.jpg"), type: "jpeg", quality: 70 });
  const t0 = Date.now();
  await tap(page, device);
  for (const [i, at] of FILMSTRIP_AT.entries()) {
    const wait = at * 1000 - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
    const actual = ((Date.now() - t0) / 1000).toFixed(2);
    await page.screenshot({ path: path.join(dir, `${String(i + 1).padStart(2, "0")}-${actual}s.jpg`), type: "jpeg", quality: 70 });
  }
  // Image fidelity: rendered vs natural aspect ratio of every intro subject.
  const fidelity = await page.evaluate(() =>
    [...document.querySelectorAll("#top [data-subject] img:not([data-trail])")].map((img) => {
      // Layout box (offsetWidth/Height) is unaffected by the timeline's rotate/scale.
      return { subject: img.closest("[data-subject]").dataset.subject, rendered: +(img.offsetWidth / img.offsetHeight).toFixed(3), natural: +(img.naturalWidth / img.naturalHeight).toFixed(3) };
    }),
  );
  await context.close();
  return { device, dir, fidelity, errors };
}

// --gpu: use the machine's GPU (Metal/ANGLE) like a real desktop browser; default is CPU-only SwiftShader.
const useGpu = args.includes("--gpu");
const browser = await chromium.launch(
  useGpu ? { args: ["--use-angle=metal", "--enable-gpu-rasterization", "--ignore-gpu-blocklist", "--enable-zero-copy"] } : {},
);
const results = [];
try {
  if (wantFrames) for (const d of Object.keys(DEVICES)) results.push(await filmstrip(browser, d));
  for (const d of Object.keys(DEVICES)) {
    if (onlyDevice && d !== onlyDevice) continue;
    for (const t of THROTTLES) results.push(await measure(browser, d, t));
  }
} finally {
  await browser.close();
}
writeFileSync(path.join(outDir, "intro-perf.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
