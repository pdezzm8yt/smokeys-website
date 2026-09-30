#!/usr/bin/env node
/**
 * Renders the intro's TEMPORARY placeholder clips (clearly labelled, burned in)
 * from the owner's own images in src/assets/intro, so the video engine can be
 * built and timed before the final footage exists.
 *
 *   npm run video:placeholders              (all four; skips ones already rendered)
 *   npm run video:placeholders -- --force   (re-render)
 *   npm run video:placeholders -- --only=bus,dust
 *
 * Output: .cache/intro-video/placeholders/<file>.mp4 (near-lossless masters).
 * `npm run video:build` turns them into the web files, exactly like real
 * footage, and uses a real master instead as soon as one is in
 * assets/intro-source/video/.
 *
 * The motion is baked in on purpose: the placeholder behaves like footage
 * (the video moves the subject; the engine only moves the camera).
 * Subject positions below match src/content/intro-video.ts.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { introClips } from "../../src/content/intro-video.ts";
import { FFMPEG as ffmpegPath } from "./lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const IMG = path.join(ROOT, "src/assets/intro");
export const PLACEHOLDER_DIR = path.join(ROOT, ".cache/intro-video/placeholders");

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",");

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Raw RGBA image: { data, width, height }. */
async function raw(input, opts = {}) {
  const { data, info } = await sharp(input, opts).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
const svg = (w, h, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);

/** A horizontally tileable strip, repeated so any W-wide window can be cut from it. */
function tiled(strip, W) {
  const copies = Math.ceil(W / strip.width) + 1;
  const width = strip.width * copies;
  const data = Buffer.alloc(width * strip.height * 4);
  for (let y = 0; y < strip.height; y++) {
    for (let c = 0; c < copies; c++) strip.data.copy(data, (y * width + c * strip.width) * 4, y * strip.width * 4, (y + 1) * strip.width * 4);
  }
  return { data, width, height: strip.height, period: strip.width };
}

/** The W-wide window of a tiled strip starting at x (wraps). */
function windowAt(t, x, W) {
  const x0 = ((Math.round(x) % t.period) + t.period) % t.period;
  const data = Buffer.alloc(W * t.height * 4);
  for (let y = 0; y < t.height; y++) t.data.copy(data, y * W * 4, (y * t.width + x0) * 4, (y * t.width + x0 + W) * 4);
  return { data, width: W, height: t.height };
}

const layer = (img, left, top, extra = {}) => ({
  input: img.data,
  raw: { width: img.width, height: img.height, channels: 4 },
  left: Math.round(left),
  top: Math.round(top),
  ...extra,
});

/**
 * The burned-in label: centred on the clip's focus so the phone crop keeps it,
 * at a height (fraction of the frame) clear of the page's own text.
 */
async function label(clip, W, H, y = 0.3) {
  const w = Math.round(Math.min(W * 0.36, 690));
  const h = Math.round(w * 0.16);
  const fs = Math.round(h * 0.3);
  const img = await raw(
    svg(
      w,
      h,
      `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${h / 2 - 1}" fill="rgba(0,0,0,0.62)" stroke="rgba(255,255,255,0.55)" stroke-width="2" stroke-dasharray="10 7"/>
       <text x="50%" y="${h * 0.43}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="700" font-size="${fs}" letter-spacing="3" fill="#ffd27a">PLACEHOLDER FOOTAGE</text>
       <text x="50%" y="${h * 0.78}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${fs * 0.72}" fill="#ffffff" fill-opacity="0.88">${clip.label} · replace: ${clip.file}</text>`,
    ),
  );
  return layer(img, clip.focus.x * W - w / 2, H * y - h / 2);
}

/** Pipe raw RGBA frames into a near-lossless H.264 master. */
function encoder(file, { width, height, fps }) {
  const p = spawn(
    ffmpegPath,
    ["-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${width}x${height}`, "-r", String(fps), "-i", "-",
     "-c:v", "libx264", "-preset", "medium", "-crf", "12", "-pix_fmt", "yuv420p", "-movflags", "+faststart", file],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const done = new Promise((resolve, reject) => p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code} for ${file}`)))));
  return {
    write: (buf) => new Promise((resolve) => (p.stdin.write(buf) ? resolve() : p.stdin.once("drain", resolve))),
    end: () => (p.stdin.end(), done),
  };
}

async function render(clip, { width, height, fps, seconds, background }, frame) {
  const file = path.join(PLACEHOLDER_DIR, `${clip.file}.mp4`);
  const enc = encoder(file, { width, height, fps });
  const frames = Math.round(seconds * fps);
  for (let i = 0; i < frames; i++) {
    const layers = await frame(i / fps, i);
    const buf = await sharp({ create: { width, height, channels: 4, background } }).composite(layers).raw().toBuffer();
    await enc.write(buf);
  }
  await enc.end();
  console.log(`  ${path.relative(ROOT, file)}  ${width}x${height} ${fps}fps ${seconds}s`);
}

const ease = {
  outCubic: (t) => 1 - (1 - t) ** 3,
  outQuad: (t) => 1 - (1 - t) ** 2,
  inQuad: (t) => t * t,
};
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// ── 1. Real roadrunner: the owner's photo cutout over its motion-blurred plates ──

async function realRoadrunner() {
  const clip = introClips.real;
  const W = 1920;
  const H = 1080;
  const LOOP = 4.8; // every layer completes whole cycles in 4.8 s → seamless loop
  const plate = tiled(await raw(await sharp(path.join(IMG, "roadrunner-plate.webp")).resize({ height: H }).toBuffer()), W);
  const groundH = Math.round(H * 0.34);
  const groundImg = await sharp(path.join(IMG, "roadrunner-ground.webp")).resize({ height: groundH }).ensureAlpha().toBuffer();
  const gm = await sharp(groundImg).metadata();
  // Fade the ground strip's top edge into the plate (the scene's old CSS mask).
  const fade = svg(gm.width, groundH, `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.45" stop-color="#fff" stop-opacity="1"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>`);
  const ground = tiled(await raw(await sharp(groundImg).composite([{ input: fade, blend: "dest-in" }]).png().toBuffer()), W);
  const grade = await raw(
    svg(
      W,
      H,
      `<defs><radialGradient id="v" cx="50%" cy="70%" r="75%"><stop offset="0.4" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.6"/></radialGradient>
       <linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#120a04" stop-opacity="0.45"/><stop offset="0.38" stop-color="#120a04" stop-opacity="0"/><stop offset="0.7" stop-color="#180a02" stop-opacity="0"/><stop offset="1" stop-color="#180a02" stop-opacity="0.5"/></linearGradient></defs>
       <rect width="100%" height="100%" fill="url(#v)"/><rect width="100%" height="100%" fill="url(#t)"/>`,
    ),
  );
  const bird = await raw(path.join(IMG, "roadrunner-real.webp"));
  const feetY = clip.subject.y * H;
  const shadow = await raw(await sharp(svg(560, 70, `<ellipse cx="280" cy="35" rx="240" ry="20" fill="#000" fill-opacity="0.45"/>`)).blur(8).png().toBuffer());
  const tag = await label(clip, W, H);

  await render(clip, { width: W, height: H, fps: 60, seconds: LOOP, background: "#2a1d12" }, async (t) => {
    const plateX = (t / LOOP) * 2 * plate.period; // 2 cycles per loop
    const groundX = (t / LOOP) * 4 * ground.period; // 4 cycles: the foreground rushes past faster
    const step = Math.abs(Math.sin((Math.PI * t) / 0.3)); // 16 strides per loop
    return [
      layer(windowAt(plate, plateX, W), 0, 0),
      layer(windowAt(ground, groundX, W), 0, H - groundH),
      layer(grade, 0, 0),
      layer(shadow, clip.subject.x * W - 280 + 40, feetY - 42),
      layer(bird, clip.subject.x * W - bird.width / 2, feetY - bird.height - 9 * step),
      tag,
    ];
  });
}

// ── 2. Cartoon roadrunner: the owner's cartoon cutout over a flat cartoon desert ──

async function cartoonDesertStrips(W, H) {
  const OUTLINE = "#3a1f14";
  const horizon = Math.round(H * 0.6);
  // Each strip's left and right edges match (shapes are drawn again one period over), so it tiles.
  const wrap = (period, shape) => shape(0) + shape(-period) + shape(period);
  const clouds = await raw(
    svg(960, 260, wrap(960, (o) => `<g transform="translate(${o + 120} 70) scale(1.25)" fill="#fff8ec" stroke="#f1d6b8" stroke-width="4"><path d="M0 60 Q0 20 40 24 Q56 -6 96 6 Q124 -10 150 18 Q196 14 196 52 Q200 76 170 76 L24 76 Q0 76 0 60 Z"/></g><g transform="translate(${o + 620} 150) scale(0.8)" fill="#fff8ec" stroke="#f1d6b8" stroke-width="4"><path d="M0 60 Q0 20 40 24 Q56 -6 96 6 Q124 -10 150 18 Q196 14 196 52 Q200 76 170 76 L24 76 Q0 76 0 60 Z"/></g>`)),
  );
  const mesaH = 300;
  const MESA_RIDGE = "L70 205 L100 120 L420 120 L452 200 L600 215 L640 150 L820 150 L852 225 L1080 235 L1120 90 L1500 90 L1540 210 L1760 225 L1800 160 L2030 160 L2062 230 L2400 210";
  const mesas = await raw(
    svg(
      2400,
      mesaH,
      wrap(
        2400,
        (o) =>
          // Fill the closed shape, but outline only the open ridge: stroking the closed
          // shape would draw a dark vertical line at every tile seam.
          `<path transform="translate(${o} 0)" d="M0 300 L0 210 ${MESA_RIDGE} L2400 300 Z" fill="#e0874a"/>
           <path transform="translate(${o} 0)" d="M0 210 ${MESA_RIDGE}" fill="none" stroke="${OUTLINE}" stroke-width="5" stroke-linejoin="round"/>
           <path transform="translate(${o} 0)" d="M100 150 L420 150 M1120 125 L1500 125 M640 175 L820 175" stroke="#c96a34" stroke-width="10"/>`,
      ),
    ),
  );
  const midH = 320;
  const cactus = (x, s) =>
    `<g transform="translate(${x} ${midH}) scale(${s})" fill="#4f9a4a" stroke="${OUTLINE}" stroke-width="5" stroke-linejoin="round"><path d="M-18 0 L-18 -200 Q-18 -226 0 -226 Q18 -226 18 -200 L18 0 Z"/><path d="M-18 -110 L-52 -110 Q-66 -110 -66 -126 L-66 -168 Q-66 -182 -54 -182 Q-42 -182 -42 -168 L-42 -134 L-18 -134 Z"/><path d="M18 -80 L50 -80 Q62 -80 62 -96 L62 -140 Q62 -152 52 -152 Q40 -152 40 -140 L40 -104 L18 -104 Z"/></g>`;
  const rock = (x, s) => `<g transform="translate(${x} ${midH}) scale(${s})"><path d="M-60 0 Q-58 -40 -20 -48 Q10 -62 44 -40 Q64 -24 62 0 Z" fill="#b8683e" stroke="${OUTLINE}" stroke-width="5"/></g>`;
  const mid = await raw(svg(2000, midH, wrap(2000, (o) => cactus(o + 260, 1) + rock(o + 700, 1.1) + cactus(o + 1180, 0.8) + rock(o + 1560, 0.8) + cactus(o + 1820, 1.15))));
  const nearH = H - Math.round(H * 0.72);
  const roadTop = Math.round(H * 0.83) - Math.round(H * 0.72);
  const roadH = Math.round(H * 0.1);
  const near = await raw(
    svg(
      1200,
      nearH,
      `<rect width="1200" height="${nearH}" fill="#f2c27b"/><rect y="0" width="1200" height="10" fill="#e6ad63"/>
       ${wrap(1200, (o) => [80, 330, 610, 900, 1110].map((x, i) => `<ellipse cx="${o + x}" cy="${[26, 44, 20, 38, 30][i]}" rx="${[14, 9, 18, 11, 7][i]}" ry="5" fill="#d9995a"/>`).join(""))}
       <rect y="${roadTop}" width="1200" height="${roadH}" fill="#5c5160"/><rect y="${roadTop}" width="1200" height="6" fill="#3f3744"/><rect y="${roadTop + roadH - 6}" width="1200" height="6" fill="#3f3744"/>
       ${wrap(1200, (o) => [0, 300, 600, 900].map((x) => `<rect x="${o + x + 40}" y="${roadTop + roadH / 2 - 6}" width="170" height="12" rx="6" fill="#ffd23f"/>`).join(""))}`,
    ),
  );
  const sky = await raw(
    svg(
      W,
      H,
      `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fb6ea"/><stop offset="${horizon / H}" stop-color="#c6e9f8"/></linearGradient>
       <radialGradient id="sun"><stop offset="0.55" stop-color="#ffd24a"/><stop offset="0.7" stop-color="#ffd24a" stop-opacity="0.35"/><stop offset="1" stop-color="#ffd24a" stop-opacity="0"/></radialGradient></defs>
       <rect width="100%" height="100%" fill="url(#s)"/><circle cx="${W * 0.82}" cy="${H * 0.17}" r="${H * 0.13}" fill="url(#sun)"/>`,
    ),
  );
  return { sky, clouds: tiled(clouds, W), mesas: tiled(mesas, W), mid: tiled(mid, W), near: tiled(near, W), horizon, mesaH, midH, nearH };
}

async function cartoonRoadrunner() {
  const clip = introClips.cartoon;
  const W = 1920;
  const H = 1080;
  const LOOP = 6; // clouds 1 cycle, mesas 1, mid 3, road 12: all whole → seamless
  const d = await cartoonDesertStrips(W, H);
  const birdW = 520;
  const bird = await raw(await sharp(path.join(IMG, "roadrunner-cartoon.webp")).resize({ width: birdW }).toBuffer());
  const feetY = clip.subject.y * H;
  const shadow = await raw(await sharp(svg(460, 60, `<ellipse cx="230" cy="30" rx="190" ry="15" fill="#7a3f16" fill-opacity="0.35"/>`)).blur(4).png().toBuffer());
  const tag = await label(clip, W, H, 0.4);

  await render(clip, { width: W, height: H, fps: 60, seconds: LOOP, background: "#7cc4ee" }, async (t) => {
    const p = t / LOOP;
    const step = Math.abs(Math.sin((Math.PI * t) / 0.2)); // 30 strides per loop
    return [
      layer(d.sky, 0, 0),
      layer(windowAt(d.clouds, p * d.clouds.period, W), 0, H * 0.05),
      layer(windowAt(d.mesas, p * d.mesas.period, W), 0, d.horizon - d.mesaH * 0.8),
      layer(windowAt(d.mid, p * 3 * d.mid.period, W), 0, H * 0.78 - d.midH),
      layer(windowAt(d.near, p * 12 * d.near.period, W), 0, H - d.nearH),
      layer(shadow, clip.subject.x * W - 230 - 20, feetY - 34),
      layer(bird, clip.subject.x * W - bird.width / 2, feetY - bird.height - 16 * step),
      tag,
    ];
  });
}

// ── 3. Dust cloud on black: grows out of one point, fully covers, then thins out ──

async function dustTransition() {
  const clip = introClips.dust;
  const W = 1280;
  const H = 720;
  const FPS = 30;
  const SECONDS = 4;
  const PEAK = 1.3; // src/content/intro-video.ts → introClipTiming.dustPeakAt
  const sprites = await Promise.all([1, 2, 3].map((n) => sharp(path.join(IMG, `dust-${n}.webp`)).toBuffer()));
  const cx = clip.subject.x * W;
  const cy = clip.subject.y * H;
  let seed = 11;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0), seed / 4294967296);
  // Puffs burst from the centre (mostly up and sideways), overlap into full cover, then drift out and thin.
  const puffs = Array.from({ length: 44 }, (_, i) => {
    const angle = -Math.PI * (0.02 + 0.96 * rand()) + (i % 5 === 0 ? Math.PI * 0.15 * (rand() - 0.5) : 0);
    return {
      sprite: i % 3,
      born: 0.9 * rand() * rand(),
      angle,
      dist: (0.15 + 0.75 * rand()) * W * 0.55,
      size: (0.35 + 0.65 * rand()) * H * 1.05,
      spin: (rand() - 0.5) * 70,
      rot0: rand() * 360,
      fadeAt: 1.5 + 0.6 * rand(),
      peak: 0.8 + 0.2 * rand(),
    };
  });
  const core = await sharp(svg(1000, 1000, `<defs><radialGradient id="c"><stop offset="0" stop-color="#ead6b3"/><stop offset="0.35" stop-color="#dcc197" stop-opacity="0.9"/><stop offset="0.7" stop-color="#d0b284" stop-opacity="0.45"/><stop offset="1" stop-color="#c9a878" stop-opacity="0"/></radialGradient></defs><circle cx="500" cy="500" r="500" fill="url(#c)"/>`)).png().toBuffer();
  const tag = await label(clip, W, H, 0.1);
  const PAD = Math.round(H * 1.3);

  // Render on a padded canvas (puffs can extend past the edges), then cut out the frame.
  const file = path.join(PLACEHOLDER_DIR, `${clip.file}.mp4`);
  const enc = encoder(file, { width: W, height: H, fps: FPS });
  for (let i = 0; i < SECONDS * FPS; i++) {
    const t = i / FPS;
    const layers = [];
    // Core glow: grows to cover the whole frame by the peak, then fades.
    const coreGrow = ease.outCubic(clamp01(t / PEAK));
    // It trails the puffs (they lead the burst), and clears first.
    const coreFade = 1 - ease.inQuad(clamp01((t - 1.5) / 1.0));
    const coreSize = Math.max(8, Math.round(H * 3.4 * coreGrow));
    // Soft enough that the puffs' texture reads on top (the intro adds its own flat cover underneath).
    const coreOp = 0.55 * coreFade * ease.inQuad(clamp01((t - 0.12) / 0.8));
    if (coreOp > 0.01) {
      const img = await raw(await sharp(core).resize(coreSize, coreSize).linear([1, 1, 1, coreOp], [0, 0, 0, 0]).png().toBuffer());
      layers.push(layer(img, PAD + cx - coreSize / 2, PAD + cy - coreSize / 2));
    }
    for (const p of puffs) {
      if (t < p.born) continue;
      const grow = ease.outCubic(clamp01((t - p.born) / (PEAK + 0.1 - p.born)));
      const out = ease.outQuad(clamp01((t - p.fadeAt + 0.6) / 2.2)); // keeps drifting outward as it thins
      const dist = p.dist * (0.25 + 0.75 * grow + 0.55 * out);
      const size = Math.round(p.size * (0.15 + 0.85 * grow + 0.5 * out));
      const op = p.peak * clamp01((t - p.born) / 0.18) * (1 - ease.inQuad(clamp01((t - p.fadeAt) / 1.1)));
      if (op < 0.01 || size < 4) continue;
      const img = await raw(
        await sharp(sprites[p.sprite])
          .resize(size, size)
          .rotate(p.rot0 + p.spin * t, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .linear([1, 1, 1, op], [0, 0, 0, 0])
          .png()
          .toBuffer(),
      );
      const x = PAD + cx + Math.cos(p.angle) * dist - img.width / 2;
      const y = PAD + cy + Math.sin(p.angle) * dist * 0.75 - img.height / 2;
      if (x < 0 || y < 0 || x + img.width > W + PAD * 2 || y + img.height > H + PAD * 2) continue;
      layers.push(layer(img, x, y));
    }
    const canvas = await sharp({ create: { width: W + PAD * 2, height: H + PAD * 2, channels: 4, background: "#000000" } })
      .composite(layers)
      .png()
      .toBuffer();
    const buf = await sharp(canvas).extract({ left: PAD, top: PAD, width: W, height: H }).composite([tag]).raw().toBuffer();
    await enc.write(buf);
  }
  await enc.end();
  console.log(`  ${path.relative(ROOT, file)}  ${W}x${H} ${FPS}fps ${SECONDS}s (peak cover at ${PEAK}s)`);
}

// ── 4. Party bus: the owner's bus photo driving in at night, braking, settling ──

async function partyBus() {
  const clip = introClips.bus;
  const W = 1920;
  const H = 1080;
  const SECONDS = 5;
  const SETTLE = 3.2; // fully stopped from here on: the last frame is the resting reveal
  const horizon = Math.round(H * 0.62);
  const roadTop = Math.round(H * 0.79);
  const roadBottom = Math.round(H * 0.94);
  let seed = 5;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0), seed / 4294967296);
  const stars = Array.from({ length: 110 }, () => `<circle cx="${(rand() * W).toFixed(1)}" cy="${(rand() * horizon * 0.85).toFixed(1)}" r="${(0.6 + rand() * 1.5).toFixed(2)}" fill="#fff" fill-opacity="${(0.25 + rand() * 0.6).toFixed(2)}"/>`).join("");
  const sky = await raw(
    svg(
      W,
      H,
      `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07040f"/><stop offset="0.45" stop-color="#1d0d33"/><stop offset="${horizon / H}" stop-color="#4a1f55"/><stop offset="${horizon / H + 0.001}" stop-color="#140c14"/><stop offset="1" stop-color="#050306"/></linearGradient>
       <radialGradient id="glow" cx="50%" cy="${(horizon / H) * 100}%" r="60%"><stop offset="0" stop-color="#b04a8a" stop-opacity="0.35"/><stop offset="1" stop-color="#b04a8a" stop-opacity="0"/></radialGradient></defs>
       <rect width="100%" height="100%" fill="url(#s)"/><rect width="100%" height="100%" fill="url(#glow)"/>${stars}`,
    ),
  );
  const wrap = (period, shape) => shape(0) + shape(-period) + shape(period);
  const ridgeH = 220;
  const ridge = tiled(
    await raw(svg(2400, ridgeH, wrap(2400, (o) => `<path transform="translate(${o} 0)" d="M0 220 L0 150 L180 110 L320 140 L520 60 L700 130 L900 100 L1100 150 L1300 80 L1480 120 L1700 40 L1900 130 L2100 110 L2400 150 L2400 220 Z" fill="#12091c"/><path transform="translate(${o} 0)" d="M0 150 L180 110 L320 140 L520 60 L700 130 L900 100 L1100 150 L1300 80 L1480 120 L1700 40 L1900 130 L2100 110 L2400 150" fill="none" stroke="#5a2f6e" stroke-opacity="0.6" stroke-width="3"/>`))),
    W,
  );
  const roadH = roadBottom - roadTop;
  const road = tiled(
    await raw(
      svg(
        1040,
        roadH,
        `<rect width="1040" height="${roadH}" fill="#16121b"/><rect width="1040" height="4" fill="#2c2433"/><rect y="${roadH - 4}" width="1040" height="4" fill="#2c2433"/>
         ${wrap(1040, (o) => [0, 520].map((x) => `<rect x="${o + x + 60}" y="${roadH / 2 - 5}" width="260" height="10" rx="5" fill="#d8c9a0" fill-opacity="0.75"/>`).join(""))}`,
      ),
    ),
    W,
  );
  const busW = 1000;
  const bus = await raw(await sharp(path.join(IMG, "bus-exterior.webp")).resize({ width: busW }).toBuffer());
  const wheelsY = clip.subject.y * H;
  const shadow = await raw(await sharp(svg(1100, 90, `<ellipse cx="550" cy="45" rx="500" ry="26" fill="#000" fill-opacity="0.8"/>`)).blur(10).png().toBuffer());
  const pool = await raw(await sharp(svg(1400, 260, `<defs><radialGradient id="p" cx="62%" cy="50%" r="50%"><stop offset="0" stop-color="#ffd9a0" stop-opacity="0.5"/><stop offset="0.5" stop-color="#9a3fb0" stop-opacity="0.3"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><ellipse cx="700" cy="130" rx="700" ry="130" fill="url(#p)"/>`)).png().toBuffer());
  // Headlight glows on the photo's real lamps (fractions of the cutout, as in src/content/assets.ts).
  const lamps = [
    { x: 0.73, y: 0.61, s: 1 },
    { x: 0.985, y: 0.62, s: 0.7 },
  ];
  const glow = await raw(await sharp(svg(240, 240, `<defs><radialGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="0.18" stop-color="#fff0d2" stop-opacity="0.9"/><stop offset="0.45" stop-color="#ffc47a" stop-opacity="0.3"/><stop offset="1" stop-color="#ffc47a" stop-opacity="0"/></radialGradient></defs><circle cx="120" cy="120" r="120" fill="url(#g)"/>`)).png().toBuffer());
  const tag = await label(clip, W, H, 0.945);

  await render(clip, { width: W, height: H, fps: 60, seconds: SECONDS, background: "#050306" }, async (t) => {
    const k = clamp01(t / SETTLE);
    const travel = ease.outCubic(k); // camera tracks the bus as it brakes to a stop
    const busX = clip.subject.x * W - busW / 2 - 260 * (1 - travel);
    const bob = 2.5 * Math.sin((2 * Math.PI * t) / 0.33) * (1 - k) ** 2;
    const busY = wheelsY - bus.height + bob;
    const layers = [
      layer(sky, 0, 0),
      layer(windowAt(ridge, 380 * travel, W), 0, horizon - ridgeH),
      layer(windowAt(road, 2600 * travel, W), 0, roadTop),
      layer(pool, busX - 180, wheelsY - 150, { blend: "screen" }),
      layer(shadow, busX - 50, wheelsY - 50),
      layer(bus, busX, busY),
    ];
    for (const l of lamps) {
      const size = Math.round(240 * l.s);
      const g = size === 240 ? glow : await raw(await sharp(Buffer.from(glow.data), { raw: { width: 240, height: 240, channels: 4 } }).resize(size, size).png().toBuffer());
      layers.push(layer(g, busX + l.x * busW - size / 2, busY + l.y * bus.height - size / 2, { blend: "screen" }));
    }
    layers.push(tag);
    return layers;
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

const JOBS = { real: realRoadrunner, cartoon: cartoonRoadrunner, dust: dustTransition, bus: partyBus };

export async function renderPlaceholders({ slots = Object.keys(JOBS), overwrite = false } = {}) {
  mkdirSync(PLACEHOLDER_DIR, { recursive: true });
  for (const slot of slots) {
    const out = path.join(PLACEHOLDER_DIR, `${introClips[slot].file}.mp4`);
    if (!overwrite && existsSync(out)) continue;
    console.log(`Rendering placeholder: ${slot}`);
    await JOBS[slot]();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await renderPlaceholders({ slots: only ?? Object.keys(JOBS), overwrite: force });
}
