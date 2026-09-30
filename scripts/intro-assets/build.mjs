#!/usr/bin/env node
/**
 * Builds the intro's animation-ready assets from the owner's source images.
 *
 *   npm run assets:intro      (or: node scripts/intro-assets/build.mjs)
 *
 * Inputs  (assets/intro-source/): the owner's original, untouched files.
 * Outputs (src/assets/intro/):    cutouts, background plates, masks and dust
 *                                 sprites, imported by components (Next.js
 *                                 hashes + optimizes them).
 *
 * Re-run after replacing any source file (e.g. higher-resolution versions).
 * Subject cutouts use Apple's Vision framework, so this script needs macOS 14+
 * with the Xcode command line tools (swiftc).
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(ROOT, "assets/intro-source");
const OUT = path.join(ROOT, "src/assets/intro");
const CACHE = path.join(ROOT, ".cache/intro");
const SWIFT = path.join(ROOT, "scripts/intro-assets/lift-subject.swift");
const LIFT = path.join(CACHE, "lift-subject");

/**
 * Enclosed regions of the cartoon that are genuinely background and must stay
 * see-through (gaps between the toes), as FRACTIONS of the source image
 * (resolution-independent). Every other enclosed hole Vision punches (eye
 * whites, highlights) is filled. The build prints every enclosed hole it finds
 * and fails if a box matches none, so a changed source can't silently fill them.
 */
const CARTOON_KEEP_OPEN = [
  { x0: 0.844, y0: 0.635, x1: 0.941, y1: 0.693 }, // front foot toe gap
  { x0: 0.236, y0: 0.859, x1: 0.283, y1: 0.927 }, // back foot toe gap
];

mkdirSync(OUT, { recursive: true });
mkdirSync(CACHE, { recursive: true });

// ---------------------------------------------------------------------------
// Sources: normalise EXIF orientation once so Vision and sharp see the same pixels.
// ---------------------------------------------------------------------------
async function upright(file) {
  const out = path.join(CACHE, `${path.parse(file).name}.upright.png`);
  await sharp(path.join(SRC, file)).rotate().png().toFile(out); // rotate() with no args = auto-orient
  return out;
}

// ---------------------------------------------------------------------------
// Vision subject lift (rebuilt whenever the Swift source changes)
// ---------------------------------------------------------------------------
if (!existsSync(LIFT) || statSync(SWIFT).mtimeMs > statSync(LIFT).mtimeMs) {
  execFileSync("swiftc", ["-O", SWIFT, "-o", LIFT], { stdio: "inherit" });
}

function lift(uprightFile) {
  const base = path.parse(uprightFile).name.replace(".upright", "");
  const cutout = path.join(CACHE, `${base}-cutout.png`);
  const mask = path.join(CACHE, `${base}-mask.png`);
  execFileSync(LIFT, [uprightFile, cutout, mask], { stdio: "inherit" });
  return { cutout, mask };
}

const report = [];
async function save(pipeline, name, note) {
  const file = path.join(OUT, name);
  const info = await pipeline.toFile(file);
  report.push({ file: path.relative(ROOT, file), size: `${info.width}x${info.height}`, kb: Math.round(info.size / 1024), note });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Horizontal motion blur with a triangle kernel in ONE convolve (sharp keeps
 * only the last convolve() of a pipeline, so two chained box passes would
 * silently become one).
 */
function motionBlur(img, length) {
  const n = Math.max(2, Math.round(length / 2));
  const tri = Array.from({ length: 2 * n - 1 }, (_, i) => Math.min(i + 1, 2 * n - 1 - i));
  const zeros = new Array(tri.length).fill(0);
  // sharp needs ≥3 rows: zero rows above and below keep it purely horizontal.
  return img.convolve({ width: tri.length, height: 3, kernel: [...zeros, ...tri, ...zeros] });
}

/** [image | mirrored image]: tiles seamlessly when repeated horizontally. */
async function loopStrip(buffer) {
  const { width, height } = await sharp(buffer).metadata();
  const mirrored = await sharp(buffer).flop().toBuffer();
  return sharp({ create: { width: width * 2, height, channels: 3, background: "#000" } }).composite([
    { input: buffer, left: 0, top: 0 },
    { input: mirrored, left: width, top: 0 },
  ]);
}

/** Box blur along one axis (prefix sums), `ch` interleaved channels. */
function boxBlur(src, W, H, ch, radius, horizontal) {
  const out = new Float32Array(src.length);
  const len = horizontal ? W : H;
  const lines = horizontal ? H : W;
  const prefix = new Float64Array((len + 1) * ch);
  for (let line = 0; line < lines; line++) {
    const idx = (k) => (horizontal ? line * W + k : k * W + line) * ch;
    for (let k = 0; k < len; k++) for (let c = 0; c < ch; c++) prefix[(k + 1) * ch + c] = prefix[k * ch + c] + src[idx(k) + c];
    for (let k = 0; k < len; k++) {
      const a = Math.max(0, k - radius);
      const b = Math.min(len, k + radius + 1);
      for (let c = 0; c < ch; c++) out[idx(k) + c] = (prefix[b * ch + c] - prefix[a * ch + c]) / (b - a);
    }
  }
  return out;
}

/** ≈ Gaussian blur (three box passes per axis), independent radii for x and y. */
function softBlur(src, W, H, ch, rx, ry) {
  let a = src;
  for (let i = 0; i < 3; i++) a = boxBlur(a, W, H, ch, rx, true);
  for (let i = 0; i < 3; i++) a = boxBlur(a, W, H, ch, ry, false);
  return a;
}

/**
 * Fills the hole by anisotropic normalized convolution: each missing pixel is
 * the weighted mean of KNOWN pixels, with weights that fall off slowly along
 * the row and quickly across rows. It mostly takes its own row's colour (so
 * dirt rows stay orange, bush rows green) yet blends smoothly between rows, so
 * no shape of the subject survives. Pixels too far from anything known get a
 * second, wider pass. (Diffusion leaves a brown pillar; row averages leave
 * blocks; mirroring leaves stripes.)
 */
function normalizedFill(data, hole, W, H) {
  const out = Buffer.from(data);
  const known = new Float32Array(W * H);
  const weighted = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    if (hole[i]) continue;
    known[i] = 1;
    for (let c = 0; c < 3; c++) weighted[i * 3 + c] = data[i * 3 + c];
  }
  const todo = new Set();
  for (let i = 0; i < W * H; i++) if (hole[i]) todo.add(i);
  const holeIdx = [...todo];
  for (const scale of [1, 3, 9]) {
    if (!todo.size) break;
    const rx = Math.round((W / 30) * scale);
    const ry = Math.round((H / 120) * scale);
    const num = softBlur(weighted, W, H, 3, rx, ry);
    const den = softBlur(known, W, H, 1, rx, ry);
    for (const i of todo) {
      if (den[i] < 0.02) continue; // not enough known neighbours at this scale
      for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(num[i * 3 + c] / den[i]);
      todo.delete(i);
    }
  }
  // A smooth fill reads as a flat silhouette once blurred (and shows as-is under
  // reduced motion, where the plate stands still). Add grain matched to the local
  // variance of the known pixels; the motion blur then turns it into the same
  // streaky texture as its surroundings.
  const lum = new Float32Array(W * H);
  const lum2 = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (hole[i]) continue;
    const l = 0.299 * data[i * 3] + 0.587 * data[i * 3 + 1] + 0.114 * data[i * 3 + 2];
    lum[i] = l;
    lum2[i] = l * l;
  }
  const rx = Math.round(W / 30);
  const ry = Math.round(H / 60);
  const mean = softBlur(lum, W, H, 1, rx, ry);
  const meanSq = softBlur(lum2, W, H, 1, rx, ry);
  const weight = softBlur(known, W, H, 1, rx, ry);
  let seed = 1234567; // deterministic, so re-runs produce identical files
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  // Grain varies slowly ALONG the row (knots every ~48px, interpolated) and freely
  // between rows: per-pixel noise would be averaged flat by the horizontal blur.
  const STEP = 48;
  const knots = W / STEP + 2;
  const rowKnots = new Float32Array(knots);
  let lastRow = -1;
  for (const i of holeIdx) {
    const x = i % W;
    const y = (i - x) / W;
    if (y !== lastRow) {
      for (let k = 0; k < knots; k++) rowKnots[k] = gauss();
      lastRow = y;
    }
    const k = Math.floor(x / STEP);
    const t = x / STEP - k;
    const g = (rowKnots[k] ?? 0) * (1 - t) + (rowKnots[k + 1] ?? 0) * t;
    const w = weight[i] || 1;
    const m = mean[i] / w;
    const std = Math.sqrt(Math.max(0, meanSq[i] / w - m * m));
    const n = g * std * 1.1;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.max(0, Math.min(255, Math.round(out[i * 3 + c] + n)));
  }
  return out;
}

/** Removes the lifted subject from a photo, returning a background plate (PNG buffer). */
async function removeSubject(photoBuffer, maskBuffer) {
  const { data, info } = await sharp(photoBuffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const maskMeta = await sharp(maskBuffer).metadata();
  if (maskMeta.width !== W || maskMeta.height !== H) {
    throw new Error(`mask ${maskMeta.width}x${maskMeta.height} does not match photo ${W}x${H}`);
  }
  // Grow the mask so no feather fringe survives: blur, materialise, THEN threshold
  // (sharp applies threshold before blur within one pipeline).
  const grown = await sharp(maskBuffer).blur(8).toBuffer();
  const hole = Uint8Array.from(await sharp(grown).threshold(8).extractChannel(0).raw().toBuffer());
  // Extend the hole downward so the subject's cast shadow on the ground goes too.
  const SHADOW = Math.round(H * 0.03);
  for (let y = H - 1; y >= 0; y--) {
    for (let x = 0; x < W; x++) {
      if (hole[y * W + x] === 255) for (let dy = 1; dy <= SHADOW && y + dy < H; dy++) hole[(y + dy) * W + x] ||= 1;
    }
  }
  const filled = normalizedFill(data, hole, W, H);
  return sharp(filled, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}

/**
 * Vision treats white areas enclosed by outlines (eye whites, highlights) as
 * background. Re-derive alpha: only transparency connected to the image border
 * is real background, plus the explicit keep-open boxes.
 */
async function fillEnclosedHoles(uprightFile, cutoutFile, keepOpen) {
  const { data: rgb, info } = await sharp(uprightFile).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const alpha = Uint8Array.from(await sharp(cutoutFile).extractChannel(3).raw().toBuffer());
  const open = (i) => alpha[i] < 128;

  const reached = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const i = stack.pop();
    if (reached[i] || !open(i)) continue;
    reached[i] = 1;
    const x = i % W;
    if (x > 0) stack.push(i - 1);
    if (x < W - 1) stack.push(i + 1);
    if (i >= W) stack.push(i - W);
    if (i < W * (H - 1)) stack.push(i + W);
  }

  const seen = new Uint8Array(W * H);
  const holes = [];
  const matched = new Set();
  for (let start = 0; start < W * H; start++) {
    if (seen[start] || reached[start] || !open(start)) continue;
    const pixels = [];
    const s = [start];
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    while (s.length) {
      const i = s.pop();
      if (seen[i] || reached[i] || !open(i)) continue;
      seen[i] = 1;
      pixels.push(i);
      const x = i % W;
      const y = (i - x) / W;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      if (x > 0) s.push(i - 1);
      if (x < W - 1) s.push(i + 1);
      if (y > 0) s.push(i - W);
      if (y < H - 1) s.push(i + W);
    }
    const cx = (x0 + x1) / 2 / W;
    const cy = (y0 + y1) / 2 / H;
    const box = keepOpen.findIndex((b) => cx >= b.x0 && cx <= b.x1 && cy >= b.y0 && cy <= b.y1);
    const keep = box !== -1;
    if (keep) matched.add(box);
    if (!keep) {
      for (const i of pixels) alpha[i] = 255;
      // Absorb the semi-transparent fringe between the hole and its outline (2px).
      for (const i of pixels) {
        const x = i % W;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const j = i + dy * W + dx;
            if (x + dx >= 0 && x + dx < W && j >= 0 && j < W * H && !reached[j] && alpha[j] < 255) alpha[j] = 255;
          }
        }
      }
    }
    holes.push({ bbox: `${x0},${y0}-${x1},${y1}`, area: pixels.length, action: keep ? "kept open" : "filled" });
  }
  if (holes.length) console.table(holes);
  const unmatched = keepOpen.filter((_, i) => !matched.has(i));
  if (unmatched.length) {
    throw new Error(`CARTOON_KEEP_OPEN boxes matched no enclosed hole: ${JSON.stringify(unmatched)}. Re-measure them from the table above.`);
  }

  return sharp(rgb, { raw: { width: W, height: H, channels: 3 } })
    .joinChannel(Buffer.from(alpha), { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Scene 1: real roadrunner (mirrored so it runs left → right like the others)
// ---------------------------------------------------------------------------
{
  const src = await upright("roadrunner-real.jpg");
  const { cutout, mask } = lift(src);
  await save(
    sharp(cutout).flop().trim({ threshold: 1 }).webp({ quality: 90, alphaQuality: 100, effort: 6 }),
    "roadrunner-real.webp",
    "Vision cutout, mirrored, trimmed to subject",
  );

  const photo = await sharp(src).flop().toBuffer();
  const flippedMask = await sharp(mask).flop().toBuffer();
  const plate = await removeSubject(photo, flippedMask);

  // Far plate: whole photo, panning blur.
  const far = await motionBlur(sharp(plate), 31).blur(1.2).toBuffer();
  await save((await loopStrip(far)).webp({ quality: 72, effort: 6 }), "roadrunner-plate.webp", "subject removed, motion-blurred, loopable strip");

  // Near ground: bottom 40% of the photo, blurred harder so it streams faster (parallax).
  const { width, height } = await sharp(plate).metadata();
  const top = Math.round(height * 0.6);
  const near = await motionBlur(sharp(plate).extract({ left: 0, top, width, height: height - top }), 61).blur(1.5).toBuffer();
  await save((await loopStrip(near)).webp({ quality: 70, effort: 6 }), "roadrunner-ground.webp", "foreground ground layer, loopable strip");
}

// ---------------------------------------------------------------------------
// Scene 2: cartoon roadrunner. Source is 474px wide, so a 2x Lanczos version
// is prepared for high-density screens (no new detail, just cleaner scaling).
// ---------------------------------------------------------------------------
{
  const src = await upright("roadrunner-cartoon.webp");
  const { cutout } = lift(src);
  const solid = await fillEnclosedHoles(src, cutout, CARTOON_KEEP_OPEN);
  const trimmed = await sharp(solid).trim({ threshold: 1 }).toBuffer();
  const { width } = await sharp(trimmed).metadata();
  await save(
    sharp(trimmed).resize({ width: width * 2, kernel: "lanczos3" }).sharpen({ sigma: 0.6 }).webp({ quality: 92, alphaQuality: 100, effort: 6 }),
    "roadrunner-cartoon.webp",
    "Vision cutout + enclosed holes refilled, trimmed, 2x Lanczos from 474px source",
  );
}

// ---------------------------------------------------------------------------
// Scene 3: black party bus (source 560px wide → 2x Lanczos, same caveat).
// ---------------------------------------------------------------------------
{
  const src = await upright("bus-exterior.png");
  const { cutout } = lift(src);
  const trimmed = await sharp(cutout).trim({ threshold: 1 }).toBuffer();
  const { width, height } = await sharp(trimmed).metadata();
  await save(
    sharp(trimmed).resize({ width: width * 2, kernel: "lanczos3" }).sharpen({ sigma: 0.7 }).webp({ quality: 92, alphaQuality: 100, effort: 6 }),
    "bus-exterior.webp",
    "Vision cutout (street removed), trimmed, 2x Lanczos from 560px source",
  );
  // Alpha-only silhouette for the paint sheen's CSS mask (a few KB instead of re-downloading the photo).
  const alpha = await sharp(trimmed).extractChannel(3).raw().toBuffer();
  await save(
    sharp({ create: { width, height, channels: 3, background: "#fff" } })
      .joinChannel(alpha, { raw: { width, height, channels: 1 } })
      .png({ palette: true, colors: 16, compressionLevel: 9 }),
    "bus-mask.png",
    "bus silhouette mask (alpha only)",
  );
}

// Interior photo: copied byte-for-byte when it carries no metadata (Next.js does the one and
// only re-encode). Camera/phone photos (EXIF orientation, GPS…) are uprighted and stripped instead.
{
  const src = path.join(SRC, "bus-interior.jpg");
  const meta = await sharp(src).metadata();
  if (meta.exif || meta.xmp || meta.iptc || (meta.orientation && meta.orientation !== 1)) {
    await save(sharp(src).rotate().jpeg({ quality: 95, mozjpeg: true, chromaSubsampling: "4:4:4" }), "bus-interior.jpg", "uprighted, metadata stripped");
  } else {
    copyFileSync(src, path.join(OUT, "bus-interior.jpg"));
    report.push({ file: "src/assets/intro/bus-interior.jpg", size: `${meta.width}x${meta.height}`, kb: Math.round(statSync(src).size / 1024), note: "copied untouched" });
  }
}

// ---------------------------------------------------------------------------
// Dust sprites: soft fractal-noise puffs tinted to the desert sand.
// ---------------------------------------------------------------------------
const FALLOFF = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><radialGradient id="r" cx="0.5" cy="0.5" r="0.48"><stop offset="0" stop-color="#fff"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.85"/><stop offset="0.75" stop-color="#fff" stop-opacity="0.25"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="512" height="512" fill="url(#r)"/></svg>',
).toString("base64");

for (const [i, seed] of [7, 23, 61].entries()) {
  // Two noise octaves: large billows shape the silhouette, fine grain adds texture.
  // Alpha = billows × radial falloff (reaching 0 inside the canvas), so edges break up into wisps.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
    <defs>
      <filter id="n" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.0065" numOctaves="3" seed="${seed}" result="big"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="${seed + 5}" result="fine"/>
        <feComposite in="big" in2="fine" operator="arithmetic" k1="0" k2="0.8" k3="0.35" k4="-0.08" result="mix"/>
        <feColorMatrix in="mix" type="matrix" values="0 0 0 0 0.9  0 0 0 0 0.78  0 0 0 0 0.62  4.0 0 0 0 -1.1" result="puff"/>
        <feImage href="data:image/svg+xml;base64,${FALLOFF}" result="falloff"/>
        <feComposite in="puff" in2="falloff" operator="in"/>
      </filter>
    </defs>
    <rect width="512" height="512" filter="url(#n)"/>
  </svg>`;
  await save(sharp(Buffer.from(svg)).blur(1.8).webp({ quality: 60, alphaQuality: 60, effort: 6 }), `dust-${i + 1}.webp`, "generated dust puff");
}

console.table(report);
