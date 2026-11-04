#!/usr/bin/env node
/**
 * Checks for the gallery (src/components/home/gallery-preview.tsx: the #gallery scene of the homepage's
 * sideways world, src/components/world) and its lightbox, in Chromium.
 *
 *   npm run test:gallery -- [baseUrl]
 *
 * Needs a running production server (`npm run build && npx next start -p 3100`).
 * The gallery has no real photos yet (every item is an illustrated sample), so two of its items
 * get test photos made here, a portrait one (2:3) and a landscape one (3:2). They reach the page
 * the way content does, in the homepage's RSC payload, on a client-side navigation from the 404
 * page (so nothing is hydrated against the served HTML); their image requests are answered here.
 * On each screen (a desktop, a phone, a wide desktop: all tall enough for the world to run
 * sideways) the WORLD is moved to the gallery (its scrollLeft: the page itself never scrolls), as a
 * swipe or the nav would. Prints a JSON report and exits 1 if a check fails or any page throws:
 *   0  setup: the homepage was reached client-side (the test photos came with it), the world runs
 *      sideways, it reached the gallery's start and the tunnel scene let it go (no scroll lock)
 *   1  each photo is shown whole (nothing cropped or off screen), at its own aspect ratio, as large
 *      as the stage allows; the stage doesn't move as the photo arrives; the controls stay on
 *      screen; the lightbox opens OVER the world (a modal covering the whole screen, nothing of the
 *      world on top); ArrowRight steps on to the next photo and ArrowLeft back; keys inside the
 *      lightbox (the arrows, Tab through its controls) and the wheel over it never move the world
 *      behind it; Esc closes it, focus returns to the tile that opened it, the world where it was
 *   2  a sample (no photo) still fills the stage, tagged "Sample image"
 *   3  a filter chip (Interior) changes the strip: only that category's tiles (fewer), still two
 *      rows with no hole and inside the panel, which never scrolls (the strip fits the screen's
 *      height, and never sideways); the scene narrower, but never less than a screen, its panel
 *      centred in it; the world doesn't jump (the gallery stays where it was, also while the tiles
 *      glide); the lightbox then steps through the filtered photos only ("1 / 2"), and its Close
 *      button returns focus to the tile, the world where it was; "All" brings every tile back
 *      (the scene its old width)
 */
import { chromium } from "playwright-core";
import sharp from "sharp";

const URL = process.argv.slice(2).find((a) => a.startsWith("http")) ?? "http://localhost:3100/";
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"] });
const desktop = { viewport: { width: 1280, height: 800 } };
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
// Wide enough that a filtered strip is narrower than the screen: the scene is then exactly a screen, its panel centred.
const wide = { viewport: { width: 1920, height: 1080 } };
const results = {};
const failures = [];
const uncaught = [];
let checks = 0;
const check = (name, ok, detail) => {
  checks++;
  if (!ok) failures.push(`${name}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  return ok;
};

/** The test photos (width, height), and the gallery items that get them. */
const shapes = { portrait: [1200, 1800], landscape: [1800, 1200] };
const photos = { g1: "portrait", g2: "landscape" };
const jpeg = {};
for (const [name, [width, height]] of Object.entries(shapes)) {
  jpeg[name] = await sharp({ create: { width, height, channels: 3, background: { r: 46, g: 64, b: 96 } } }).jpeg().toBuffer();
}

/** The filter chip `label` (the tiles' buttons also have categories in their names: look in the filter's group). */
const chip = (page, label) => page.getByRole("group", { name: "Filter photos" }).getByRole("button", { name: label, exact: true });

/** Where the world is: its scroll position (the page itself never scrolls while it runs sideways), and the gallery's place on screen. */
const place = (page) =>
  page.evaluate(() => {
    const w = document.querySelector("[data-world]");
    return {
      axis: document.documentElement.dataset.axis ?? null,
      x: w ? +w.scrollLeft.toFixed(1) : null,
      page: [scrollX, scrollY],
      gallery: +document.querySelector("#gallery").getBoundingClientRect().left.toFixed(1),
    };
  });
/** Has the world (or the page) moved between `a` and `b`? */
const moved = (a, b) => a.x === null || b.x === null || Math.abs(a.x - b.x) >= 1 || a.page.join() !== b.page.join();

/** Move the world so `id`'s scene starts at the left edge of the screen (instantly, as a nav jump lands). */
const toScene = (page, id) =>
  page.evaluate((id) => {
    const w = document.querySelector("[data-world]");
    const s = document.getElementById(id);
    w.scrollTo({ left: s.getBoundingClientRect().left - w.getBoundingClientRect().left + w.scrollLeft, behavior: "instant" });
  }, id);

/**
 * Bring tile `i` well into view (as a visitor swipes a photo into view before tapping it), so that the
 * click doesn't scroll anything itself and its focus ring has room when focus comes back to it.
 */
const reveal = (page, i) =>
  page.evaluate((i) => {
    const tile = document.querySelectorAll("#gallery li button")[i];
    const w = document.querySelector("[data-world]");
    const r = tile.getBoundingClientRect();
    if (r.left >= 48 && r.right <= innerWidth - 48) return;
    w.scrollBy({ left: r.left + r.width / 2 - innerWidth / 2, behavior: "instant" });
  }, i);

/** The homepage, reached client-side with the test photos in its gallery, the world moved to it. The photos' files wait for `release()`. */
async function open(ctx) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => uncaught.push(e.message));
  let release;
  const held = new Promise((r) => (release = r));
  // A client-side navigation fetches the page as an RSC payload (`?_rsc=`): two items get a photo there.
  await ctx.route((u) => u.searchParams.has("_rsc"), async (route) => {
    try {
      const res = await route.fetch();
      let body = await res.text();
      for (const [id, shape] of Object.entries(photos)) body = body.replace(`"id":"${id}","src":null`, `"id":"${id}","src":"/test-photos/${shape}.jpg"`);
      const headers = res.headers();
      for (const h of ["content-length", "content-encoding", "transfer-encoding"]) delete headers[h];
      await route.fulfill({ status: res.status(), headers, body });
    } catch {
      // (a prefetch the router cancelled, or the context closed)
    }
  });
  // next/image asks the image optimizer for them: answer with the test photo, whatever the width.
  await ctx.route(/\/_next\/image\?url=%2Ftest-photos%2F/, async (route) => {
    await held;
    const shape = route.request().url().match(/url=%2Ftest-photos%2F(\w+)\.jpg/)[1];
    await route.fulfill({ contentType: "image/jpeg", body: jpeg[shape] }).catch(() => {});
  });
  await page.goto(`${URL}nope`, { waitUntil: "load" });
  await page.waitForTimeout(1000); // hydrated: the link below navigates client-side
  await page.evaluate(() => (window.__sameDocument = true));
  await page.locator('main a[href="/"]').click(); // "Back to Roadrunning" (next/link)
  await page.waitForSelector("#gallery li button");
  const clientSide = await page.evaluate(() => window.__sameDocument === true);
  await page.waitForTimeout(500);
  const axis = await page.evaluate(() => document.documentElement.dataset.axis ?? null);
  // The world moves to the gallery (moving away from the start also lets the tunnel scene stop holding it there)…
  if (axis === "x") await toScene(page, "gallery");
  // …and the tunnel scene settles (its timeline running, or the finished hero), so nothing else moves the world.
  const settled = await page
    .waitForFunction(
      () => {
        const d = document.documentElement;
        return (d.hasAttribute("data-intro-stage") || d.hasAttribute("data-intro-failed")) && !d.hasAttribute("data-scroll-lock") && !d.hasAttribute("data-intro-pending");
      },
      null,
      { timeout: 40000 },
    )
    .then(
      () => true,
      () => false,
    );
  await page.waitForTimeout(500);
  const reached = await place(page);
  return { page, release, clientSide, axis, settled, reached };
}

/** The lightbox's photo as DRAWN (object-fit inside its <img> box), against the box that clips it (the stage) and the screen. */
const lightbox = (page) =>
  page.evaluate(() => {
    const dialog = document.querySelector("#gallery dialog[open]");
    const img = dialog?.querySelector("img");
    if (!img) return { photo: false };
    let clip = img.parentElement;
    while (clip && getComputedStyle(clip).overflow === "visible") clip = clip.parentElement;
    const c = clip.getBoundingClientRect();
    const stage = [c.left, c.top, c.width, c.height].map(Math.round);
    if (!img.complete || !img.naturalWidth) return { photo: false, stage };
    const r = img.getBoundingClientRect();
    const fit = getComputedStyle(img).objectFit;
    // (Chromium divides the natural size by the density of the srcset file it picked: only its RATIO is the photo's.)
    const [nw, nh] = [img.naturalWidth, img.naturalHeight];
    // contain: all of it inside the box; cover: the box filled (the rest cut off); anything else: stretched to the box.
    const k = fit === "contain" ? Math.min(r.width / nw, r.height / nh) : fit === "cover" ? Math.max(r.width / nw, r.height / nh) : 0;
    const [w, h] = k ? [nw * k, nh * k] : [r.width, r.height];
    // Centred: object-position is the default 50% 50% (next/image doesn't set it).
    const [x, y] = [r.left + (r.width - w) / 2, r.top + (r.height - h) / 2];
    const seenW = Math.max(0, Math.min(x + w, c.right, innerWidth) - Math.max(x, c.left, 0));
    const seenH = Math.max(0, Math.min(y + h, c.bottom, innerHeight) - Math.max(y, c.top, 0));
    return {
      photo: true,
      shape: /%2Ftest-photos%2F(\w+)\.jpg/.exec(img.currentSrc)?.[1] ?? img.currentSrc,
      natural: `${nw}x${nh}`,
      fit,
      drawn: [Math.round(w), Math.round(h)],
      stage,
      shown: +((seenW * seenH) / (w * h)).toFixed(3),
      aspect: +(w / h).toFixed(4),
      fillsStage: +Math.max(w / c.width, h / c.height).toFixed(3),
      ofScreen: +Math.max(w / innerWidth, h / innerHeight).toFixed(3),
      controlsOnScreen: [...dialog.querySelectorAll("button")].every((b) => {
        const e = b.getBoundingClientRect();
        return e.top >= 0 && e.left >= 0 && e.bottom <= innerHeight && e.right <= innerWidth;
      }),
      counter: dialog.querySelector("p")?.textContent.replace(/\s+/g, " ").trim(),
    };
  });
/** Wait until the lightbox shows only the test photo `shape` (the previous slide has gone), loaded. */
const showing = (page, shape) =>
  page
    .waitForFunction(
      (shape) => {
        const imgs = document.querySelectorAll("#gallery dialog[open] img");
        return imgs.length === 1 && imgs[0].complete && imgs[0].naturalWidth > 0 && imgs[0].currentSrc.includes(`%2Ftest-photos%2F${shape}.jpg`);
      },
      shape,
      { timeout: 15000 },
    )
    .then(() => page.waitForTimeout(400), () => {});

/** Is the open lightbox OVER the world: in the top layer (modal), covering the screen, on top everywhere (the middle, the corners)? */
const over = (page) =>
  page.evaluate(() => {
    const d = document.querySelector("#gallery dialog[open]");
    if (!d) return { open: false };
    const r = d.getBoundingClientRect();
    const points = [[innerWidth / 2, innerHeight / 2], [2, 2], [innerWidth - 2, 2], [2, innerHeight - 2], [innerWidth - 2, innerHeight - 2]];
    return {
      open: true,
      modal: d.matches(":modal"),
      box: [r.left, r.top, r.width, r.height].map(Math.round),
      covers: r.left <= 0.5 && r.top <= 0.5 && r.right >= innerWidth - 0.5 && r.bottom >= innerHeight - 0.5,
      onTop: points.every(([x, y]) => d.contains(document.elementFromPoint(x, y))),
    };
  });

/** After the lightbox closed: is it shut, and where is focus (on tile `i` of the strip)? */
const closed = (page, i) =>
  page.evaluate((i) => {
    const tile = document.querySelectorAll("#gallery li button")[i];
    const a = document.activeElement;
    return {
      shut: !document.querySelector("#gallery dialog[open]"),
      onTile: Boolean(tile) && a === tile,
      focus: a ? `${a.tagName.toLowerCase()} ${a.textContent.replace(/\s+/g, " ").trim().slice(0, 60)}` : null,
    };
  }, i);

/** The gallery's strip, laid out along the world: its tiles (their columns), the scene and its panel. */
const strip = (page) =>
  page.evaluate(() => {
    const w = document.querySelector("[data-world]");
    const g = document.querySelector("#gallery");
    const p = g.querySelector("[data-panel]");
    const ul = g.querySelector("ul");
    // Layout positions along the world's content (offsets: the panel's arrival animation doesn't move them).
    const along = (el) => {
      let v = 0;
      for (let e = el; e && e !== w; e = e.offsetParent) v += e.offsetLeft;
      return v;
    };
    const pr = p.getBoundingClientRect();
    const tiles = [...g.querySelectorAll("li")].map((li) => {
      const r = li.getBoundingClientRect();
      return { cat: li.querySelector(".capitalize")?.textContent.trim(), l: Math.round(r.left), t: r.top, b: r.bottom, r: r.right };
    });
    // Two rows flowing on in columns: each column is one tile the strip's full height, or two stacked (no hole).
    const top = Math.min(...tiles.map((t) => t.t));
    const bottom = Math.max(...tiles.map((t) => t.b));
    const columns = Object.values(Object.groupBy(tiles, (t) => t.l)).map((c) => c.sort((a, b) => a.t - b.t));
    const ur = ul.getBoundingClientRect();
    return {
      pressed: [...g.querySelectorAll('[role="group"] button[aria-pressed="true"]')].map((b) => b.textContent.trim()),
      cats: tiles.map((t) => t.cat),
      columns: columns.map((c) => c.length),
      noHole: tiles.length > 0 && columns.every((c) => c.length <= 2 && Math.abs(c[0].t - top) <= 1.5 && Math.abs(c.at(-1).b - bottom) <= 1.5),
      // Two row tracks, the tiles flowing on a column at a time.
      twoRows: getComputedStyle(ul).gridTemplateRows.split(" ").length === 2 && getComputedStyle(ul).gridAutoFlow.startsWith("column"),
      inPanel: tiles.every((t) => t.l >= pr.left - 0.5 && t.r <= pr.right + 0.5 && t.t >= pr.top - 0.5 && t.b <= pr.bottom + 0.5),
      stripBox: [ur.left, ur.top, ur.width, ur.height].map(Math.round),
      scene: { start: along(g), width: g.offsetWidth },
      screen: w.clientWidth,
      gaps: [along(p) - along(g), along(g) + g.offsetWidth - (along(p) + p.offsetWidth)],
      panelScrolls: { x: p.scrollWidth > p.clientWidth + 1 || p.scrollLeft !== 0, y: p.scrollHeight > p.clientHeight + 1 || p.scrollTop !== 0 },
      world: +w.scrollLeft.toFixed(1),
    };
  });

/** Record the world's position and the panel's sideways scroll every frame for `ms` (read with `sampled()`). */
const sample = (page, ms) =>
  page.evaluate((ms) => {
    const w = document.querySelector("[data-world]");
    const p = document.querySelector("#gallery [data-panel]");
    const s = (window.__samples = { x: [], panel: 0, done: false });
    const t0 = performance.now();
    const tick = () => {
      s.x.push(w.scrollLeft);
      s.panel = Math.max(s.panel, Math.abs(p.scrollLeft));
      if (performance.now() - t0 < ms) requestAnimationFrame(tick);
      else s.done = true;
    };
    requestAnimationFrame(tick);
  }, ms);
const sampled = async (page) => {
  await page.waitForFunction(() => window.__samples?.done, null, { timeout: 10000 }).catch(() => {});
  return page.evaluate(() => {
    const s = window.__samples;
    return { frames: s.x.length, jump: +(Math.max(...s.x) - Math.min(...s.x)).toFixed(1), panelScrolled: s.panel };
  });
};

/** Every flow on one screen (a step that can't be done, e.g. a control covered, fails the run with its error). */
async function flows(device, ctx) {
  const { page, release, clientSide, axis, settled, reached } = await open(ctx);
  const r = (results[device] = { clientSide, axis, settled, reached });
  check(`0 ${device} reached the homepage client-side (the test photos come with it)`, clientSide, "the link reloaded the page");
  if (!check(`0 ${device} the world runs sideways (html[data-axis="x"])`, axis === "x", { axis })) return;
  check(`0 ${device} the world reached the gallery's start, and the tunnel scene let it go`, settled && Math.abs(reached.gallery) < 1, { settled, reached });
  const dialog = page.locator("#gallery dialog[open]");

  // 1. g1, the portrait photo: the stage while its file is held back, then the photo.
  await reveal(page, 0);
  await page.locator("#gallery li button").first().click();
  await page.waitForTimeout(400);
  const opened = await place(page);
  const arriving = await lightbox(page);
  r.over = await over(page);
  release();
  await showing(page, "portrait");
  const portrait = await lightbox(page);
  // The arrow key (focus inside the dialog) steps to g2, the landscape photo…
  await dialog.getByRole("button", { name: "Next photo" }).focus();
  await page.keyboard.press("ArrowRight");
  await showing(page, "landscape");
  const landscape = await lightbox(page);
  // 2. …and on to g3, still a sample.
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => !document.querySelector("#gallery dialog[open] img"), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  const sample3 = await page.evaluate(() => {
    const d = document.querySelector("#gallery dialog[open]");
    const art = d?.querySelector('[style*="radial-gradient"]'); // the sample illustration
    const stage = art?.parentElement?.parentElement; // art → slide → stage
    if (!stage) return { art: false };
    const [a, s] = [art.getBoundingClientRect(), stage.getBoundingClientRect()];
    return {
      art: true,
      photo: Boolean(d.querySelector("img")),
      tagged: [...d.querySelectorAll("span")].some((e) => e.textContent.trim() === "Sample image"),
      fillsStage: s.height > 0 && [a.left - s.left, a.top - s.top, a.width - s.width, a.height - s.height].every((v) => Math.abs(v) <= 1),
    };
  });
  // ArrowLeft steps back to g2. None of the arrows moved the world behind the lightbox.
  await page.keyboard.press("ArrowLeft");
  await showing(page, "landscape");
  const back = await lightbox(page);
  await page.waitForTimeout(300);
  const afterArrows = await place(page);
  // Tab round its controls (Previous, Next, Close): keyboard focus moving inside the lightbox.
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(600);
  const tabbedTo = await page.evaluate(() => document.activeElement?.textContent.trim());
  const afterTab = await place(page);
  // The wheel over it: down, sideways, down again (each one seen by the page, over the lightbox).
  await page.evaluate(() => {
    window.__wheels = [];
    addEventListener("wheel", (e) => window.__wheels.push(e.target instanceof Element && Boolean(e.target.closest("#gallery dialog[open]"))), { capture: true, passive: true });
  });
  const size = page.viewportSize();
  await page.mouse.move(size.width / 2, size.height / 3);
  for (const [dx, dy] of [[0, 400], [400, 0], [0, 400]]) {
    await page.mouse.wheel(dx, dy);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(600);
  const afterWheel = await place(page);
  const wheels = await page.evaluate(() => window.__wheels);
  // Esc closes it: focus goes back to the tile that opened it, the world where it was.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  const escaped = await closed(page, 0);
  const afterClose = await place(page);
  Object.assign(r, { arriving: arriving.stage, portrait, landscape, sample: sample3, back: back.shape, places: { opened, afterArrows, afterTab, afterWheel, afterClose }, tabbedTo, wheels, escaped });

  for (const [shape, l] of [["portrait", portrait], ["landscape", landscape]]) {
    const name = `1 ${device} ${shape}`;
    if (!check(`${name} photo in the lightbox`, l.photo && l.shape === shape, l)) continue;
    const [pw, ph] = shapes[shape];
    check(`${name} shown whole (nothing cropped or off screen)`, l.shown >= 0.99, l);
    check(`${name} at its own aspect ratio (within 1%)`, Math.abs(l.aspect / (pw / ph) - 1) <= 0.01, l);
    check(`${name} as large as the stage allows`, l.fillsStage >= 0.99 && l.ofScreen >= 0.75, l);
    check(`${name} controls on screen`, l.controlsOnScreen, l);
  }
  check(`1 ${device} the stage doesn't move as the photo arrives`, Boolean(arriving.stage) && arriving.stage.join() === portrait.stage?.join(), { arriving: arriving.stage, loaded: portrait.stage });
  check(`1 ${device} the lightbox opens over the world (modal, the whole screen, on top)`, r.over.open && r.over.modal && r.over.covers && r.over.onTop, r.over);
  check(`1 ${device} ArrowLeft steps back to the previous photo`, back.photo && back.shape === "landscape", back);
  check(`1 ${device} the lightbox's arrow keys don't move the world behind it`, !moved(opened, afterArrows), { opened, afterArrows });
  check(`1 ${device} Tab round the lightbox's controls doesn't move the world behind it`, tabbedTo === "Close" && !moved(afterArrows, afterTab), { tabbedTo, afterArrows, afterTab });
  check(`1 ${device} the wheel over the lightbox doesn't move the world behind it`, wheels.length >= 3 && wheels.every(Boolean) && !moved(afterTab, afterWheel), { wheels, afterTab, afterWheel });
  check(`1 ${device} Esc closes the lightbox and focus returns to the tile that opened it`, escaped.shut && escaped.onTile, escaped);
  // (Against where the world was as Esc was pressed: anything that moved it while open is reported by the checks above.)
  check(`1 ${device} closing the lightbox leaves the world where it was`, !moved(afterWheel, afterClose), { opened, beforeClose: afterWheel, afterClose });
  check(`2 ${device} a sample fills the stage, tagged`, sample3.art && !sample3.photo && sample3.tagged && sample3.fillsStage, sample3);

  // 3. The filter: back to the gallery's start (its chips), then Interior.
  await toScene(page, "gallery");
  await page.waitForTimeout(400);
  const all = await strip(page);
  const expected = all.cats.filter((c) => c === "interior").length;
  await sample(page, 1500);
  await chip(page, "Interior").click();
  await page.waitForFunction((n) => document.querySelectorAll("#gallery li").length === n, expected, { timeout: 5000 }).catch(() => {});
  const gliding = await sampled(page);
  await page.waitForTimeout(400);
  const interior = await strip(page);
  // Its first photo (g2, landscape) in the lightbox: the filtered photos only, and stepping on goes round them
  // and back to g2. The Close button shuts it.
  await reveal(page, 0);
  await page.locator("#gallery li button").first().click();
  await showing(page, "landscape");
  const opened3 = await place(page);
  const filtered = await lightbox(page);
  const counter = () => page.locator("#gallery dialog[open] p").textContent().then((t) => t.replace(/\s+/g, " ").trim(), () => null);
  const counters = [await counter()];
  for (let i = 1; i <= expected; i++) {
    await page.keyboard.press("ArrowRight");
    const want = `${(i % expected) + 1} / ${expected} `;
    await page.waitForFunction((want) => document.querySelector("#gallery dialog[open] p")?.textContent.replace(/\s+/g, " ").trim().startsWith(want), want, { timeout: 5000 }).catch(() => {});
    counters.push(await counter());
  }
  await showing(page, "landscape");
  const wrapped = await lightbox(page);
  const beforeClose3 = await place(page);
  await dialog.getByRole("button", { name: "Close" }).click();
  await page.waitForTimeout(700);
  const closedByButton = await closed(page, 0);
  const afterClose3 = await place(page);
  // All again: every tile back.
  await toScene(page, "gallery");
  await page.waitForTimeout(300);
  await chip(page, "All").click();
  await page.waitForFunction((n) => document.querySelectorAll("#gallery li").length === n, all.cats.length, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(800);
  const again = await strip(page);
  Object.assign(r, { filter: { all, interior, gliding, filtered: { shape: filtered.shape, wrapped: wrapped.shape, counters }, closedByButton, opened3, beforeClose3, afterClose3, again } });

  const f = `3 ${device}`;
  check(`${f} the strip (All) is two rows with no hole, inside the panel`, all.noHole && all.twoRows && all.inPanel, all);
  check(`${f} the Interior chip is the one pressed`, interior.pressed.join() === "Interior", interior.pressed);
  check(`${f} Interior: only its tiles, fewer than All`, interior.cats.length === expected && expected > 0 && expected < all.cats.length && interior.cats.every((c) => c === "interior"), { expected, all: all.cats, interior: interior.cats });
  check(`${f} Interior: still two rows with no hole, inside the panel`, interior.noHole && interior.twoRows && interior.inPanel, interior);
  check(`${f} the scene narrower, but at least a screen`, interior.scene.width < all.scene.width && interior.scene.width >= interior.screen - 1, { all: all.scene, interior: interior.scene, screen: interior.screen });
  check(`${f} the panel centred in the scene`, Math.abs(interior.gaps[0] - interior.gaps[1]) <= 1 && Math.abs(all.gaps[0] - all.gaps[1]) <= 1, { all: all.gaps, interior: interior.gaps });
  check(`${f} the panel never scrolls (the strip fits its height, never sideways)`, ![all, interior, again].some((s) => s.panelScrolls.x || s.panelScrolls.y) && gliding.panelScrolled === 0, { all: all.panelScrolls, interior: interior.panelScrolls, again: again.panelScrolls, gliding });
  check(`${f} the world doesn't jump as the strip changes (the gallery stays put)`, interior.world === all.world && interior.scene.start === all.scene.start && gliding.frames > 10 && gliding.jump < 1, { world: [all.world, interior.world], start: [all.scene.start, interior.scene.start], gliding });
  const round = Array.from({ length: expected }, (_, i) => `${i + 1} / ${expected}`).concat(`1 / ${expected}`);
  check(`${f} the lightbox steps through the filtered photos only (and round)`, filtered.photo && filtered.shape === "landscape" && wrapped.shape === "landscape" && counters.every((c, i) => c?.startsWith(round[i] + " ")), { shapes: [filtered.shape, wrapped.shape], counters, round });
  check(`${f} its Close button returns focus to the tile, the world where it was`, closedByButton.shut && closedByButton.onTile && !moved(opened3, beforeClose3) && !moved(beforeClose3, afterClose3), { closedByButton, opened3, beforeClose3, afterClose3 });
  check(`${f} All brings every tile back, the scene its old width`, again.pressed.join() === "All" && again.cats.join() === all.cats.join() && Math.abs(again.scene.width - all.scene.width) <= 1 && again.noHole, { all: [all.cats, all.scene], again: [again.cats, again.scene] });
}

for (const [device, opts] of [["desktop", desktop], ["phone", phone], ["wide", wide]]) {
  const ctx = await browser.newContext(opts);
  ctx.setDefaultTimeout(15000);
  try {
    await flows(device, ctx);
  } catch (e) {
    check(`${device} the flows ran to the end`, false, String(e.message).split("\n")[0]);
  } finally {
    await ctx.close();
  }
}

await browser.close();
console.log(JSON.stringify(results, null, 1));
if (uncaught.length) failures.push(...[...new Set(uncaught)].map((m) => `uncaught: ${m}`));
if (failures.length) {
  console.error(`\n${failures.length} of ${checks} check(s) failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else console.error(`\nAll ${checks} gallery checks passed.`);
