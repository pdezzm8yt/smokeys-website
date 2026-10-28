#!/usr/bin/env node
/**
 * Checks for the living sky (src/components/sky) in Chromium, GPU on.
 *
 *   npm run test:sky -- [baseUrl] [--quick]
 *
 * Needs a running production server (`npm run build && npx next start -p 3100`).
 * Prints a JSON report and exits 1 if a check fails or a page throws:
 *   1  the first sky follows the local time (day at 10:00, night at 22:00), no preference saved
 *   2  header switch → night: through sunset and twilight (one smooth climb), theme flips
 *      half-way, preference saved, the quote's text/email carry it
 *   3  the big picker by keyboard → day: back down through twilight and sunrise
 *   4  clicking the moon / the sun in the bare sky switches; the same spot on content doesn't
 *   5  a preference change keeps every other booking detail
 *   6  reduced motion: short change, no twinkle, clouds still, no shooting stars
 *   7  shooting stars: now and then at night, never by day (skipped with --quick)
 *   8  the sky does no work under the intro film
 *   9  phone: the switch lives in the menu drawer
 *   10 readability: measured text contrast on the panels, day and night
 *   11 frame rate: scrolling the page and during a change (desktop, phone at 4x CPU)
 */
import { chromium } from "playwright-core";
import sharp from "sharp";

const args = process.argv.slice(2);
const URL = args.find((a) => a.startsWith("http")) ?? "http://localhost:3100/";
const quick = args.includes("--quick");
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"] });
const desktop = { viewport: { width: 1280, height: 800 } };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const results = {};
const failures = [];
const uncaught = [];
const check = (name, ok, detail) => {
  if (!ok) failures.push(`${name}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  return ok;
};

async function open(ctxOpts = {}, { prefs, url = `${URL}#bus`, hour } = {}) {
  const ctx = await browser.newContext({ ...desktop, ...ctxOpts });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => uncaught.push(e.message));
  if (hour !== undefined) await page.clock.setFixedTime(new Date(2026, 9, 28, hour, 0, 0));
  if (prefs) await page.addInitScript((p) => localStorage.setItem("smokeys:booking", JSON.stringify(p)), prefs);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("[data-sky-layer]")?.hasAttribute("data-ready"), null, { timeout: 20000 });
  await page.waitForTimeout(400);
  return { ctx, page };
}
const sky = (page) =>
  page.evaluate(() => {
    const h = document.documentElement;
    const status = document.querySelector("#quote [role=status]")?.textContent ?? "";
    const sms = document.querySelector('#quote a[href^="sms:"]')?.getAttribute("href") ?? "";
    const mail = document.querySelector('#quote a[href^="mailto:"]')?.getAttribute("href") ?? "";
    return {
      sky: h.dataset.sky,
      night: +getComputedStyle(h).getPropertyValue("--night"),
      changing: h.hasAttribute("data-sky-changing"),
      stored: JSON.parse(localStorage.getItem("smokeys:booking") ?? "{}"),
      quoteStatus: status.trim().slice(0, 60),
      smsSaysNight: decodeURIComponent(sms).includes("a night ride"),
      smsSaysDay: decodeURIComponent(sms).includes("a day ride"),
      mailSaysNight: decodeURIComponent(mail).includes("a night ride"),
    };
  });
/** Sample --night every ~100 ms for `ms`. */
const sampleNight = (page, ms) =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const out = [];
        const t0 = performance.now();
        const tick = () => {
          out.push([Math.round(performance.now() - t0), +getComputedStyle(document.querySelector("[data-sky-layer]")).getPropertyValue("--night"), document.documentElement.dataset.sky]);
          if (performance.now() - t0 < ms) setTimeout(tick, 100);
          else resolve(out);
        };
        tick();
      }),
    ms,
  );

// 1. First visit: the sky follows the local time; nothing is saved until the visitor chooses.
{
  const out = {};
  for (const hour of [10, 22]) {
    const { ctx, page } = await open({}, { hour });
    out[`${hour}:00`] = await sky(page);
    await ctx.close();
  }
  results["1 first sky by local time"] = out;
  check("1 day at 10:00", out["10:00"].sky === "day" && out["10:00"].night === 0, out["10:00"]);
  check("1 night at 22:00", out["22:00"].sky === "night" && out["22:00"].night === 1, out["22:00"]);
  check("1 nothing saved", !out["10:00"].stored.period && !out["22:00"].stored.period, out);
}

// 2. Header switch → night: one smooth climb through sunset and twilight; the theme flips half-way.
{
  const { ctx, page } = await open({}, { prefs: { period: "day" } });
  await page.locator('[data-site-header] > div [role=radio][aria-label="Night ride"]').click();
  const samples = await sampleNight(page, 6200);
  const values = samples.map((s) => s[1]);
  const monotonic = values.every((v, i) => i === 0 || v >= values[i - 1] - 0.001);
  const stage = (lo, hi) => samples.some(([, v]) => v >= lo && v <= hi);
  const flip = samples.find(([, , t]) => t === "night");
  const end = await sky(page);
  results["2 switch to night"] = { samples: samples.filter((_, i) => i % 6 === 0), flipAt: flip?.[1], end };
  check("2 climbs smoothly", monotonic && values.at(-1) === 1, values);
  check("2 passes sunset and twilight", stage(0.3, 0.5) && stage(0.6, 0.8), values);
  check("2 theme flips half-way", flip && flip[1] >= 0.45 && flip[1] <= 0.6, flip);
  check("2 preference saved and used", end.stored.period === "night" && end.smsSaysNight && end.mailSaysNight && /night ride/.test(end.quoteStatus) && !end.changing, end);

  // 3. The big picker, by keyboard → day: back down (twilight, sunrise, morning).
  await page.evaluate(() => document.getElementById("day-night")?.scrollIntoView({ behavior: "instant" }));
  await page.locator('#day-night [role=radio][aria-label="Night ride"], #day-night [role=radio]:has-text("Night ride")').first().focus();
  await page.keyboard.press("ArrowLeft");
  const back = await sampleNight(page, 6200);
  const bv = back.map((s) => s[1]);
  const focused = await page.evaluate(() => (document.activeElement?.textContent?.trim().startsWith("Day ride") ? "Day ride" : document.activeElement?.textContent?.trim()));
  const endDay = await sky(page);
  results["3 keyboard back to day"] = { samples: back.filter((_, i) => i % 6 === 0), focused, end: endDay };
  check("3 descends smoothly", bv.every((v, i) => i === 0 || v <= bv[i - 1] + 0.001) && bv.at(-1) === 0, bv);
  check("3 arrow key moved the choice and focus", endDay.stored.period === "day" && focused === "Day ride" && endDay.smsSaysDay, { endDay, focused });
  await ctx.close();
}

// 4. The sky itself: click the moon (by day) / the sun (by night: down, so via day first) on the bare sky.
{
  const { ctx, page } = await open({}, { prefs: { period: "day" } });
  // Let the hash scroll to #bus finish before measuring anything (the layout must hold still).
  await page.evaluate(() => (document.documentElement.style.scrollBehavior = "auto"));
  await page.waitForTimeout(1500);
  // Where the bodies are now, and a gap between panels lined up with the pale daytime moon.
  const aim = async (which) =>
    page.evaluate(async (which) => {
      const el = document.querySelector(which === "moon" ? "[data-sky-moon]" : "[data-sky-sun]");
      const r = el.getBoundingClientRect();
      const target = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      // Scroll so the gap between two panels sits on the body.
      const panels = [...document.querySelectorAll("main [data-panel]")].map((p) => p.getBoundingClientRect());
      for (let i = 1; i < panels.length; i++) {
        const gapTop = panels[i - 1].bottom;
        const gapBottom = panels[i].top;
        if (gapBottom - gapTop < 40) continue;
        window.scrollBy({ top: (gapTop + gapBottom) / 2 - target.y, behavior: "instant" });
        break;
      }
      await new Promise((r) => setTimeout(r, 300));
      const r2 = el.getBoundingClientRect();
      return { x: r2.left + r2.width / 2, y: r2.top + r2.height / 2, hit: document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2)?.tagName };
    }, which);
  const moon = await aim("moon");
  await page.mouse.click(moon.x, moon.y);
  await page.waitForTimeout(6000);
  const afterMoon = await sky(page);
  // The same kind of click on a panel must do nothing.
  const panelSpot = await page.evaluate(() => { const r = document.querySelector("#packages [data-panel]").getBoundingClientRect(); return { x: r.left + 40, y: r.top + 40 }; });
  await page.evaluate(() => document.querySelector("#packages")?.scrollIntoView({ behavior: "instant" }));
  await page.waitForTimeout(200);
  const before = (await sky(page)).night;
  const spot = await page.evaluate(() => { const r = document.querySelector("#packages [data-panel]").getBoundingClientRect(); return { x: r.left + 30, y: r.top + 30 }; });
  await page.mouse.click(spot.x, spot.y);
  await page.waitForTimeout(800);
  const afterPanel = (await sky(page)).night;
  // Back to day with the header, then click the sun in the sky.
  await page.locator('[data-site-header] > div [role=radio][aria-label="Day ride"]').click();
  await page.waitForTimeout(6000);
  await page.locator('[data-site-header] > div [role=radio][aria-label="Night ride"]').click();
  await page.waitForTimeout(500); // a moment into the change: the sun is still up
  const sun = await aim("sun");
  await page.mouse.click(sun.x, sun.y);
  await page.waitForTimeout(6000);
  const afterSun = await sky(page);
  results["4 clicking the sky"] = { moon, afterMoon: { sky: afterMoon.sky, period: afterMoon.stored.period }, panelClick: { before, after: afterPanel, panelSpot }, sun, afterSun: { sky: afterSun.sky, period: afterSun.stored.period } };
  check("4 the moon picks night", afterMoon.stored.period === "night" && afterMoon.sky === "night", { moon, afterMoon });
  check("4 a click on content doesn't", before === afterPanel, { before, afterPanel });
  check("4 the sun picks day", afterSun.stored.period === "day" && afterSun.sky === "day", { sun, afterSun });
  await ctx.close();
}

// 5. Changing day/night keeps every other booking detail.
{
  const { ctx, page } = await open({}, { prefs: { period: "day", package: "vip", passengers: 12, eventType: "prom" } });
  await page.locator('[data-site-header] > div [role=radio][aria-label="Night ride"]').click();
  await page.waitForTimeout(300);
  const { stored } = await sky(page);
  results["5 other details kept"] = stored;
  check("5 merge", stored.period === "night" && stored.package === "vip" && stored.passengers === 12 && stored.eventType === "prom", stored);
  await ctx.close();
}

// 6. Reduced motion: a short crossfade, no twinkle, still clouds, no shooting stars.
{
  const { ctx, page } = await open({ reducedMotion: "reduce" }, { prefs: { period: "day" } });
  await page.locator('[data-site-header] > div [role=radio][aria-label="Night ride"]').click();
  await page.waitForTimeout(900);
  const done = await sky(page);
  const twinkle = await page.evaluate(() => getComputedStyle(document.querySelector("[data-sky-stars] canvas")).animationName);
  const clouds = page.locator("[data-sky-clouds]");
  await page.evaluate(() => document.querySelector("#faq")?.scrollIntoView({ behavior: "instant" }));
  await page.addStyleTag({ content: "main, header, footer { visibility: hidden !important; }" });
  await page.waitForTimeout(400);
  const a = await clouds.screenshot();
  await page.waitForTimeout(2500);
  const b = await clouds.screenshot();
  const [sa, sb] = await Promise.all([sharp(a).raw().toBuffer(), sharp(b).raw().toBuffer()]);
  let diff = 0;
  for (let i = 0; i < sa.length; i++) diff += Math.abs(sa[i] - (sb[i] ?? 0));
  results["6 reduced motion"] = { nightAfter900ms: done.night, twinkle, cloudPixelDiff: diff };
  check("6 short change", done.night === 1 && !done.changing, done);
  check("6 no twinkle", twinkle === "none", twinkle);
  check("6 clouds still", diff === 0, diff);
  await ctx.close();
}

// 7. Shooting stars: now and then at night (the wait is up to 22 s), never by day.
if (!quick) {
  const count = async (period) => {
    const ctx = await browser.newContext(desktop);
    const page = await ctx.newPage();
    await page.addInitScript((p) => {
      localStorage.setItem("smokeys:booking", JSON.stringify({ period: p }));
      window.__shooting = 0;
      const orig = Element.prototype.animate;
      Element.prototype.animate = function (...a) {
        if (this.hasAttribute?.("data-sky-shooting")) window.__shooting++;
        return orig.apply(this, a);
      };
    }, period);
    await page.goto(`${URL}#packages`, { waitUntil: "load" });
    await page.waitForTimeout(26000);
    const n = await page.evaluate(() => window.__shooting);
    await ctx.close();
    return n;
  };
  const [night, day] = await Promise.all([count("night"), count("day")]);
  results["7 shooting stars in 26 s"] = { night, day };
  check("7 at night, now and then", night >= 1 && night <= 4, night);
  check("7 never by day", day === 0, day);
}

// 8. Under the intro film the sky is paused (no cloud drawing, no twinkle).
{
  const { ctx, page } = await open({}, { url: URL, prefs: { period: "night" } });
  await page.waitForTimeout(800);
  const paused = await page.evaluate(() => document.querySelector("[data-sky-layer]").hasAttribute("data-paused"));
  await page.evaluate(() => document.querySelector("#main")?.scrollIntoView({ behavior: "instant" }));
  await page.waitForTimeout(800);
  const pausedBelow = await page.evaluate(() => document.querySelector("[data-sky-layer]").hasAttribute("data-paused"));
  results["8 paused under the intro"] = { atTop: paused, onThePage: pausedBelow };
  check("8 paused at the top, running below", paused && !pausedBelow, { paused, pausedBelow });
  await ctx.close();
}

// 9. Phone: the switch is in the menu drawer.
{
  const { ctx, page } = await open(phone, { prefs: { period: "day" } });
  const headerSwitchVisible = await page.locator('[data-site-header] > div [role=radiogroup]').isVisible();
  await page.locator('[data-site-header] button[aria-haspopup="dialog"]').click();
  await page.waitForTimeout(400);
  await page.locator('dialog[open] [role=radio][aria-label="Night ride"]').click();
  await page.waitForTimeout(6000);
  const s = await sky(page);
  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  results["9 phone"] = { headerSwitchVisible, sky: s.sky, period: s.stored.period, overflowX };
  check("9 drawer switch works", !headerSwitchVisible && s.stored.period === "night" && s.sky === "night" && overflowX === 0, results["9 phone"]);
  await ctx.close();
}

// 10. Readability: text vs what's really behind it (screenshot with the text hidden), day and night.
{
  const lum = ([r, g, b]) => {
    const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  const out = {};
  for (const period of ["day", "night"]) {
    const { ctx, page } = await open({}, { prefs: { period } });
    await page.waitForTimeout(600);
    const targets = [
      ["section heading", "#packages h2"],
      ["lede (muted)", "#packages h2 + p"],
      ["eyebrow (gold)", "#packages [data-panel] p.uppercase"],
      ["card text", "#packages article p"],
      ["faq answer", "#faq details[open] p"],
      ["day/night status", "#day-night [role=status]"],
      ["quote lede", "#quote h2 + p"],
      ["footer link", "footer nav a"],
      ["header link", "[data-site-header] nav a"],
    ];
    const rows = [];
    for (const [label, sel] of targets) {
      const loc = page.locator(sel).first();
      if (!(await loc.count())) {
        rows.push({ label, missing: true });
        continue;
      }
      await loc.scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      const info = await loc.evaluate((el) => {
        const cs = getComputedStyle(el);
        // Computed colours can be oklch(): let a canvas convert them to sRGB.
        const c = document.createElement("canvas").getContext("2d");
        c.fillStyle = cs.color;
        c.fillRect(0, 0, 1, 1);
        const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
        el.dataset.contrastProbe = "";
        return { color: [r, g, b], size: parseFloat(cs.fontSize), weight: +cs.fontWeight };
      });
      await page.addStyleTag({ content: "[data-contrast-probe], [data-contrast-probe] * { color: transparent !important; text-shadow: none !important; }" });
      await page.waitForTimeout(80);
      const shot = await loc.screenshot();
      await page.evaluate(() => {
        document.querySelector("[data-contrast-probe]")?.removeAttribute("data-contrast-probe");
        document.querySelectorAll("style").forEach((s) => s.textContent.includes("data-contrast-probe") && s.remove());
      });
      const { data, info: meta } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
      // The background: the darkest and lightest tenth of pixels behind the text, the worst one counts.
      const px = [];
      for (let i = 0; i < data.length; i += meta.channels * 7) px.push([data[i], data[i + 1], data[i + 2]]);
      px.sort((a, b) => lum(a) - lum(b));
      const lo = px[Math.floor(px.length * 0.1)] ?? px[0];
      const hi = px[Math.floor(px.length * 0.9)] ?? px[0];
      const worst = Math.min(ratio(info.color, lo), ratio(info.color, hi));
      const large = info.size >= 24 || (info.size >= 18.66 && info.weight >= 700);
      rows.push({ label, ratio: +worst.toFixed(2), needs: large ? 3 : 4.5 });
    }
    out[period] = rows;
    await ctx.close();
  }
  results["10 contrast"] = out;
  for (const [period, rows] of Object.entries(out)) for (const r of rows) if (!r.missing) check(`10 ${period} ${r.label}`, r.ratio >= r.needs, r);
}

// 11. Frame rate: scrolling the page (day and night), and during a change. Desktop, and phone at 4x CPU.
{
  const sweep = (page, ms) =>
    page.evaluate(
      (ms) =>
        new Promise((resolve) => {
          const start = document.querySelector("#main").getBoundingClientRect().top + scrollY;
          const end = document.documentElement.scrollHeight - innerHeight;
          const frames = [];
          const t0 = performance.now();
          const step = (t) => {
            const k = Math.min(1, (t - t0) / ms);
            window.scrollTo({ top: start + (end - start) * k, behavior: "instant" });
            frames.push(t);
            if (k < 1) requestAnimationFrame(step);
            else resolve(frames);
          };
          requestAnimationFrame(step);
        }),
      ms,
    );
  const idle = (page, ms) =>
    page.evaluate((ms) => new Promise((resolve) => { const f = []; const t0 = performance.now(); const s = (t) => { f.push(t); if (t - t0 < ms) requestAnimationFrame(s); else resolve(f); }; requestAnimationFrame(s); }), ms);
  const stats = (frames) => {
    const d = frames.slice(1).map((t, i) => t - frames[i]);
    const avg = d.reduce((a, b) => a + b, 0) / Math.max(1, d.length);
    return { fps: +(1000 / avg).toFixed(1), slowPct: +((100 * d.filter((x) => x > 25).length) / Math.max(1, d.length)).toFixed(1), worstMs: Math.round(Math.max(...d)) };
  };
  const out = {};
  for (const [dev, opts, rate] of [["desktop", desktop, 1], ["phone 4x", phone, 4]]) {
    for (const period of ["day", "night"]) {
      const { ctx, page } = await open(opts, { prefs: { period } });
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate });
      out[`${dev} ${period} scroll`] = stats(await sweep(page, 8000));
      if (period === "day") {
        await page.evaluate(() => document.querySelector("#faq")?.scrollIntoView({ behavior: "instant" }));
        await page.waitForTimeout(300);
        const radio = page.locator('[role=radio][aria-label="Night ride"]').first();
        if (await radio.isVisible()) await radio.click();
        else await page.evaluate(() => document.querySelector('#day-night [role=radio]:last-child')?.click());
        out[`${dev} day→night change`] = stats(await idle(page, 5200));
      }
      await ctx.close();
    }
  }
  results["11 frame rate"] = out;
  for (const [k, v] of Object.entries(out)) check(`11 ${k}`, v.slowPct <= (k.startsWith("phone") ? 8 : 3), v);
}

await browser.close();
console.log(JSON.stringify(results, null, 1));
if (uncaught.length) failures.push(...[...new Set(uncaught)].map((m) => `uncaught: ${m}`));
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else console.error("\nAll sky checks passed.");
