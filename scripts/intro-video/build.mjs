#!/usr/bin/env node
/**
 * Builds the intro film's web files from its masters.
 *
 *   npm run video:build                  (every cut that has a master)
 *   npm run video:build -- --only=wide
 *
 * For each cut in src/content/intro-video.ts (portrait, wide):
 *   master = assets/intro-source/video/<file>.{mov,mp4,m4v,webm,mkv}
 *   → public/video/intro/
 *       <file>.mp4               H.264 High, long edge ≤1920, no audio   (every browser)
 *       <file>.webm              VP9 (Chromium builds without H.264)
 *       <file>-small.mp4         phones: long edge ≤1440, lighter
 *       <file>-<still>.webp      stills: start, cover, rest (reduced motion, no JS, while loading)
 *       <file>-glow-<n>.webp     tiny pre-blurred glows (behind the film when it's shown as a band)
 *   → src/content/intro-video.generated.json  (sizes, durations, file names, KB)
 * A cut without a master is skipped, and its existing files are left alone
 * (masters are git-ignored: another machine may have built them).
 *
 * The whole film is scrubbed by the scroll, so every version is encoded for
 * instant seeking: ≤30 fps, a keyframe every 4 frames, no B-frames.
 * Processing order: trim → constant frame rate → crop → mirror → HDR→SDR →
 * scale. Audio is always dropped.
 *
 * Each cut is built into a scratch folder, checked, and only then swapped
 * into public/video/intro (with its manifest entry): a failed build never
 * leaves the site pointing at missing files.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { FILM_GLOWS, FILM_STILLS, frameTimes, introFilm } from "../../src/content/intro-video.ts";
import { ffmpeg, probe, ROOT } from "./lib.mjs";

const MASTERS = path.join(ROOT, "assets/intro-source/video");
const OUT = path.join(ROOT, "public/video/intro");
const MANIFEST = path.join(ROOT, "src/content/intro-video.generated.json");
const SCRATCH = path.join(ROOT, ".cache/intro-video/build");
const MASTER_EXT = ["mov", "mp4", "m4v", "webm", "mkv"];

/** Long edge of each version, in px. */
const FULL_MAX = 1920;
const SMALL_MAX = 1440;
/** Every seek decodes at most this many frames. */
const GOP = 4;
const MAX_FPS = 30;
/** The glows are drawn this small (then blurred): the browser scales them up smoothly. */
const GLOW_LONG = 160;
/** Warn above these (KB): the film downloads completely before the intro can be scrolled. */
const BUDGET_KB = { full: 7000, small: 3500 };

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");

/** Round DOWN to even (encoders need even sizes; never ask for more pixels than exist). */
const evenDown = (n) => Math.max(2, 2 * Math.floor(n / 2));
const kb = (file) => Math.round(statSync(file).size / 1024);
/** Output size for a long-edge limit, keeping the aspect ratio. */
const fit = (w, h, max) => {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: evenDown(w * s), h: evenDown(h * s) };
};

function findMaster(file) {
  if (!existsSync(MASTERS)) return null;
  const names = readdirSync(MASTERS);
  for (const ext of MASTER_EXT) {
    const hit = names.find((n) => n.toLowerCase() === `${file}.${ext}`);
    if (hit) return path.join(MASTERS, hit);
  }
  return null;
}

const OUTPUT_COLOUR = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];

/** The shared filter chain (before scaling): { chain, duration, w, h, fps }. */
function baseChain(cut, src) {
  const fps = Math.min(MAX_FPS, Math.round(src.fps) || 30);
  const start = Math.max(0, cut.trim?.start ?? 0);
  // The film never shows anything after `rest`: unless trim.end says otherwise, end just after it (a smaller download).
  const end = Math.min(cut.trim?.end ?? start + cut.beats.rest + 2 / fps, src.duration);
  if (cut.trim?.end === undefined) console.log(`  ${cut.file}: ends at ${end.toFixed(2)} s, just after beats.rest (set trim.end to change)`);
  const duration = end - start;
  if (!(duration > 1)) throw new Error(`${cut.file}: trim leaves ${duration.toFixed(2)} s of video`);
  let w = src.w;
  let h = src.h;
  // Constant frame rate (phone footage is often variable): exact seeks.
  const steps = [`trim=start=${start}:end=${end}`, "setpts=PTS-STARTPTS", `fps=${fps}`];
  // Crop first: its fractions are measured on the master as you see it (e.g. in video:inspect).
  if (cut.crop) {
    const cw = evenDown(Math.min(1, cut.crop.w) * w);
    const ch = evenDown(Math.min(1, cut.crop.h) * h);
    const x = Math.min(w - cw, Math.max(0, Math.round(cut.crop.x * w)));
    const y = Math.min(h - ch, Math.max(0, Math.round(cut.crop.y * h)));
    steps.push(`crop=${cw}:${ch}:${x}:${y}`);
    [w, h] = [cw, ch];
  }
  if (cut.mirror) steps.push("hflip");
  if (src.hdr) {
    // iPhone HDR (HLG/PQ, BT.2020) → SDR Rec.709, so colours match every browser and the stills.
    steps.push("zscale=t=linear:npl=100", "format=gbrpf32le", "zscale=p=bt709", "tonemap=tonemap=hable:desat=0", "zscale=t=bt709:m=bt709:r=tv");
  }
  steps.push("format=yuv444p");
  return { chain: steps.join(","), duration, w, h, fps };
}

/** Check the beats are in order and each has a frame at or after it (the last frame starts one frame before the end). */
function checkBeats(cut, duration, fps) {
  const order = ["tunnel", "swallowed", "cover", "headlights", "rest"];
  const lastFrame = duration - 1 / fps;
  let prev = 0;
  for (const name of order) {
    const t = cut.beats[name];
    if (!(t > prev) || t > lastFrame) {
      const minEnd = (cut.trim?.start ?? 0) + t + 1 / fps;
      throw new Error(
        `${cut.file}: beats.${name} = ${t} must come after the previous beat and before the cut's last frame (${lastFrame.toFixed(3)} s; ` +
          `the cut ends at ${duration.toFixed(3)} s, so trim.end would need to be at least ${minEnd.toFixed(3)}). Beats are seconds after trim.start.`,
      );
    }
    prev = t;
  }
}

async function buildCut(name, cut) {
  const master = findMaster(cut.file);
  if (!master) {
    console.log(`${name.padEnd(9)} no master (assets/intro-source/video/${cut.file}.*): kept as is`);
    return undefined;
  }
  const src = probe(master);
  if (src.hevcAlpha || src.alpha) throw new Error(`${cut.file}: the film must be opaque footage (this master has transparency).`);
  const input = ["-i", master];
  const base = baseChain(cut, src);
  checkBeats(cut, base.duration, base.fps);
  const full = fit(base.w, base.h, FULL_MAX);
  const small = fit(base.w, base.h, SMALL_MAX);
  // A keyframe every GOP frames, no B-frames; 3 reference frames is all a 4-frame GOP can use, and keeps
  // 1920x1080/1080x1920 at H.264 Level 4.0 (what the page checks support for: avc1.640028).
  const seekable = ["-g", String(GOP), "-keyint_min", String(GOP), "-sc_threshold", "0", "-bf", "0", "-refs", "3"];
  const tmp = path.join(SCRATCH, cut.file);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const out = (suffix) => path.join(tmp, `${cut.file}${suffix}`);
  const graph = (scale, format = "yuv420p") => `[0:v]${base.chain},scale=${scale.w}:${scale.h}:flags=lanczos,format=${format}[v]`;

  // Stills and glows first (seconds, not minutes): a beat with no frame fails before the long encodes.
  // Frames are picked by time in the processed cut.
  const times = frameTimes(cut.beats);
  const frame = (t, label) => {
    const png = path.join(tmp, `${label}.png`);
    ffmpeg([...input, "-filter_complex", `${graph(full, "rgb24").replace("[v]", "")},select='gte(t\\,${t.toFixed(3)})'[v]`, "-map", "[v]", "-frames:v", "1", png]);
    if (!existsSync(png)) throw new Error(`${cut.file}: no frame at ${t.toFixed(2)} s (the processed cut is ${base.duration.toFixed(2)} s)`);
    return png;
  };
  const stills = {};
  for (const still of FILM_STILLS) {
    const png = frame(times[still], `still-${still}`);
    await sharp(png).webp({ quality: 82 }).toFile(out(`-${still}.webp`));
    stills[still] = `${cut.file}-${still}.webp`;
  }
  const glows = {};
  const tiny = fit(base.w, base.h, 24);
  const glowSize = fit(base.w, base.h, GLOW_LONG);
  for (const glow of FILM_GLOWS) {
    const png = frame(times[glow], `glow-${glow}`);
    // Shrink hard, scale back up a little and blur: a soft field of the scene's colours, dimmed so the film stays the focus.
    const down = await sharp(png).resize(tiny.w, tiny.h, { fit: "fill" }).toBuffer();
    await sharp(down).resize(glowSize.w, glowSize.h, { fit: "fill", kernel: "cubic" }).blur(6).modulate({ brightness: 0.42, saturation: 1 }).webp({ quality: 70 }).toFile(out(`-glow-${glow}.webp`));
    glows[glow] = `${cut.file}-glow-${glow}.webp`;
  }

  // H.264: plays everywhere with hardware decoding (the smoothest scrubbing).
  ffmpeg([...input, "-filter_complex", graph(full), "-map", "[v]", "-an",
    "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-profile:v", "high", "-pix_fmt", "yuv420p", ...seekable,
    ...OUTPUT_COLOUR, "-movflags", "+faststart", out(".mp4")]);
  // VP9: for browsers that can't play the H.264 file.
  ffmpeg([...input, "-filter_complex", graph(full), "-map", "[v]", "-an",
    "-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", "-g", String(GOP), "-auto-alt-ref", "0",
    ...OUTPUT_COLOUR, out(".webm")]);
  // Phones: smaller and lighter.
  ffmpeg([...input, "-filter_complex", graph(small), "-map", "[v]", "-an",
    "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-profile:v", "high", "-pix_fmt", "yuv420p", ...seekable,
    ...OUTPUT_COLOUR, "-movflags", "+faststart", out("-small.mp4")]);

  const main = probe(out(".mp4"));
  const files = { mp4: `${cut.file}.mp4`, webm: `${cut.file}.webm`, small: `${cut.file}-small.mp4` };
  const produced = [...Object.values(files), ...Object.values(stills), ...Object.values(glows)];
  for (const f of produced) if (!existsSync(path.join(tmp, f))) throw new Error(`${cut.file}: missing output ${f}`);

  // Everything built and checked: swap it in, and drop this cut's files the build no longer makes.
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (f.startsWith(`${cut.file}.`) || f.startsWith(`${cut.file}-`)) if (!produced.includes(f)) rmSync(path.join(OUT, f));
  for (const f of produced) renameSync(path.join(tmp, f), path.join(OUT, f));
  rmSync(tmp, { recursive: true, force: true });

  const entry = {
    source: path.relative(ROOT, master),
    width: main.w,
    height: main.h,
    duration: +main.duration.toFixed(3),
    fps: base.fps,
    files,
    small: { width: small.w, height: small.h },
    stills,
    glows,
    kb: Object.fromEntries(produced.map((f) => [f, kb(path.join(OUT, f))])),
  };
  console.log(
    `${name.padEnd(9)} ${entry.width}x${entry.height} ${entry.duration}s ${base.fps}fps  ` +
      Object.entries(entry.kb).map(([f, s]) => `${f.replace(cut.file, "")}:${s}KB`).join(" "),
  );
  const fullKb = entry.kb[files.mp4] ?? 0;
  const smallKb = entry.kb[files.small] ?? 0;
  if (fullKb > BUDGET_KB.full || smallKb > BUDGET_KB.small) {
    console.warn(
      `  ! ${cut.file} is heavy (${fullKb} KB, phones ${smallKb} KB; budget ${BUDGET_KB.full}/${BUDGET_KB.small} KB). ` +
        "The film downloads completely before the intro can scroll: trim it shorter (end just after `rest`).",
    );
  }
  return entry;
}

const previous = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
// Only cuts belong in the manifest (older builds listed separate clips).
const manifest = Object.fromEntries(Object.keys(introFilm.cuts).filter((k) => previous[k]).map((k) => [k, previous[k]]));
for (const [name, cut] of Object.entries(introFilm.cuts)) {
  if (only && !only.includes(name)) continue;
  const entry = await buildCut(name, cut);
  if (entry) manifest[name] = entry;
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`); // after every cut: always matches public/
}
if (!Object.keys(manifest).length) console.warn("! No cut has been built: the intro needs at least one master (see assets/intro-source/video/README.md).");
console.log(`\nManifest: ${path.relative(ROOT, MANIFEST)}`);
