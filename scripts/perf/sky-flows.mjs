#!/usr/bin/env node
/**
 * Checks for the living sky (src/components/sky) in Chromium, GPU on, behind the homepage's world
 * (src/components/world): sideways (html[data-axis="x"]: [data-world] scrolls along x, the page itself
 * never scrolls) wherever the screen is at least 30rem tall, a column (window.scrollY) on shorter ones.
 *
 *   npm run test:sky -- [baseUrl] [--quick]
 *
 * Needs a running production server (`npm run build && npx next start -p 3100`).
 * Prints a JSON report and exits 1 if a check fails or any page throws:
 *   1  the first sky follows the local time (day at 10:00, night at 22:00), no preference saved
 *   2  header switch → night: what's DRAWN passes through sunset and twilight (the gradient
 *      keyframe layers), the sun sets, the stars come out; the theme flips at mid-twilight;
 *      the preference is saved and the Contact scene's and the booking panel's text/email carry it
 *   3  the big picker (the world moved to "Day or night?") by keyboard → day: back through twilight
 *      and sunrise; the arrow key moves the choice, never the world
 *   4  clicking the moon / the sun on the bare sky (a gap between two scenes' panels, moved under it by
 *      the world) switches; a click on a panel over the moon doesn't, nor one on the tunnel scene
 *   5  a preference change keeps every other booking detail
 *   6  reduced motion: a short change, the sun and moon never travel, no twinkle, no cloud parallax
 *      wherever the world is, still clouds
 *   7  shooting stars: now and then at night, never by day or with reduced motion (skipped with --quick)
 *   8  the sky does no work under the tunnel scene: paused (and no cloud drawn) at the start of the world
 *      and while the tunnel's stage still covers the screen, running past the tunnel, paused again back
 *   9  phone: the switch lives in the menu drawer; its button names the drawer (aria-controls) and says
 *      whether it's open (aria-expanded) through Esc, the backdrop and a link; the page itself never
 *      overflows (the world scrolls inside the screen); a drawer link glides the world to its scene's
 *      start (hash, focus); the drawer's "Book your ride" opens the booking panel over the world
 *      (closing the drawer, focus inside, the chosen sky in it) and Esc gives focus back to the menu button
 *   10 readability: measured text contrast on the panels, day and night: sideways (desktop) with the
 *      world moved to put each target in place (its scene arrived, and as near mid-screen as its panel
 *      allows at rest), the header's links over a scene and over the tunnel's film; down the column
 *      (844x390) mid-screen and just under the header; the 404 page too
 *   11 frame rate: sweeping the world sideways, and during a change (the world at the bus scene and at
 *      the FAQ), desktop and phone at 4x CPU
 *   12 no JavaScript: a night sky with no sun
 *   13 "Meet the bus" (its panel follows the sky): on a phone the feature list sits beside the photo, a
 *      screen on: a hotspot tapped on the photo brings its text on screen by moving the WORLD sideways,
 *      and tells screen readers; a pick in the list isn't announced again; the taps never reach the sky.
 *      On a desktop, where the photo and the list fit side by side, a tap with its text already on
 *      screen leaves the world where it is
 *   14 the clouds' parallax follows the world: the shader's uScroll (hooked on uniform2f) is the world's
 *      place in screens along x (0 down the page), after a jump, a mouse wheel turned sideways and a key
 *   15 the column (a phone on its side, 844x390): no sideways world; the header switch → night draws the
 *      same change and is used by the Contact scene and the booking panel; the picker by keyboard → day
 *      (the page doesn't move); the parallax follows the page down; paused under the tunnel at the top
 */
import { chromium } from "playwright-core";
import sharp from "sharp";

const args = process.argv.slice(2);
const URL = args.find((a) => a.startsWith("http")) ?? "http://localhost:3100/";
const quick = args.includes("--quick");
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"] });
const desktop = { viewport: { width: 1280, height: 800 } };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
/** A phone on its side: too short for side-by-side scenes, so the world is a column (world-axis.ts: SHORT_SCREEN). */
const landscape = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const results = {};
const failures = [];
const uncaught = [];
const check = (name, ok, detail) => {
  if (!ok) failures.push(`${name}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  return ok;
};
const watch = (page) => page.on("pageerror", (e) => uncaught.push(e.message));

/**
 * Before any page script: records what the clouds' shader is given. `uScroll` (the parallax offset, in
 * screens: [along the world, down the page]) is recognised by its uniform location; draws are counted
 * on the clouds' canvas only.
 */
function hookClouds() {
  window.__clouds = { scroll: null, sent: 0, maxAbs: 0, draws: 0 };
  const scrollLocations = new WeakSet();
  const gl = WebGLRenderingContext.prototype;
  const getUniformLocation = gl.getUniformLocation;
  gl.getUniformLocation = function (program, name) {
    const loc = getUniformLocation.call(this, program, name);
    if (name === "uScroll" && loc) scrollLocations.add(loc);
    return loc;
  };
  const uniform2f = gl.uniform2f;
  gl.uniform2f = function (loc, x, y) {
    if (loc && scrollLocations.has(loc)) {
      const c = window.__clouds;
      c.scroll = [x, y];
      c.sent++;
      c.maxAbs = Math.max(c.maxAbs, Math.abs(x), Math.abs(y));
    }
    return uniform2f.call(this, loc, x, y);
  };
  const drawArrays = gl.drawArrays;
  gl.drawArrays = function (...a) {
    if (this.canvas?.hasAttribute?.("data-sky-clouds")) window.__clouds.draws++;
    return drawArrays.apply(this, a);
  };
}
const clouds = (page) => page.evaluate(() => ({ ...window.__clouds }));
const resetClouds = (page) => page.evaluate(() => Object.assign(window.__clouds, { sent: 0, maxAbs: 0, draws: 0 }));

async function open(ctxOpts = {}, { prefs, url = `${URL}#bus`, hour, gl = false } = {}) {
  const ctx = await browser.newContext({ ...desktop, ...ctxOpts });
  const page = await ctx.newPage();
  watch(page);
  if (hour !== undefined) await page.clock.setFixedTime(new Date(2026, 9, 28, hour, 0, 0));
  if (prefs) await page.addInitScript((p) => localStorage.setItem("smokeys:booking", JSON.stringify(p)), prefs);
  if (gl) await page.addInitScript(hookClouds);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("[data-sky-layer]")?.hasAttribute("data-ready"), null, { timeout: 20000 });
  // Programmatic scrolls of the column are instant (the world has no scroll-behavior), and the deep link has landed.
  await page.evaluate(() => (document.documentElement.style.scrollBehavior = "auto"));
  await page.waitForTimeout(900);
  return { ctx, page };
}
/** Until the tunnel scene's film is in (or its stills or the finished hero took over) and the world is free to move. */
const introSettled = (page) =>
  page
    .waitForFunction(
      () => {
        const h = document.documentElement;
        const settled = document.querySelector("[data-film]")?.hasAttribute("data-ready") || h.hasAttribute("data-intro-still") || h.hasAttribute("data-intro-failed");
        return settled && !h.hasAttribute("data-intro-pending") && !h.hasAttribute("data-intro-loading") && !h.hasAttribute("data-scroll-lock");
      },
      null,
      { timeout: 60000 },
    )
    .catch(() => {});
/** Which way the world runs and where it is: px along it (the world's scrollLeft sideways, scrollY down the column). */
const place = (page) =>
  page.evaluate(() => {
    const w = document.querySelector("[data-world]");
    const sideways = document.documentElement.dataset.axis === "x";
    return { axis: sideways ? "x" : "y", at: Math.round(sideways ? w.scrollLeft : scrollY), max: sideways ? w.scrollWidth - w.clientWidth : document.documentElement.scrollHeight - innerHeight, screen: sideways ? w.clientWidth : innerHeight };
  });
/** Two frames: scroll-driven animations, IntersectionObservers and the sky's next draw have caught up. */
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
/** Move the world (instantly) to `px` along it. */
async function moveWorld(page, px) {
  await page.evaluate((px) => {
    const w = document.querySelector("[data-world]");
    if (document.documentElement.dataset.axis === "x") w.scrollTo({ left: px, behavior: "instant" });
    else window.scrollTo({ top: px, behavior: "instant" });
  }, px);
  await frames(page);
}
/** Where `sel`'s scene starts along the world (px), and the tunnel scene's resting point (its stage about to let go). */
const sceneStart = (page, sel) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const scene = el?.closest("[data-scene]") ?? el;
    const w = document.querySelector("[data-world]");
    if (!scene) return null;
    if (document.documentElement.dataset.axis === "x") return scene.getBoundingClientRect().left - w.getBoundingClientRect().left + w.scrollLeft;
    return scene.getBoundingClientRect().top + scrollY;
  }, sel);
const tunnelEnd = (page) => page.evaluate(() => document.getElementById("top").offsetWidth - document.querySelector("[data-world]").clientWidth);
const toScene = async (page, sel) => moveWorld(page, await sceneStart(page, sel));

const sky = (page) =>
  page.evaluate(() => {
    const h = document.documentElement;
    const status = [...document.querySelectorAll("#contact p")].find((p) => /preference|Saved for your quote/.test(p.textContent ?? ""))?.textContent ?? "";
    const sms = document.querySelector('#contact a[href^="sms:"]')?.getAttribute("href") ?? "";
    const mail = document.querySelector('#contact a[href^="mailto:"]')?.getAttribute("href") ?? "";
    // The booking panel (ActionDrawer): rendered, closed, until an action opens it.
    const panel = document.querySelector('[data-field="date"]')?.closest("dialog");
    const panelSms = panel?.querySelector('a[href^="sms:"]')?.getAttribute("href") ?? "";
    const panelMail = panel?.querySelector('a[href^="mailto:"]')?.getAttribute("href") ?? "";
    return {
      sky: h.dataset.sky,
      changing: h.hasAttribute("data-sky-changing"),
      stored: JSON.parse(localStorage.getItem("smokeys:booking") ?? "{}"),
      quoteStatus: status.trim().slice(0, 60),
      smsSaysNight: decodeURIComponent(sms).includes("a night ride"),
      smsSaysDay: decodeURIComponent(sms).includes("a day ride"),
      mailSaysNight: decodeURIComponent(mail).includes("a night ride"),
      panelSaysNight: decodeURIComponent(panelSms).includes("a night ride") && decodeURIComponent(panelMail).includes("a night ride"),
      panelSaysDay: decodeURIComponent(panelSms).includes("a day ride"),
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
/** The checks of a change to night (2 and 15), on what was drawn (`s`) and the state after (`end`). */
function checkToNight(n, s, end) {
  const flip = s.find((x) => x.theme === "night");
  check(`${n} sunset, then twilight, then night are drawn`, Math.max(...s.map((x) => x.sunset)) >= 0.95 && Math.max(...s.map((x) => x.twilight)) >= 0.95 && s.at(-1).night === 1, s.map((x) => [x.sunset, x.twilight, x.night]));
  check(`${n} night arrives smoothly (no jumps back)`, nonDecreasing(s.map((x) => x.night)) && nonDecreasing(s.map((x) => x.twilight)), s.map((x) => x.night));
  check(`${n} the sun sets (down, then gone); the stars come out`, nonDecreasing(s.map((x) => x.sunY)) && s.at(-1).sun === 0 && s.at(-1).stars >= 0.99, s.map((x) => [x.sunY, x.sun, x.stars]));
  check(`${n} theme flips at mid-twilight`, flip && flip.sunset >= 0.99 && flip.twilight >= 0.15 && flip.twilight <= 0.6 && flip.night === 0, flip);
  check(`${n} preference saved and used (Contact scene, booking panel)`, end.stored.period === "night" && end.smsSaysNight && end.mailSaysNight && end.panelSaysNight && /night ride/.test(end.quoteStatus) && !end.changing, end);
  return flip;
}
/** The checks of a change back to day by the picker's arrow key (3 and 15). */
function checkBackToDay(n, b, endDay, focused) {
  check(`${n} back through twilight and sunrise`, nonIncreasing(b.map((x) => x.night)) && nonIncreasing(b.map((x) => x.twilight)) && b.at(-1).sunset === 0 && b.at(-1).sun === 1 && nonIncreasing(b.map((x) => x.sunY)), b.map((x) => [x.night, x.twilight, x.sunset, x.sun]));
  check(`${n} arrow key moved the choice and focus`, endDay.stored.period === "day" && focused === "Day ride" && endDay.smsSaysDay && endDay.panelSaysDay && endDay.sky === "day", { endDay, focused });
}
const focusedRadio = (page) => page.evaluate(() => (document.activeElement?.textContent?.trim().startsWith("Day ride") ? "Day ride" : document.activeElement?.textContent?.trim()));

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
  const at = await place(page);
  await headerRadio(page, "Night ride").click();
  const s = await sampleSky(page, 6200);
  const end = await sky(page);
  const flip = checkToNight(2, s, end);
  results["2 switch to night"] = { world: at, samples: s.filter((_, i) => i % 6 === 0), flip, end };
  check("2 sideways world (the sky behind it)", at.axis === "x", at);

  // 3. The big picker, by keyboard → day: back down (twilight, sunrise, morning). Arrows are also the world's
  //    keys, but on a radio they belong to the radio: the world stays where it is.
  await toScene(page, "#day-night");
  await page.waitForTimeout(300);
  await pickerRadio(page, "Night ride").focus();
  const before = await place(page);
  await page.keyboard.press("ArrowLeft");
  const b = await sampleSky(page, 6200);
  const focused = await focusedRadio(page);
  const endDay = await sky(page);
  const after = await place(page);
  results["3 keyboard back to day"] = { samples: b.filter((_, i) => i % 6 === 0), focused, end: endDay, world: { before: before.at, after: after.at } };
  checkBackToDay(3, b, endDay, focused);
  check("3 the arrow key didn't move the world", before.axis === "x" && Math.abs(after.at - before.at) <= 1, { before, after });
  await ctx.close();
}

// 4. The sky itself: the moon (by day) and the sun on the bare sky switch; a click on a panel over the moon, or on
//    the tunnel scene, doesn't.
{
  const { ctx, page } = await open({}, { prefs: { period: "day" } });
  await introSettled(page);
  /**
   * Move the world so the body sits in a gap between two scenes' panels (bare) or on a panel (covered); return
   * where to click. Panels glide in as they arrive (a scroll-driven transform), so every spot is re-measured.
   */
  const aim = (which, covered) =>
    page.evaluate(
      async ([which, covered]) => {
        const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const w = document.querySelector("[data-world]");
        const el = document.querySelector(which === "moon" ? "[data-sky-moon]" : "[data-sky-sun]");
        const centre = () => {
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        };
        const t = centre();
        const at = (x) => w.getBoundingClientRect().left - w.scrollLeft + x; // a place along the world → on screen
        const along = (x) => x - w.getBoundingClientRect().left + w.scrollLeft; // on screen → along the world
        const panels = () => [...document.querySelectorAll("main [data-panel], #footer [data-panel]")];
        const hitAt = (c) => {
          const hit = document.elementFromPoint(c.x, c.y);
          // Would anything but the panel keep this click from the sky (sky-engine.ts bodyAt: content, controls)?
          const content = Boolean(hit?.closest("a,button,input,select,textarea,label,summary,details,dialog,header,footer,p,h1,h2,h3,h4,li,dt,dd,img,picture,video,svg,canvas"));
          return { onPanel: Boolean(hit?.closest("[data-panel]")), inTunnel: Boolean(hit?.closest("#top")), content, hit: hit?.tagName };
        };
        if (covered) {
          // A spot on a panel's own glass (not on its text, media or controls): only the panel keeps it from the sky.
          for (const p of panels()) {
            const r0 = p.getBoundingClientRect();
            if (r0.width < 300 || t.y < r0.top + 40 || t.y > r0.bottom - 40) continue;
            const from = along(r0.left);
            for (let dx = 40; dx < r0.width - 40; dx += 24) {
              w.scrollTo({ left: from + dx - t.x, behavior: "instant" });
              await frame();
              const c = centre();
              const h = hitAt(c);
              if (h.onPanel && !h.content) return { ...c, ...h, world: Math.round(w.scrollLeft) };
            }
          }
          return { missing: "no bare glass of a panel under the body" };
        }
        // Each boundary between two scenes after the tunnel, under the body; the clear sky around it at its height.
        const scenes = [...document.querySelectorAll("main [data-scene], #footer")];
        for (let i = 1; i < scenes.length; i++) {
          const boundary = along(scenes[i].getBoundingClientRect().left);
          w.scrollTo({ left: boundary - t.x, behavior: "instant" });
          await frame();
          const c = centre();
          const rows = panels().map((p) => p.getBoundingClientRect()).filter((r) => r.top <= c.y && r.bottom >= c.y);
          const leftEdge = Math.max(-Infinity, ...rows.filter((r) => r.right <= c.x).map((r) => r.right));
          const rightEdge = Math.min(Infinity, ...rows.filter((r) => r.left >= c.x).map((r) => r.left));
          const h = hitAt(c);
          if (!h.onPanel && !h.inTunnel && c.x - leftEdge >= 20 && rightEdge - c.x >= 20)
            return { ...c, ...h, gap: [Math.round(leftEdge), Math.round(rightEdge)], between: [scenes[i - 1].id, scenes[i].id], world: Math.round(w.scrollLeft), boundaryOnScreen: Math.round(at(boundary)) };
        }
        return { missing: "no bare sky under the body" };
      },
      [which, covered],
    );
  const paused = () => page.evaluate(() => document.querySelector("[data-sky-layer]").hasAttribute("data-paused"));
  /** Click there (nothing to click if no such spot was found: the check then fails on `missing`). */
  const clickAt = async (spot) => spot.missing || (await page.mouse.click(spot.x, spot.y));
  const coveredMoon = await aim("moon", true);
  await clickAt(coveredMoon);
  await page.waitForTimeout(300);
  const afterPanel = await sky(page);
  // The tunnel scene over the moon, with the next scene already in (the sky running): its stage keeps its clicks.
  const moonX = await page.evaluate(() => { const r = document.querySelector("[data-sky-moon]").getBoundingClientRect(); return r.left + r.width / 2; });
  const { width } = page.viewportSize();
  await moveWorld(page, (await tunnelEnd(page)) + (width - moonX - 120));
  await page.waitForTimeout(300);
  const tunnelMoon = await page.evaluate(() => {
    const r = document.querySelector("[data-sky-moon]").getBoundingClientRect();
    const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const hit = document.elementFromPoint(c.x, c.y);
    // (On the stage's own layers, not its text or media: only the tunnel scene keeps this click from the sky.)
    const content = Boolean(hit?.closest("a,button,p,h1,h2,h3,h4,li,img,picture,video,svg,canvas,[data-panel]"));
    return { ...c, inTunnel: Boolean(hit?.closest("#top")), content, hit: hit?.tagName, skyRunning: !document.querySelector("[data-sky-layer]").hasAttribute("data-paused") };
  });
  await page.mouse.click(tunnelMoon.x, tunnelMoon.y);
  await page.waitForTimeout(300);
  const afterTunnel = await sky(page);
  const bareMoon = await aim("moon", false);
  const pausedAtMoon = await paused();
  await clickAt(bareMoon);
  await page.waitForTimeout(6000);
  const afterMoon = await sky(page);
  // Back to day with the header, then click the sun on the bare sky.
  await headerRadio(page, "Day ride").click();
  await page.waitForTimeout(6000);
  const bareSun = await aim("sun", false);
  await headerRadio(page, "Night ride").click();
  await page.waitForTimeout(400); // a moment into the change: the sun is still up
  await clickAt(bareSun);
  await page.waitForTimeout(6000);
  const afterSun = await sky(page);
  results["4 clicking the sky"] = { coveredMoon, afterPanel: afterPanel.stored.period, tunnelMoon, afterTunnel: afterTunnel.stored.period, bareMoon, pausedAtMoon, afterMoon: afterMoon.stored.period, bareSun, afterSun: afterSun.stored.period };
  check("4 a click on a panel over the moon doesn't switch", !coveredMoon.missing && coveredMoon.onPanel && !coveredMoon.content && afterPanel.stored.period === "day" && !afterPanel.changing, { coveredMoon, afterPanel });
  check("4 a click on the tunnel scene over the moon doesn't switch", tunnelMoon.inTunnel && !tunnelMoon.content && tunnelMoon.skyRunning && afterTunnel.stored.period === "day" && !afterTunnel.changing, { tunnelMoon, afterTunnel });
  check("4 the moon on the bare sky picks night", !bareMoon.missing && !bareMoon.onPanel && !pausedAtMoon && afterMoon.stored.period === "night" && afterMoon.sky === "night", { bareMoon, afterMoon });
  check("4 the sun on the bare sky picks day", !bareSun.missing && !bareSun.onPanel && afterSun.stored.period === "day" && afterSun.sky === "day", { bareSun, afterSun });
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

// 6. Reduced motion: a short crossfade where nothing travels, no twinkle, no parallax, still clouds.
{
  const { ctx, page } = await open({ reducedMotion: "reduce" }, { prefs: { period: "day" }, gl: true });
  const pos = () => page.evaluate(() => ["[data-sky-sun]", "[data-sky-moon]"].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; }));
  const before = await pos();
  const world = await place(page);
  await resetClouds(page);
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
  // Drawn through the change with the world far along (the bus scene, a few screens in): never offset by it.
  const parallax = await clouds(page);
  await toScene(page, "#faq");
  // Everything over the sky hidden (the world with its scenes and road, the header, the guide bus, the progress line).
  await page.addStyleTag({ content: "body > :not([data-sky-layer]), body > :not([data-sky-layer]) * { visibility: hidden !important; }" });
  await page.waitForTimeout(400);
  const cloudCanvas = page.locator("[data-sky-clouds]");
  const a = await cloudCanvas.screenshot();
  await page.waitForTimeout(2500);
  const b = await cloudCanvas.screenshot();
  const [sa, sb] = await Promise.all([sharp(a).raw().toBuffer(), sharp(b).raw().toBuffer()]);
  let diff = 0;
  for (let i = 0; i < sa.length; i++) diff += Math.abs(sa[i] - (sb[i] ?? 0));
  const moved = during.some((p) => JSON.stringify(p) !== JSON.stringify(before));
  results["6 reduced motion"] = { before, during, done: { sky: done.sky, changing: done.changing, night: drawn.night }, twinkle, parallax: { world, ...parallax }, cloudPixelDiff: diff };
  check("6 short change", done.sky === "night" && drawn.night === 1 && !done.changing, done);
  check("6 the sun and moon never travel", !moved, { before, during });
  check("6 no twinkle", twinkle === "none", twinkle);
  check("6 no parallax: the clouds' scroll offset stays 0 with the world screens along", world.axis === "x" && world.at > world.screen && parallax.sent > 0 && parallax.maxAbs === 0, { world, parallax });
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
    // A deep link: the world lands on the packages scene, past the tunnel (where the sky would be paused).
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

// 8. Under the tunnel scene the sky is paused (no cloud drawing, no twinkle): at the start of the world, and while
//    its stage still covers the screen; running once the world is past it; paused again back at the start.
{
  const { ctx, page } = await open({}, { url: URL, prefs: { period: "night" }, gl: true });
  const state = async () => {
    await page.waitForTimeout(500);
    await resetClouds(page);
    await page.waitForTimeout(1000);
    return {
      ...(await place(page)),
      paused: await page.evaluate(() => document.querySelector("[data-sky-layer]").hasAttribute("data-paused")),
      drawsPerSecond: (await clouds(page)).draws,
    };
  };
  await page.waitForFunction(() => document.querySelector("[data-sky-layer]").hasAttribute("data-paused"), null, { timeout: 3000 }).catch(() => {});
  const atStart = await state();
  await introSettled(page);
  const end = await tunnelEnd(page);
  await moveWorld(page, end - 40);
  const stageCovering = await state();
  await moveWorld(page, end + 100);
  const tunnelLeaving = await state(); // reported: the next scene's edge is in, the sky shows beside the stage
  await toScene(page, "#bus");
  const past = await state();
  await moveWorld(page, 0);
  const backAtStart = await state();
  results["8 paused under the tunnel"] = { atStart, stageCovering, tunnelLeaving, past, backAtStart };
  check("8 paused at the start of the world, nothing drawn", atStart.axis === "x" && atStart.at === 0 && atStart.paused && atStart.drawsPerSecond === 0, atStart);
  check("8 still paused while the tunnel's stage covers the screen", stageCovering.paused && stageCovering.drawsPerSecond === 0, stageCovering);
  check("8 running past the tunnel (the clouds drawn)", !past.paused && past.drawsPerSecond > 0, past);
  check("8 paused again back at the start", backAtStart.at === 0 && backAtStart.paused && backAtStart.drawsPerSecond === 0, backAtStart);
  await ctx.close();
}

// 9. Phone: the switch is in the menu drawer. The menu button names the drawer (aria-controls) and says
//    whether it's open (aria-expanded) through every way out: Esc, the backdrop, a link (which glides the world
//    to its scene). The drawer's "Book your ride" opens the booking panel over the world.
{
  const { ctx, page } = await open(phone, { prefs: { period: "day" } });
  const menuButton = page.locator('[data-site-header] button[aria-haspopup="dialog"]');
  /** The button's aria-expanded, whether its aria-controls names the drawer, and whether that's open. */
  const menu = () =>
    menuButton.evaluate((b) => {
      const target = document.getElementById(b.getAttribute("aria-controls") ?? "");
      return { expanded: b.getAttribute("aria-expanded"), controlsDialog: target?.tagName === "DIALOG", open: Boolean(target?.open) };
    });
  /** Where the world is, which scene has focus, the booking panel, and whether the page itself overflows. */
  const world = () =>
    page.evaluate(() => {
      const h = document.documentElement;
      const panel = document.querySelector('[data-field="date"]')?.closest("dialog");
      const f = document.activeElement;
      return {
        axis: h.dataset.axis,
        at: Math.round(document.querySelector("[data-world]").scrollLeft),
        hash: location.hash,
        packagesLeft: Math.round(document.getElementById("packages").getBoundingClientRect().left),
        focusScene: f?.closest("[data-scene]")?.id ?? null,
        focusIsMenuButton: Boolean(f?.matches('[data-site-header] button[aria-haspopup="dialog"]')),
        pageOverflow: [h.scrollWidth - innerWidth, h.scrollHeight - innerHeight, scrollX, scrollY],
        booking: panel && {
          open: panel.open,
          name: document.getElementById(panel.getAttribute("aria-labelledby") ?? "")?.textContent ?? null,
          focusInside: panel.contains(f),
          nightChecked: panel.querySelector('[role=radio][aria-label="Night ride"]')?.getAttribute("aria-checked") === "true",
          smsSaysNight: decodeURIComponent(panel.querySelector('a[href^="sms:"]')?.getAttribute("href") ?? "").includes("a night ride"),
        },
      };
    });
  /** Until the world's glide has landed (two readings 250 ms apart agree; at most 5 s). */
  const settle = async () => {
    let last = (await place(page)).at;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(250);
      const now = (await place(page)).at;
      if (now === last) return;
      last = now;
    }
  };
  const headerSwitchVisible = await page.locator("[data-site-header] > div [role=radiogroup]").isVisible();
  const closed = await menu();
  await menuButton.click();
  await page.waitForTimeout(400);
  const opened = await menu();
  await page.locator('dialog[open] [role=radio][aria-label="Night ride"]').click();
  await page.waitForTimeout(6000);
  const s = await sky(page);
  const atStart = await world();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const afterEsc = await menu();
  await menuButton.click();
  await page.waitForTimeout(400);
  const drawer = await page.locator("dialog[open]").boundingBox();
  await page.mouse.click(drawer.x / 2, drawer.y + drawer.height / 2); // the backdrop, left of the drawer
  await page.waitForTimeout(400);
  const afterBackdrop = await menu();
  await menuButton.click();
  await page.waitForTimeout(400);
  await page.locator('dialog[open] nav[aria-label="Mobile"] a', { hasText: "Packages" }).click();
  await page.waitForTimeout(400);
  await settle();
  const afterLink = { ...(await menu()), ...(await world()) };
  // The drawer's "Book your ride": the booking panel over the world (the drawer closes first).
  await menuButton.click();
  await page.waitForTimeout(400);
  await page.locator("dialog[open] a", { hasText: "Book your ride" }).click();
  await page.waitForTimeout(600);
  const booking = { ...(await menu()), ...(await world()) };
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const bookingClosed = await world();
  results["9 phone"] = { headerSwitchVisible, sky: s.sky, period: s.stored.period, atStart, menu: { closed, opened, afterEsc, afterBackdrop, afterLink }, booking, bookingClosed };
  check("9 drawer switch works", !headerSwitchVisible && s.stored.period === "night" && s.sky === "night", { headerSwitchVisible, sky: s.sky, period: s.stored.period });
  check("9 the page itself never overflows (the world scrolls inside the screen)", atStart.axis === "x" && atStart.pageOverflow.every((v) => v === 0), atStart);
  check("9 the menu button names the drawer (aria-controls)", closed.controlsDialog, closed);
  check("9 the menu button says collapsed, then expanded", closed.expanded === "false" && !closed.open && opened.expanded === "true" && opened.open, { closed, opened });
  check("9 the menu button collapses with the drawer (Esc, backdrop, link)", [afterEsc, afterBackdrop, afterLink].every((m) => m.expanded === "false" && !m.open) && afterLink.hash === "#packages", { afterEsc, afterBackdrop, afterLink });
  check("9 a drawer link glides the world to its scene's start (and focus there)", Math.abs(afterLink.packagesLeft) <= 2 && afterLink.focusScene === "packages" && afterLink.pageOverflow.every((v) => v === 0), afterLink);
  check("9 the drawer's Book opens the booking panel over the world", booking.expanded === "false" && !booking.open && booking.booking?.open && booking.booking.name === "Book your ride" && booking.booking.focusInside && booking.at === afterLink.at, booking);
  check("9 the booking panel carries the sky chosen in the drawer", booking.booking?.nightChecked && booking.booking.smsSaysNight, booking.booking);
  check("9 Esc closes the booking panel, focus back on the menu button, the world where it was", !bookingClosed.booking?.open && bookingClosed.focusIsMenuButton && bookingClosed.at === afterLink.at, bookingClosed);
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
  /**
   * Put `sel` in place. Sideways (the world moves; the panels sit between the header and the road, so a
   * target's height on screen is the layout's): "arrived" = its scene at its start, as a nav link or the scene
   * keys bring it, the target brought fully on screen if it's further along (as keyboard focus does);
   * "middle" = as near the middle of the screen as the target can be with its panel at rest (a panel still
   * gliding in is translucent). Down the column (the page moves): "middle" = centred, "top" = just under the
   * header. The header (fixed): "scene" = the world at the bus scene, "tunnel" = at the tunnel's resting point.
   */
  const put = (loc, where) =>
    loc.evaluate(async (el, where) => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const w = document.querySelector("[data-world]");
      const header = document.querySelector("[data-site-header]")?.getBoundingClientRect().height ?? 64;
      if (document.documentElement.dataset.axis !== "x") {
        const r = el.getBoundingClientRect();
        // Just under the header, but not inside html's scroll-padding (the screenshot would scroll it out of there).
        const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        const y = where === "top" ? Math.max(header + 8, padding + 2) : (innerHeight - r.height) / 2;
        window.scrollBy({ top: r.top - y, behavior: "instant" });
        await frame();
        return { ok: true };
      }
      const W = w.clientWidth;
      const along = (x) => x - w.getBoundingClientRect().left + w.scrollLeft;
      if (where === "scene" || where === "tunnel") {
        const left = where === "tunnel" ? document.getElementById("top").offsetWidth - W : along(document.getElementById("bus").getBoundingClientRect().left);
        w.scrollTo({ left, behavior: "instant" });
        await frame();
        return { ok: true, at: Math.round(w.scrollLeft) };
      }
      const scene = el.closest("[data-scene]");
      const panel = el.closest("[data-panel]");
      w.scrollTo({ left: along(scene.getBoundingClientRect().left), behavior: "instant" });
      await frame();
      const margin = Math.min(32, W * 0.05);
      let r = el.getBoundingClientRect();
      if (r.left < margin || r.right > W - margin) {
        const shift = r.right > W - margin && r.width < W - 2 * margin ? r.right - (W - margin) : r.left - margin;
        w.scrollBy({ left: shift, behavior: "instant" });
        await frame();
        r = el.getBoundingClientRect();
      }
      // Arrived: its glide-in (a scroll-driven animation) is over: opaque and untransformed.
      const atRest = () => {
        const cs = getComputedStyle(panel);
        return +cs.opacity === 1 && (cs.transform === "none" || new DOMMatrix(cs.transform).isIdentity);
      };
      if (where === "middle") {
        // Towards the middle (never past the screen's edges); if that leaves its panel still gliding in from the
        // right, back along towards where it arrived until the panel is at rest.
        const shift = Math.max(r.right - W, Math.min(r.left, r.left + r.width / 2 - W / 2));
        w.scrollBy({ left: shift, behavior: "instant" });
        await frame();
        for (let i = 0; i < 200 && !atRest(); i++) {
          w.scrollBy({ left: 8, behavior: "instant" });
          await frame();
        }
        r = el.getBoundingClientRect();
      }
      return { ok: atRest() && r.left >= 0 && r.right <= W && r.top >= header && r.bottom <= innerHeight, at: Math.round(w.scrollLeft), x: Math.round(r.left + r.width / 2), atRest: atRest() };
    }, where);
  /** The worst contrast of `sel` against the pixels really behind it, with the element put `where`. */
  async function measure(page, sel, where) {
    const loc = page.locator(sel).first();
    if (!(await loc.count())) return null;
    const placed = await put(loc, where);
    // (Over the tunnel: the film's scrub catches up with the jump first.)
    await page.waitForTimeout(where === "tunnel" ? 1500 : 250);
    const before = await place(page);
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
    // The screenshot mustn't have moved the world (or the page) to get the element: then it measured elsewhere.
    const held = (await place(page)).at === before.at;
    const { data, info: meta } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
    const px = [];
    for (let i = 0; i < data.length; i += meta.channels * 7) px.push([data[i], data[i + 1], data[i + 2]]);
    px.sort((a, b) => lum(a) - lum(b));
    const lo = px[Math.floor(px.length * 0.1)] ?? px[0];
    const hi = px[Math.floor(px.length * 0.9)] ?? px[0];
    const large = info.size >= 24 || (info.size >= 18.66 && info.weight >= 700);
    return { ratio: +Math.min(ratio(info.color, lo), ratio(info.color, hi)).toFixed(2), needs: large ? 3 : 4.5, placed: placed.ok && held, at: placed.at, x: placed.x };
  }
  const targets = [
    ["section heading", "#packages h2"],
    ["lede (muted)", "#packages h2 + p"],
    ["eyebrow (gold)", "#packages [data-panel] p.uppercase"],
    ["card text", "#packages article p"],
    ["faq answer", "#faq details[open] p"],
    ["day/night status", "#day-night [data-panel] p.text-muted-foreground"],
    ["contact lede", "#contact h2 + p"],
    ["footer link", "footer nav a"],
  ];
  // A muted link (the one marked "you are here" is brighter).
  const headerLink = "[data-site-header] nav a:not([aria-current])";
  const out = {};
  for (const period of ["day", "night"]) {
    const { ctx, page } = await open({}, { prefs: { period } });
    await introSettled(page);
    const rows = [];
    for (const [label, sel] of targets) {
      for (const where of ["arrived", "middle"]) {
        const r = await measure(page, sel, where);
        rows.push({ label: `${label} (${where})`, ...(r ?? { missing: sel }) });
      }
    }
    for (const where of ["scene", "tunnel"]) {
      const r = await measure(page, headerLink, where);
      rows.push({ label: `header link (over the ${where})`, ...(r ?? { missing: headerLink }) });
    }
    // The 404 page: its text on glass too (a classic page: no world).
    await page.goto(`${URL}nope`, { waitUntil: "load" });
    await page.waitForTimeout(800);
    for (const [label, sel] of [["404 heading", "main h1"], ["404 text", "main p.text-muted-foreground"], ["404 header link", "[data-site-header] nav a"]]) {
      const r = await measure(page, sel, "middle");
      rows.push({ label, ...(r ?? { missing: sel }) });
    }
    out[period] = rows;
    await ctx.close();

    // The column (a phone on its side): the same scenes down the page, mid-screen and just under the header.
    // (Its header has no nav links below xl: they're in the menu drawer.)
    const col = await open(landscape, { prefs: { period } });
    const colRows = [];
    const axis = await place(col.page);
    for (const [label, sel] of targets) {
      for (const where of ["middle", "top"]) {
        const r = await measure(col.page, sel, where);
        colRows.push({ label: `${label} (${where})`, ...(r ?? { missing: sel }) });
      }
    }
    out[`${period}, column 844x390`] = { axis: axis.axis, rows: colRows };
    check(`10 ${period} column 844x390 is a column`, axis.axis === "y", axis);
    await col.ctx.close();
  }
  results["10 contrast"] = out;
  for (const [period, v] of Object.entries(out)) for (const r of Array.isArray(v) ? v : v.rows) check(`10 ${period} ${r.label}`, !r.missing && r.placed && r.ratio >= r.needs, r);
}

// 11. Frame rate: sweeping the world sideways, and during a change (the bus scene in view, and the FAQ).
//     Desktop, and phone at 4x CPU.
{
  const sweep = (page, ms) =>
    page.evaluate(
      (ms) =>
        new Promise((resolve) => {
          const w = document.querySelector("[data-world]");
          const start = document.querySelector("#main").getBoundingClientRect().left - w.getBoundingClientRect().left + w.scrollLeft;
          const end = w.scrollWidth - w.clientWidth;
          const frames = [];
          const t0 = performance.now();
          const step = (t) => {
            const k = Math.min(1, (t - t0) / ms);
            w.scrollTo({ left: start + (end - start) * k, behavior: "instant" });
            frames.push(t);
            if (k < 1) requestAnimationFrame(step);
            else resolve({ frames, travelled: Math.round(w.scrollLeft - start), sideways: document.documentElement.dataset.axis === "x" });
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
  const swept = {};
  for (const [dev, opts, rate] of [["desktop", desktop, 1], ["phone 4x", phone, 4]]) {
    for (const period of ["day", "night"]) {
      const { ctx, page } = await open(opts, { prefs: { period } });
      await introSettled(page);
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate });
      const sw = await sweep(page, 8000);
      out[`${dev} ${period} sweep`] = stats(sw.frames);
      swept[`${dev} ${period}`] = { sideways: sw.sideways, travelled: sw.travelled };
      const target = period === "day" ? "night" : "day";
      // The phone keeps its switch in the drawer: use the picker's radio there (clicked without moving the world to it).
      const radio = (p) => (dev === "desktop" ? headerRadio(page, name(p)) : pickerRadio(page, name(p)));
      for (const at of ["#bus", "#faq"]) {
        await toScene(page, at);
        await page.waitForTimeout(400);
        await radio(target).evaluate((el) => el.click());
        out[`${dev} ${period}→${target} change at ${at}`] = stats(await idle(page, 5400));
        await radio(period).evaluate((el) => el.click()); // …and back, for the next measurement
        await page.waitForTimeout(5600);
      }
      await ctx.close();
    }
  }
  results["11 frame rate"] = { ...out, swept };
  for (const [k, v] of Object.entries(swept)) check(`11 ${k} the sweep went along the world`, v.sideways && v.travelled > 2000, v);
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

// 13. "Meet the bus": on a phone the feature list sits beside the photo, a screen on along the world, so a tapped
//     hotspot's text opens off screen: the world glides along to it. Screen readers hear what a tap opened (not
//     what a list pick opened: that button holds its text). The taps, inside a panel, never reach the sky. On a
//     desktop the photo and the list fit on screen together: a tap there leaves the world where it is.
{
  /** Tap (or click) `spot` on the photo; report the opened feature, whether it's on screen, and how far the world moved. */
  const pickOnPhoto = async (page, spot, how) => {
    const before = (await place(page)).at;
    await (how === "tap" ? spot.tap() : spot.click());
    await page.waitForTimeout(1400); // the text opens (0.3 s), then the world glides if it must
    return spot.evaluate((el, before) => {
      const w = document.querySelector("[data-world]");
      const item = document.querySelector('#bus ul button[aria-expanded="true"]');
      const r = item.getBoundingClientRect();
      const s = el.getBoundingClientRect();
      return {
        label: el.textContent.trim(),
        body: item.lastElementChild?.textContent?.trim() ?? "",
        left: Math.round(r.left),
        right: Math.round(r.right),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        header: Math.round(document.querySelector("[data-site-header]").getBoundingClientRect().bottom),
        screen: [innerWidth, innerHeight],
        moved: Math.round(w.scrollLeft - before),
        hotspotOnScreen: s.left >= 0 && s.right <= innerWidth && s.top >= 0 && s.bottom <= innerHeight,
        told: document.querySelector("#bus [role=status]")?.textContent ?? null,
      };
    }, before);
  };
  const onScreen = (x) => x.left >= 0 && x.right <= x.screen[0] && x.top >= x.header && x.bottom <= x.screen[1];

  const { ctx, page } = await open(phone, { prefs: { period: "day" } });
  // Past the tunnel its engine still starts once the film is in: let it, so nothing re-measures mid-check.
  await introSettled(page);
  await toScene(page, "#bus");
  await page.getByRole("tab", { name: "Interior" }).tap();
  await page.waitForTimeout(800);
  const hotspots = page.locator("#bus [role=tabpanel] button[aria-pressed]");
  const layout = await page.evaluate(() => ({
    photoRight: Math.round(document.querySelector("#bus [role=tabpanel]").getBoundingClientRect().right),
    listLeft: Math.round(document.querySelector("#bus ul").getBoundingClientRect().left),
    screen: innerWidth,
  }));
  const far = await pickOnPhoto(page, hotspots.last(), "tap");
  await page.locator("#bus ul button").nth(2).tap();
  await page.waitForTimeout(600);
  const afterList = await page.evaluate(() => document.querySelector("#bus [role=status]")?.textContent ?? null);
  const s = await sky(page);
  await ctx.close();

  // Desktop: the world moved so the photo and the whole list are on screen (the list with the margin a reveal keeps
  // to the panel's edge: its items' scroll-margin); a hotspot whose text opens in view.
  const d = await open({}, { prefs: { period: "day" } });
  await introSettled(d.page);
  await toScene(d.page, "#bus");
  const shifted = await d.page.evaluate(() => {
    const w = document.querySelector("[data-world]");
    const list = document.querySelector("#bus ul").getBoundingClientRect();
    const margin = parseFloat(getComputedStyle(document.querySelector("#bus ul li")).scrollMarginRight) || 0;
    w.scrollBy({ left: Math.max(0, list.right - (innerWidth - margin - 4)), behavior: "instant" });
    const photo = document.querySelector("#bus [role=tabpanel]").getBoundingClientRect();
    const l = document.querySelector("#bus ul").getBoundingClientRect();
    return { photo: [Math.round(photo.left), Math.round(photo.right)], list: [Math.round(l.left), Math.round(l.right)], margin, screen: innerWidth };
  });
  await d.page.waitForTimeout(400);
  const near = await pickOnPhoto(d.page, d.page.locator("#bus [role=tabpanel] button[aria-pressed]").nth(1), "click");
  const ds = await sky(d.page);
  await d.ctx.close();

  results["13 meet the bus"] = { phone: { layout, far, afterList, sky: s.sky, period: s.stored.period }, desktop: { shifted, near, sky: ds.sky, period: ds.stored.period } };
  check("13 phone: the list sits a screen on from the photo", layout.listLeft >= layout.screen, layout);
  check("13 phone: a feature tapped on the photo comes on screen, the world moving sideways to it", onScreen(far) && far.moved > 0, far);
  check("13 desktop: already on screen, the world stays put", shifted.photo[0] >= 0 && shifted.list[1] <= shifted.screen && onScreen(near) && near.moved === 0, { shifted, near });
  check("13 screen readers hear what a tap opened", [far, near].every((x) => x.body && x.told?.includes(x.label) && x.told.includes(x.body)), { far: far.told, near: near.told });
  check("13 a pick in the list isn't announced again", afterList === "", afterList);
  check("13 the taps never reach the sky", s.sky === "day" && s.stored.period === "day" && ds.sky === "day" && ds.stored.period === "day", { phone: s, desktop: ds });
}

// 14. The clouds' parallax follows the world: the shader's uScroll is [screens along the world, screens down the
//     page], so moving sideways (a jump, a mouse wheel turned sideways, an arrow key) drifts the clouds sideways.
{
  const { ctx, page } = await open({}, { prefs: { period: "day" }, gl: true });
  await introSettled(page);
  const read = async () => {
    await page.waitForTimeout(700); // the wheel's easing has landed, and the sky has drawn
    const p = await place(page);
    const c = await clouds(page);
    return { at: p.at, screens: +(p.at / p.screen).toFixed(4), uScroll: c.scroll?.map((v) => +v.toFixed(4)) ?? null };
  };
  await toScene(page, "#bus");
  const atBus = await read();
  await moveWorld(page, atBus.at + page.viewportSize().width);
  const jumped = await read();
  // A mouse wheel over the road (nothing there scrolls down): the world turns it sideways.
  await page.mouse.move(page.viewportSize().width / 2, page.viewportSize().height - 20);
  await page.mouse.wheel(0, 400);
  const wheeled = await read();
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.keyboard.press("ArrowLeft");
  const keyed = await read();
  const steps = { atBus, jumped, wheeled, keyed };
  results["14 cloud parallax follows the world"] = steps;
  const follows = (s) => s.uScroll && Math.abs(s.uScroll[0] - s.screens) < 0.01 && s.uScroll[1] === 0;
  check("14 the clouds' offset is the world's place (screens along x, none down)", Object.values(steps).every(follows), steps);
  check("14 it moves with the world: a jump, the wheel and a key", jumped.uScroll?.[0] > atBus.uScroll?.[0] + 0.9 && wheeled.at > jumped.at && wheeled.uScroll?.[0] > jumped.uScroll?.[0] && keyed.at < wheeled.at && keyed.uScroll?.[0] < wheeled.uScroll?.[0], steps);
  await ctx.close();
}

// 15. The column: a phone on its side is too short for side-by-side scenes, so the world runs down the page. The
//     day/night switch, the picker and the parallax work there too, and the sky still rests under the tunnel.
{
  const { ctx, page } = await open(landscape, { prefs: { period: "day" }, gl: true });
  const at = await place(page);
  const world = await page.evaluate(() => ({ axis: document.documentElement.dataset.axis ?? null, worldScrolls: document.querySelector("[data-world]").scrollWidth > document.querySelector("[data-world]").clientWidth + 1, scrollY: Math.round(scrollY) }));
  await headerRadio(page, "Night ride").click();
  const s = await sampleSky(page, 6200);
  const end = await sky(page);
  const flip = checkToNight(15, s, end);
  // The picker by keyboard, back to day: the arrow moves the choice, not the page.
  await page.locator("#day-night [role=radiogroup]").evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.waitForTimeout(300);
  await pickerRadio(page, "Night ride").focus();
  const y0 = (await place(page)).at;
  await page.keyboard.press("ArrowLeft");
  const b = await sampleSky(page, 6200);
  const focused = await focusedRadio(page);
  const endDay = await sky(page);
  const y1 = (await place(page)).at;
  checkBackToDay(15, b, endDay, focused);
  // The parallax down the page: [0, screens down].
  await moveWorld(page, y1 + 2 * page.viewportSize().height);
  await page.waitForTimeout(500);
  const down = { ...(await place(page)), uScroll: (await clouds(page)).scroll };
  await ctx.close();
  // At the top (no deep link): under the tunnel, paused; down at the scenes, running.
  const top = await open(landscape, { url: URL, prefs: { period: "night" } });
  await top.page.waitForFunction(() => document.querySelector("[data-sky-layer]").hasAttribute("data-paused"), null, { timeout: 3000 }).catch(() => {});
  const pausedAtTop = await top.page.evaluate(() => document.querySelector("[data-sky-layer]").hasAttribute("data-paused"));
  await introSettled(top.page);
  await toScene(top.page, "#bus");
  await top.page.waitForTimeout(600);
  const pausedBelow = await top.page.evaluate(() => document.querySelector("[data-sky-layer]").hasAttribute("data-paused"));
  await top.ctx.close();
  results["15 the column (844x390)"] = { at, world, flip, end, focused, endDay, pickerScroll: { before: y0, after: y1 }, down, pausedAtTop, pausedBelow };
  check("15 a column: no sideways world, the page scrolls down", world.axis === "y" && !world.worldScrolls && world.scrollY > 0, world);
  check("15 the arrow key didn't move the page", y0 === y1, { y0, y1 });
  check("15 the parallax follows the page down", down.uScroll && down.uScroll[0] === 0 && Math.abs(down.uScroll[1] - down.at / down.screen) < 0.01, down);
  check("15 paused under the tunnel at the top, running down at the scenes", pausedAtTop && !pausedBelow, { pausedAtTop, pausedBelow });
}

await browser.close();
console.log(JSON.stringify(results, null, 1));
if (uncaught.length) failures.push(...[...new Set(uncaught)].map((m) => `uncaught: ${m}`));
const total = failures.length;
if (total) {
  console.error(`\n${total} check(s) failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else console.error("\nAll sky checks passed.");
