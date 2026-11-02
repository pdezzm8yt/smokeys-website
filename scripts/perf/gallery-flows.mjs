#!/usr/bin/env node
/**
 * Checks for the gallery lightbox (src/components/home/gallery-preview.tsx) in Chromium.
 *
 *   npm run test:gallery -- [baseUrl]
 *
 * Needs a running production server (`npm run build && npx next start -p 3100`).
 * The gallery has no real photos yet (every item is an illustrated sample), so two of its items
 * get test photos made here, a portrait one (2:3) and a landscape one (3:2). They reach the page
 * the way content does, in the homepage's RSC payload, on a client-side navigation from the 404
 * page (so nothing is hydrated against the served HTML); their image requests are answered here.
 * Prints a JSON report and exits 1 if a check fails or any page throws:
 *   1  desktop and phone: each photo is shown whole (nothing cropped or off screen), at its own
 *      aspect ratio, as large as the stage allows; the stage doesn't move as the photo arrives;
 *      the arrow key steps from one photo to the next; the controls stay on screen
 *   2  a sample (no photo) still fills the stage, tagged "Sample image"
 */
import { chromium } from "playwright-core";
import sharp from "sharp";

const URL = process.argv.slice(2).find((a) => a.startsWith("http")) ?? "http://localhost:3100/";
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

/** The test photos (width, height), and the gallery items that get them. */
const shapes = { portrait: [1200, 1800], landscape: [1800, 1200] };
const photos = { g1: "portrait", g2: "landscape" };
const jpeg = {};
for (const [name, [width, height]] of Object.entries(shapes)) {
  jpeg[name] = await sharp({ create: { width, height, channels: 3, background: { r: 46, g: 64, b: 96 } } }).jpeg().toBuffer();
}

/** The homepage, reached client-side with the test photos in its gallery, scrolled to it. The photos' files wait for `release()`. */
async function open(ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
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
  await page.locator('main a[href="/"]').click(); // "Back to Smokey's" (next/link)
  await page.waitForSelector("#gallery li button");
  const clientSide = await page.evaluate(() => window.__sameDocument === true);
  await page.waitForTimeout(500);
  // (Scrolling away from the top also lets the intro stop holding the page there.)
  await page.evaluate(() => document.querySelector("#gallery").scrollIntoView({ block: "start", behavior: "instant" }));
  await page.waitForTimeout(500);
  return { ctx, page, release, clientSide };
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

for (const [device, opts] of [["desktop", desktop], ["phone", phone]]) {
  const { ctx, page, release, clientSide } = await open(opts);
  const dialog = page.locator("#gallery dialog[open]");
  // 1. g1, the portrait photo: the stage while its file is held back, then the photo.
  await page.locator("#gallery li button").first().click();
  await page.waitForTimeout(400);
  const arriving = await lightbox(page);
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
  const sample = await page.evaluate(() => {
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
  results[device] = { clientSide, arriving: arriving.stage, portrait, landscape, sample };
  check(`${device} reached the homepage client-side (the test photos come with it)`, clientSide, "the link reloaded the page");
  for (const [shape, r] of [["portrait", portrait], ["landscape", landscape]]) {
    const name = `1 ${device} ${shape}`;
    if (!check(`${name} photo in the lightbox`, r.photo && r.shape === shape, r)) continue;
    const [pw, ph] = shapes[shape];
    check(`${name} shown whole (nothing cropped or off screen)`, r.shown >= 0.99, r);
    check(`${name} at its own aspect ratio (within 1%)`, Math.abs(r.aspect / (pw / ph) - 1) <= 0.01, r);
    check(`${name} as large as the stage allows`, r.fillsStage >= 0.99 && r.ofScreen >= 0.75, r);
    check(`${name} controls on screen`, r.controlsOnScreen, r);
  }
  check(`1 ${device} the stage doesn't move as the photo arrives`, Boolean(arriving.stage) && arriving.stage.join() === portrait.stage?.join(), { arriving: arriving.stage, loaded: portrait.stage });
  check(`2 ${device} a sample fills the stage, tagged`, sample.art && !sample.photo && sample.tagged && sample.fillsStage, sample);
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 1));
if (uncaught.length) failures.push(...[...new Set(uncaught)].map((m) => `uncaught: ${m}`));
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else console.error("\nAll gallery checks passed.");
