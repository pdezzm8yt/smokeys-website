#!/usr/bin/env node
/**
 * Inspects the owner's intro videos before anything is built from them.
 *
 *   npm run video:inspect                  (every video in assets/intro-source/video/)
 *   npm run video:inspect -- a.mp4 b.mov   (specific files)
 *
 * For each clip it reports container, codec, resolution, aspect ratio, frame
 * rate (nominal and measured, so variable-frame-rate phone footage shows up),
 * duration, bitrate, audio, rotation and whether it carries transparency. It
 * then samples frames to classify the background (transparent / black / green
 * screen / white / regular footage), finds hard cuts, black and frozen
 * stretches (trim candidates), and writes a contact sheet per clip (over a
 * checkerboard, so transparency is visible) to .cache/intro-video/.
 *
 * Uses the ffmpeg binary from the `ffmpeg-static` dev dependency. On macOS,
 * HEVC clips are also checked with AVFoundation, because ffmpeg can't see
 * Apple's "HEVC with alpha" layer.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { avfoundationAlpha, FFMPEG as ffmpegPath } from "./lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(ROOT, "assets/intro-source/video");
const OUT = path.join(ROOT, ".cache/intro-video");
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|gif|hevc|mts)$/i;
const SAMPLES = 12;

const files = process.argv.slice(2).length
  ? process.argv.slice(2).map((f) => path.resolve(f))
  : existsSync(SRC)
    ? readdirSync(SRC).filter((f) => VIDEO_EXT.test(f)).sort().map((f) => path.join(SRC, f))
    : [];
if (!files.length) {
  console.error(`No videos found. Put them in ${path.relative(ROOT, SRC)}/ or pass paths.`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

/** ffmpeg's stderr for `args` (ffmpeg exits non-zero for `-i` alone; that's expected). */
function ffmpeg(args) {
  return spawnSync(ffmpegPath, ["-hide_banner", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).stderr ?? "";
}

/** Split "a (b, c), d, e" on top-level commas only. */
function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const ratio = (w, h) => `${w / gcd(w, h)}:${h / gcd(w, h)}`;
const seconds = (hms) => hms.split(":").reduce((acc, v) => acc * 60 + Number(v), 0);

function probe(file) {
  const info = ffmpeg(["-i", file]);
  const duration = seconds(info.match(/Duration: ([\d:.]+)/)?.[1] ?? "0");
  const bitrate = Number(info.match(/bitrate: (\d+) kb\/s/)?.[1] ?? 0);
  const vLine = info.match(/Stream #\d+:\d+[^:]*: Video: (.*)/)?.[1] ?? "";
  const parts = splitTop(vLine);
  const codec = parts[0] ?? "?";
  const pixFmt = (parts[1] ?? "").split("(")[0].trim();
  const size = parts.find((p) => /^\d+x\d+/.test(p)) ?? "";
  let [w, h] = (size.match(/^(\d+)x(\d+)/)?.slice(1) ?? [0, 0]).map(Number);
  const nominalFps = Number(parts.find((p) => / fps$/.test(p))?.replace(" fps", "") ?? parts.find((p) => / tbr$/.test(p))?.replace(" tbr", "") ?? 0);
  const rotation = Number(info.match(/rotation of (-?[\d.]+) degrees/)?.[1] ?? 0);
  if (Math.abs(rotation) % 180 === 90) [w, h] = [h, w];
  const alphaMode = /alpha_mode\s*:\s*1/.test(info);
  const audio = /Stream #\d+:\d+[^:]*: Audio: (\w+)/.exec(info)?.[1] ?? null;

  // Exact frame count (stream copy, no decode) → measured frame rate.
  const counted = ffmpeg(["-i", file, "-map", "0:v:0", "-c", "copy", "-f", "null", "-"]);
  const frames = Number([...counted.matchAll(/frame=\s*(\d+)/g)].at(-1)?.[1] ?? 0);

  let alpha = /^(yuva|rgba|bgra|argb|abgr|gbrap|ya\d|pal8)/.test(pixFmt) ? `yes (${pixFmt})` : alphaMode ? "yes (WebM alpha_mode)" : "no";
  if (alpha === "no" && /hevc/.test(codec) && process.platform === "darwin") {
    alpha = avfoundationAlpha(file) ? "yes (HEVC with alpha: re-export as ProRes 4444 or VP9-alpha WebM, the build can't decode it)" : "no";
  }
  const hdr = /arib-std-b67|smpte2084/.test(vLine) ? "HDR (converted to SDR Rec.709 by the build)" : "SDR";
  return { duration, bitrate, codec, pixFmt, w, h, nominalFps, frames, rotation, alpha, alphaMode, audio, hdr };
}

/** Hard cuts, black stretches and frozen stretches: where a clip may need trimming. */
function timeline(file) {
  const cuts = [...ffmpeg(["-i", file, "-an", "-vf", "select='gt(scene,0.35)',showinfo", "-f", "null", "-"]).matchAll(/pts_time:([\d.]+)/g)].map(
    (m) => +Number(m[1]).toFixed(2),
  );
  const log = ffmpeg(["-i", file, "-an", "-vf", "blackdetect=d=0.05:pix_th=0.10,freezedetect=n=0.003:d=0.4", "-f", "null", "-"]);
  const black = [...log.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => [+Number(m[1]).toFixed(2), +Number(m[2]).toFixed(2)]);
  const freezeStarts = [...log.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => +Number(m[1]).toFixed(2));
  const freezeEnds = [...log.matchAll(/freeze_end: ([\d.]+)/g)].map((m) => +Number(m[1]).toFixed(2));
  const frozen = freezeStarts.map((s, i) => [s, freezeEnds[i] ?? "end"]);
  return { cuts, black, frozen };
}

/** Classify one sampled frame's background from its outer border. */
async function classify(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const band = Math.max(2, Math.round(Math.min(W, H) * 0.04));
  let n = 0;
  const c = { transparent: 0, black: 0, green: 0, blue: 0, white: 0 };
  let opaqueInside = 0;
  let inside = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      const border = x < band || y < band || x >= W - band || y >= H - band;
      if (!border) {
        inside++;
        if (a > 16) opaqueInside++;
        continue;
      }
      n++;
      if (a < 16) c.transparent++;
      else if (Math.max(r, g, b) < 28) c.black++;
      else if (g > 90 && g > r * 1.35 && g > b * 1.35) c.green++;
      else if (b > 90 && b > r * 1.35 && b > g * 1.2) c.blue++;
      else if (Math.min(r, g, b) > 225) c.white++;
    }
  }
  const frac = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / n]));
  const kind =
    frac.transparent > 0.8 ? "transparent" : frac.green > 0.6 ? "green screen" : frac.blue > 0.6 ? "blue screen" : frac.black > 0.8 ? "black" : frac.white > 0.8 ? "white" : "regular footage";
  return { kind, subjectCoverage: opaqueInside / Math.max(1, inside) };
}

async function sample(file, meta, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  // libvpx decodes WebM's alpha channel (ffmpeg's native VP8/VP9 decoder drops it).
  const decoder = meta.alphaMode ? ["-c:v", /vp8/.test(meta.codec) ? "libvpx" : "libvpx-vp9"] : [];
  const shots = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = (meta.duration * (i + 0.5)) / SAMPLES;
    const out = path.join(dir, `${String(i).padStart(2, "0")}-${t.toFixed(2)}s.png`);
    ffmpeg(["-ss", t.toFixed(3), ...decoder, "-i", file, "-frames:v", "1", "-vf", "scale='min(480,iw)':-2", "-y", out]);
    if (existsSync(out)) shots.push({ t, out, ...(await classify(out)) });
  }
  return shots;
}

/** One contact sheet per clip, frames over a checkerboard so transparency shows. */
async function contactSheet(shots, out) {
  if (!shots.length) return;
  const first = await sharp(shots[0].out).metadata();
  const w = first.width;
  const h = first.height;
  const cols = w > h ? 4 : 6;
  const rows = Math.ceil(shots.length / cols);
  const cell = 16;
  const checker = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><pattern id="c" width="${cell * 2}" height="${cell * 2}" patternUnits="userSpaceOnUse"><rect width="${cell * 2}" height="${cell * 2}" fill="#bbb"/><rect width="${cell}" height="${cell}" fill="#eee"/><rect x="${cell}" y="${cell}" width="${cell}" height="${cell}" fill="#eee"/></pattern></defs><rect width="100%" height="100%" fill="url(#c)"/></svg>`,
  );
  const tiles = await Promise.all(
    shots.map(async (s, i) => {
      const label = Buffer.from(
        `<svg width="${w}" height="20"><rect width="100%" height="20" fill="black" opacity="0.7"/><text x="4" y="15" font-size="13" font-family="Helvetica" fill="white">${s.t.toFixed(2)}s · ${s.kind}</text></svg>`,
      );
      const img = await sharp(checker)
        .composite([{ input: await sharp(s.out).resize(w, h).toBuffer() }, { input: label, top: 0, left: 0 }])
        .png()
        .toBuffer();
      return { input: img, left: (i % cols) * w, top: Math.floor(i / cols) * h };
    }),
  );
  await sharp({ create: { width: w * cols, height: h * rows, channels: 3, background: "#000" } }).composite(tiles).jpeg({ quality: 82 }).toFile(out);
}

const report = [];
for (const file of files) {
  const name = path.basename(file);
  const meta = probe(file);
  const { cuts, black, frozen } = timeline(file);
  const dir = path.join(OUT, name.replace(/\.[^.]+$/, ""));
  const shots = await sample(file, meta, dir);
  const sheet = `${dir}.jpg`;
  await contactSheet(shots, sheet);
  const kinds = shots.map((s) => s.kind);
  const background = [...new Set(kinds)].map((k) => `${k} ×${kinds.filter((x) => x === k).length}`).join(", ");
  const measuredFps = meta.duration ? meta.frames / meta.duration : 0;
  const r = {
    file: path.relative(ROOT, file) || file,
    sizeMB: +(statSync(file).size / 1048576).toFixed(1),
    duration: +meta.duration.toFixed(3),
    resolution: `${meta.w}x${meta.h}`,
    aspect: `${ratio(meta.w, meta.h)} (${(meta.w / meta.h).toFixed(3)})`,
    orientation: meta.w > meta.h ? "landscape" : meta.w < meta.h ? "portrait" : "square",
    codec: meta.codec,
    pixelFormat: meta.pixFmt,
    fps: { nominal: meta.nominalFps, measured: +measuredFps.toFixed(2), frames: meta.frames, variable: Math.abs(measuredFps - meta.nominalFps) > 0.5 },
    bitrateKbps: meta.bitrate,
    audio: meta.audio,
    rotation: meta.rotation,
    transparency: meta.alpha,
    dynamicRange: meta.hdr,
    background,
    subjectCoverage: shots.length ? +(shots.reduce((a, s) => a + s.subjectCoverage, 0) / shots.length).toFixed(2) : null,
    hardCuts: cuts,
    blackStretches: black,
    frozenStretches: frozen,
    contactSheet: path.relative(ROOT, sheet),
  };
  report.push(r);
  console.log(`\n${name}`);
  for (const [k, v] of Object.entries(r)) if (k !== "file") console.log(`  ${k.padEnd(16)} ${typeof v === "object" && v !== null ? JSON.stringify(v) : v}`);
}
writeFileSync(path.join(OUT, "inspect.json"), JSON.stringify(report, null, 2));
console.log(`\nReport: ${path.relative(ROOT, path.join(OUT, "inspect.json"))}`);
