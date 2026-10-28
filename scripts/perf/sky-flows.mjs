#!/usr/bin/env node
/**
 * Checks for the living sky (src/components/sky) in Chromium, GPU on.
 *
 *   npm run test:sky -- [baseUrl] [--quick]
 *
 * Needs a running production server (`npm run build && npx next start -p 3100`).
 * Prints a JSON report and exits 1 if a check fails or any page throws:
 *   1  the first sky follows the local time (day at 10:00, night at 22:00), no preference saved
 *   2  header switch → night: what's DRAWN passes through sunset and twilight (the gradient
 *      keyframe layers), the sun sets, the stars come out; the theme flips at mid-twilight;
 *      the preference is saved and the quote's text/email carry it
 *   3  the big picker by keyboard → day: back through twilight and sunrise
 *   4  clicking the moon / the sun on the bare sky switches; a click on a panel over the moon doesn't
 *   5  a preference change keeps every other booking detail
 *   6  reduced motion: a short change, the sun and moon never travel, no twinkle, still clouds
 *   7  shooting stars: now and then at night, never by day or with reduced motion (skipped with --quick)
 *   8  the sky does no work under the intro film
 *   9  phone: the switch lives in the menu drawer
 *   10 readability: measured text contrast on the panels, day and night, mid-screen and just
 *      under the header; the 404 page too
 *   11 frame rate: scrolling the page, and during a change (bus panel in view and not), desktop
 *      and phone at 4x CPU
 *   12 no JavaScript: a night sky with no sun
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
const watch = (page) => page.on("pageerror", (e) => uncaught.push(e.message));

async function open(ctxOpts = {}, { prefs, url = `${URL}#bus`, hour } = {}) {
  const ctx = await browser.newContext({ ...desktop, ...ctxOpts });
  const page = await ctx.newPage();
  watch(page);
  if (hour !== undefined) await page.clock.setFixedTime(new Date(2026, 9, 28, hour, 0, 0));
  if (prefs) await page.addInitScript((p) => localStorage.setItem("smokeys:booking", JSON.stringify(p)), prefs);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("[data-sky-layer]")?.hasAttribute("data-ready"), null, { timeout: 20000 });
  // Programmatic scrolls are instant, and the hash scroll has settled before anything is measured.
  await page.evaluate(() => (document.documentElement.style.scrollBehavior = "auto"));
  await page.waitForTimeout(900);
  return { ctx, page };
}
const sky = (page) =>
  page.evaluate(() => {
    const h = document.documentElement;
    const status = [...document.querySelectorAll("#quote p")].find((p) => /preference|Saved for your quote/.test(p.textContent ?? ""))?.textContent ?? "";
    const sms = document.querySelector('#quote a[href^="sms:"]')?.getAttribute("href") ?? "";
    const mail = document.querySelector('#quote a[href^="mailto:"]')?.getAttribute("href") ?? "";
    return {
      sky: h.dataset.sky,
      changing: h.hasAttribute("data-sky-changing"),
      stored: JSON.parse(localStorage.getItem("smokeys:booking") ?? "{}"),
      quoteStatus: status.trim().slice(0, 60),
      smsSaysNight: decodeURIComponent(sms).includes("a night ride"),
      smsSaysDay: decodeURIComponent(sms).includes("a day ride"),
      mailSaysNight: decodeURIComponent(mail).includes("a night ride"),
    };
  });
/** What the sky DRAWS, every ~100 ms for `ms`: keyframe layer opacities, the sun, the stars, the theme. */
const sampleSky = (page, ms) =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const out = [];
        const t0 = performance.now();
        const op = (el) => (el ? +getComputedStyle(el).opacity : null);
        const tick = () => {
          const sun = document.querySelector("[data-sky-sun]");
          out.push({
            t: Math.round(performance.now() - t0),
            sunset: op(document.querySelector('[data-sky-key="1"]')),
            twilight: op(document.querySelector('[data-sky-key="2"]')),
            night: op(document.querySelector('[data-sky-key="3"]')),
            sun: op(sun),
            sunY: +getComputedStyle(sun).getPropertyValue("--y"),
            stars: op(document.querySelector("[data-sky-stars]")),
            theme: document.documentElement.dataset.sky,
          });
          if (performance.now() - t0 < ms) setTimeout(tick, 100);
          else resolve(out);
        };
        tick();
      }),
    ms,
  );
const nonDecreasing = (xs) => xs.every((v, i) => i === 0 || v >= xs[i - 1] - 0.002);
const nonIncreasing = (xs) => xs.every((v, i) => i === 0 || v <= xs[i - 1] + 0.002);
const headerRadio = (page, name) => page.locator(`[data-site-header] > div [role=radio][aria-label="${name}"]`);
const pickerRadio = (page, name) => page.locator("#day-night [role=radio]", { hasText: name });

// 1. First visit: the sky follows the local time; nothing is saved until the visitor chooses.
{
  const out = {};
  for (const hour of [10, 22]) {
    const { ctx, page } = await open({}, { hour });
    out[`${hour}:00`] = { ...(await sky(page)), drawn: (await sampleSky(page, 0))[0] };
    await ctx.close();
  }
  results["1 first sky by local time"] = out;
  check("1 day at 10:00", out["10:00"].sky === "day" && out["10:00"].drawn.night === 0 && out["10:00"].drawn.sun === 1, out["10:00"]);
  check("1 night at 22:00", out["22:00"].sky === "night" && out["22:00"].drawn.night === 1 && out["22:00"].drawn.sun === 0, out["22:00"]);
  check("1 nothing saved", !out["10:00"].stored.period && !out["22:00"].stored.period, out);
}

// 2. Header switch → night: through sunset and twilight, the sun sets, stars come out; the theme flips at mid-twilight.
{
  const { ctx, page } = await open({}, { prefs: { period: "day" } });
  await headerRadio(page, "Night ride").click();
  const s = await sampleSky(page, 6200);
  const flip = s.find((x) => x.theme === "night");
  const end = await sky(page);
  results["2 switch to night"] = { samples: s.filter((_, i) => i % 6 === 0), flip, end };
  check("2 sunset, then twilight, then night are drawn", Math.max(...s.map((x) => x.sunset)) >= 0.95 && Math.max(...s.map((x) => x.twilight)) >= 0.95 && s.at(-1).night === 1, s.map((x) => [x.sunset, x.twilight, x.night]));
  check("2 night arrives smoothly (no jumps back)", nonDecreasing(s.map((x) => x.night)) && nonDecreasing(s.map((x) => x.twilight)), s.map((x) => x.night));
  check("2 the sun sets (down, then gone); the stars come out", nonDecreasing(s.map((x) => x.sunY)) && s.at(-1).sun === 0 && s.at(-1).stars >= 0.99, s.map((x) => [x.sunY, x.sun, x.stars]));
  check("2 theme flips at mid-twilight", flip && flip.sunset >= 0.99 && flip.twilight >= 0.15 && flip.twilight <= 0.6 && flip.night === 0, flip);
  check("2 preference saved and used", end.stored.period === "night" && end.smsSaysNight && end.mailSaysNight && /night ride/.test(end.quoteStatus) && !end.changing, end);

  // 3. The big picker, by keyboard → day: back down (twilight, sunrise, morning).
  await page.evaluate(() => document.getElementById("day-night")?.scrollIntoView({ block: "center" }));
  await pickerRadio(page, "Night ride").focus();
  await page.keyboard.press("ArrowLeft");
  const b = await sampleSky(page, 6200);
  const focused = await page.evaluate(() => (document.activeElement?.textContent?.trim().startsWith("Day ride") ? "Day ride" : document.activeElement?.textContent?.trim()));
  const endDay = await sky(page);
  results["3 keyboard back to day"] = { samples: b.filter((_, i) => i % 6 === 0), focused, end: endDay };
  check("3 back through twilight and sunrise", nonIncreasing(b.map((x) => x.night)) && nonIncreasing(b.map((x) => x.twilight)) && b.at(-1).sunset === 0 && b.at(-1).sun === 1 && nonIncreasing(b.map((x) => x.sunY)), b.map((x) => [x.night, x.twilight, x.sunset, x.sun]));
  check("3 arrow key moved the choice and focus", endDay.stored.period === "day" && focused === "Day ride" && endDay.smsSaysDay && endDay.sky === "day", { endDay, focused });
  await ctx.close();
}

// 4. The sky itself: the moon (by day) and the sun on the bare sky switch; a click on a panel over the moon doesn't.
{
  const { ctx, page } = await open({}, { prefs: { period: "day" } });
  /** Scroll so the body sits in a gap between panels (bare) or inside a panel (covered); return where to click. */
  const aim = (which, covered) =>
    page.evaluate(
      async ([which, covered]) => {
        const el = document.querySelector(which === "moon" ? "[data-sky-moon]" : "[data-sky-sun]");
        const centre = () => {
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        };
        const t = centre();
        const panels = [...document.querySelectorAll("main [data-panel]")].map((p) => p.getBoundingClientRect());
        if (covered) {
          const p = panels.find((r) => r.height > 400);
          window.scrollBy({ top: p.top + p.height / 2 - t.y, behavior: "instant" });
        } else {
          for (let i = 1; i < panels.length; i++) {
            const g0 = panels[i - 1].bottom;
            const g1 = panels[i].top;
            if (g1 - g0 >= 40) {
              window.scrollBy({ top: (g0 + g1) / 2 - t.y, behavior: "instant" });
              break;
            }
          }
        }
        await new Promise((r) => setTimeout(r, 300));
        const c = centre();
        const hit = document.elementFromPoint(c.x, c.y);
        return { ...c, onPanel: Boolean(hit?.closest("[data-panel]")), hit: hit?.tagName };
      },
      [which, covered],
    );
  const coveredMoon = await aim("moon", true);
  await page.mouse.click(coveredMoon.x, coveredMoon.y);
  await page.waitForTimeout(300);
  const afterPanel = await sky(page);
  const bareMoon = await aim("moon", false);
  await page.mouse.click(bareMoon.x, bareMoon.y);
  await page.waitForTimeout(6000);
  const afterMoon = await sky(page);
  // Back to day with the header, then click the sun on the bare sky.
  await headerRadio(page, "Day ride").click();
  await page.waitForTimeout(6000);
  const bareSun = await aim("sun", false);
  await headerRadio(page, "Night ride").click();
  await page.waitForTimeout(400); // a moment into the change: the sun is still up
  await page.mouse.click(bareSun.x, bareSun.y);
  await page.waitForTimeout(6000);
  const afterSun = await sky(page);
  results["4 clicking the sky"] = { coveredMoon, afterPanel: afterPanel.stored.period, bareMoon, afterMoon: afterMoon.stored.period, bareSun, afterSun: afterSun.stored.period };
  check("4 a click on a panel over the moon doesn't switch", coveredMoon.onPanel && afterPanel.stored.period === "day" && !afterPanel.changing, { coveredMoon, afterPanel });
  check("4 the moon on the bare sky picks night", !bareMoon.onPanel && afterMoon.stored.period === "night" && afterMoon.sky === "night", { bareMoon, afterMoon });
  check("4 the sun on the bare sky picks day", !bareSun.onPanel && afterSun.stored.period === "day" && afterSun.sky === "day", { bareSun, afterSun });
  await ctx.close();
}

// 5. Changing day/night keeps every other booking detail.
{
  const { ctx, page } = await open({}, { prefs: { period: "day", package: "vip", passengers: 12, eventType: "prom" } });
  await headerRadio(page, "Night ride").click();
  await page.waitForTimeout(300);
  const { stored } = await sky(page);
  results["5 other details kept"] = stored;
  check("5 merge", stored.period === "night" && stored.package === "vip" && stored.passengers === 12 && stored.eventType === "prom", stored);
  await ctx.close();
}

// 6. Reduced motion: a short crossfade where nothing travels, no twinkle, still clouds.
{
  const { ctx, page } = await open({ reducedMotion: "reduce" }, { prefs: { period: "day" } });
  const pos = () => page.evaluate(() => ["[data-sky-sun]", "[data-sky-moon]"].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; }));
  const before = await pos();
  await headerRadio(page, "Night ride").click();
  const during = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(100);
    during.push(await pos());
  }
  await page.waitForTimeout(300);
  const done = await sky(page);
  const drawn = (await sampleSky(page, 0))[0];
  const twinkle = await page.evaluate(() => getComputedStyle(document.querySelector("[data-sky-stars] canvas")).animationName);
  await page.evaluate(() => document.querySelector("#faq")?.scrollIntoView({ block: "start" }));
  await page.addStyleTag({ content: "main, header, footer { visibility: hidden !important; }" });
  await page.waitForTimeout(400);
  const clouds = page.locator("[data-sky-clouds]");
  const a = await clouds.screenshot();
  await page.waitForTimeout(2500);
  const b = await clouds.screenshot();
  const [sa, sb] = await Promise.all([sharp(a).raw().toBuffer(), sharp(b).raw().toBuffer()]);
  let diff = 0;
  for (let i = 0; i < sa.length; i++) diff += Math.abs(sa[i] - (sb[i] ?? 0));
  const moved = during.some((p) => JSON.stringify(p) !== JSON.stringify(before));
  results["6 reduced motion"] = { before, during, done: { sky: done.sky, changing: done.changing, night: drawn.night }, twinkle, cloudPixelDiff: diff };
  check("6 short change", done.sky === "night" && drawn.night === 1 && !done.changing, done);
  check("6 the sun and moon never travel", !moved, { before, during });
  check("6 no twinkle", twinkle === "none", twinkle);
  check("6 clouds still", diff === 0, diff);
  await ctx.close();
}

// 7. Shooting stars: now and then at night (the wait is up to 22 s), never by day or with reduced motion.
if (!quick) {
  const count = async (period, opts = {}) => {
    const ctx = await browser.newContext({ ...desktop, ...opts });
    const page = await ctx.newPage();
    watch(page);
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
  const [night, day, reduced] = await Promise.all([count("night"), count("day"), count("night", { reducedMotion: "reduce" })]);
  results["7 shooting stars in 26 s"] = { night, day, reduced };
  // With 9-22 s between them, 26 s holds one or two.
  check("7 at night, now and then", night >= 1 && night <= 2, night);
  check("7 never by day", day === 0, day);
  check("7 never with reduced motion", reduced === 0, reduced);
}

// 8. Under the intro film the sky is paused (no cloud drawing, no twinkle).
{
  const { ctx, page } = await open({}, { url: URL, prefs: { period: "night" } });
  const paused = await page.evaluate(() => document.querySelector("[data-sky-layer]").hasAttribute("data-paused"));
  await page.evaluate(() => document.querySelector("#main")?.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(800);
  const pausedBelow = await page.evaluate(() => document.querySelector("[data-sky-layer]").hasAttribute("data-paused"));
  results["8 paused under the intro"] = { atTop: paused, onThePage: pausedBelow };
  check("8 paused at the top, running below", paused && !pausedBelow, { paused, pausedBelow });
  await ctx.close();
}

// 9. Phone: the switch is in the menu drawer.
{
  const { ctx, page } = await open(phone, { prefs: { period: "day" } });
  const headerSwitchVisible = await page.locator("[data-site-header] > div [role=radiogroup]").isVisible();
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
  /** The worst contrast of `sel` against the pixels really behind it, with the element at `where` on screen. */
  async function measure(page, sel, where) {
    const loc = page.locator(sel).first();
    if (!(await loc.count())) return null;
    await loc.evaluate((el, where) => {
      const header = document.querySelector("[data-site-header]")?.getBoundingClientRect().height ?? 64;
      const r = el.getBoundingClientRect();
      const y = where === "top" ? header + 8 : (innerHeight - r.height) / 2;
      window.scrollBy({ top: r.top - y, behavior: "instant" });
    }, where);
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
    await page.addStyleTag({ content: "[data-contrast-probe], [data-contrast-probe] * { color: transparent !important; text-shadow: none !important; transition: none !important; }" });
    await page.waitForTimeout(80);
    const shot = await loc.screenshot();
    await page.evaluate(() => {
      document.querySelector("[data-contrast-probe]")?.removeAttribute("data-contrast-probe");
      document.querySelectorAll("style").forEach((s) => s.textContent.includes("data-contrast-probe") && s.remove());
    });
    const { data, info: meta } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
    const px = [];
    for (let i = 0; i < data.length; i += meta.channels * 7) px.push([data[i], data[i + 1], data[i + 2]]);
    px.sort((a, b) => lum(a) - lum(b));
    const lo = px[Math.floor(px.length * 0.1)] ?? px[0];
    const hi = px[Math.floor(px.length * 0.9)] ?? px[0];
    const large = info.size >= 24 || (info.size >= 18.66 && info.weight >= 700);
    return { ratio: +Math.min(ratio(info.color, lo), ratio(info.color, hi)).toFixed(2), needs: large ? 3 : 4.5 };
  }
  const targets = [
    ["section heading", "#packages h2"],
    ["lede (muted)", "#packages h2 + p"],
    ["eyebrow (gold)", "#packages [data-panel] p.uppercase"],
    ["card text", "#packages article p"],
    ["faq answer", "#faq details[open] p"],
    ["day/night status", "#day-night [data-panel] p.text-muted-foreground"],
    ["quote lede", "#quote h2 + p"],
    ["footer link", "footer nav a"],
    ["header link", "[data-site-header] nav a"],
  ];
  const out = {};
  for (const period of ["day", "night"]) {
    const { ctx, page } = await open({}, { prefs: { period } });
    const rows = [];
    for (const [label, sel] of targets) {
      for (const where of ["middle", "top"]) {
        if (label === "header link" && where === "top") continue;
        const r = await measure(page, sel, where);
        rows.push({ label: `${label} (${where})`, ...(r ?? { missing: sel }) });
      }
    }
    // The 404 page: its text on glass too.
    await page.goto(`${URL}nope`, { waitUntil: "load" });
    await page.waitForTimeout(800);
    for (const [label, sel] of [["404 heading", "main h1"], ["404 text", "main p.text-muted-foreground"], ["404 header link", "[data-site-header] nav a"]]) {
      const r = await measure(page, sel, "middle");
      rows.push({ label, ...(r ?? { missing: sel }) });
    }
    out[period] = rows;
    await ctx.close();
  }
  results["10 contrast"] = out;
  for (const [period, rows] of Object.entries(out)) for (const r of rows) check(`10 ${period} ${r.label}`, !r.missing && r.ratio >= r.needs, r);
}

// 11. Frame rate: scrolling the page, and during a change (bus panel in view, and FAQ). Desktop, and phone at 4x CPU.
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
  const name = (p) => (p === "day" ? "Day ride" : "Night ride");
  const out = {};
  for (const [dev, opts, rate] of [["desktop", desktop, 1], ["phone 4x", phone, 4]]) {
    for (const period of ["day", "night"]) {
      const { ctx, page } = await open(opts, { prefs: { period } });
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate });
      out[`${dev} ${period} scroll`] = stats(await sweep(page, 8000));
      const target = period === "day" ? "night" : "day";
      // The phone keeps its switch in the drawer: use the picker's radio there (clicked without scrolling to it).
      const radio = (p) => (dev === "desktop" ? headerRadio(page, name(p)) : pickerRadio(page, name(p)));
      for (const at of ["#bus", "#faq"]) {
        await page.evaluate((at) => document.querySelector(at)?.scrollIntoView({ block: "start" }), at);
        await page.waitForTimeout(400);
        await radio(target).evaluate((el) => el.click());
        out[`${dev} ${period}→${target} change at ${at}`] = stats(await idle(page, 5400));
        await radio(period).evaluate((el) => el.click()); // …and back, for the next measurement
        await page.waitForTimeout(5600);
      }
      await ctx.close();
    }
  }
  results["11 frame rate"] = out;
  for (const [k, v] of Object.entries(out)) check(`11 ${k}`, v.slowPct <= (k.startsWith("phone") ? 8 : 3), v);
}

// 12. No JavaScript: the night sky (the default), with no sun on it.
{
  const ctx = await browser.newContext({ ...desktop, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(`${URL}`, { waitUntil: "load" });
  const s = await page.evaluate(() => ({ sun: +getComputedStyle(document.querySelector("[data-sky-sun]")).opacity, night: +getComputedStyle(document.querySelector('[data-sky-key="3"]')).opacity }));
  results["12 no JavaScript"] = s;
  check("12 night sky without a sun", s.sun === 0 && s.night === 1, s);
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 1));
if (uncaught.length) failures.push(...[...new Set(uncaught)].map((m) => `uncaught: ${m}`));
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else console.error("\nAll sky checks passed.");
