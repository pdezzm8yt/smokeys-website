#!/usr/bin/env node
/**
 * Builds the intro's web video files from master clips.
 *
 *   npm run video:build                 (all clips)
 *   npm run video:build -- --only=bus
 *
 * For each clip in src/content/intro-video.ts:
 *   master = assets/intro-source/video/<file>.{mov,mp4,m4v,webm,mkv}  (your footage)
 *         or the rendered placeholder (.cache/intro-video/placeholders)  → labelled "placeholder"
 *   → public/video/intro/
 *       <file>.mp4          H.264 High, ≤1920 wide, keyframe every second, faststart, no audio  (every browser)
 *       <file>.webm         VP9 (smaller; the transparent version when the clip is "alpha")
 *       <file>.mov          HEVC with alpha, Safari's transparent version ("alpha" clips, macOS only)
 *       <file>-mobile.mp4   phone crop (portrait, never narrower than the clip's minVisible) ≤810 wide
 *       <file>-poster.webp  still frame (reduced motion, no JS, anything that couldn't load)
 *   → src/content/intro-video.generated.json  (sizes, durations, crops, backdrop colours, placeholder flags)
 *
 * Processing order: trim → constant frame rate → crop → mirror → HDR→SDR →
 * chroma key → seamless-loop crossfade → scale. Audio is always dropped (the
 * intro is muted; it also keeps autoplay allowed). Seekable clips (scrubbed
 * with the scroll) are capped at 30 fps with a keyframe every 4 frames.
 *
 * Each clip is built into a scratch folder, checked, and only then swapped
 * into public/video/intro (with its manifest entry): a failed build never
 * leaves the site pointing at missing files.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { introClips } from "../../src/content/intro-video.ts";
import { ffmpeg, probe, ROOT } from "./lib.mjs";
import { PLACEHOLDER_DIR, renderPlaceholders } from "./placeholders.mjs";

const MASTERS = path.join(ROOT, "assets/intro-source/video");
const OUT = path.join(ROOT, "public/video/intro");
const MANIFEST = path.join(ROOT, "src/content/intro-video.generated.json");
const SCRATCH = path.join(ROOT, ".cache/intro-video/build");
const MASTER_EXT = ["mov", "mp4", "m4v", "webm", "mkv"];
const SUFFIXES = [".mp4", ".webm", ".mov", "-mobile.mp4", "-poster.webp"];

/** Web output limits. Desktop: highest practical quality; phones: a lighter crop. */
const DESKTOP_MAX_W = 1920;
const MOBILE_MAX_W = 810;
const MOBILE_MAX_H = 1440;
/** Scrubbed clips: every seek decodes at most this many frames. */
const SEEKABLE_GOP = 4;
const SEEKABLE_MAX_FPS = 30;
/** Warn above these (KB): everything is downloaded before the intro can be scrolled. */
const BUDGET_KB = { desktop: 4500, mobile: 1500 };

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");

/** Round DOWN to even (encoders need even sizes; never ask for more pixels than exist). */
const evenDown = (n) => Math.max(2, 2 * Math.floor(n / 2));
const kb = (file) => Math.round(statSync(file).size / 1024);

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

/**
 * The shared filter chain (before any output-specific scaling). Returns
 * { graph, label, duration, w, h, alpha, fps } for use in -filter_complex.
 */
function baseChain(clip, src) {
  const start = Math.max(0, clip.trim?.start ?? 0);
  const end = Math.min(clip.trim?.end ?? src.duration, src.duration);
  let duration = end - start;
  if (!(duration > 0.2)) throw new Error(`${clip.file}: trim leaves ${duration.toFixed(2)} s of video`);
  const fps = Math.min(clip.seekable ? SEEKABLE_MAX_FPS : 60, Math.round(src.fps) || 30);
  let w = src.w;
  let h = src.h;
  // Constant frame rate (phone footage is often variable): exact loops, exact seeks.
  const steps = [`trim=start=${start}:end=${end}`, "setpts=PTS-STARTPTS", `fps=${fps}`];
  // Crop first: its fractions are measured on the master as you see it (e.g. in video:inspect).
  if (clip.crop) {
    const cw = evenDown(Math.min(1, clip.crop.w) * w);
    const ch = evenDown(Math.min(1, clip.crop.h) * h);
    const x = Math.min(w - cw, Math.max(0, Math.round(clip.crop.x * w)));
    const y = Math.min(h - ch, Math.max(0, Math.round(clip.crop.y * h)));
    steps.push(`crop=${cw}:${ch}:${x}:${y}`);
    [w, h] = [cw, ch];
  }
  if (clip.mirror) steps.push("hflip");
  if (src.hdr) {
    if (src.alpha) throw new Error(`${clip.file}: HDR with transparency isn't supported: export an SDR (Rec.709) master.`);
    // iPhone HDR (HLG/PQ, BT.2020) → SDR Rec.709, so colours match every browser and the stills.
    steps.push("zscale=t=linear:npl=100", "format=gbrpf32le", "zscale=p=bt709", "tonemap=tonemap=hable:desat=0", "zscale=t=bt709:m=bt709:r=tv");
  }
  const alpha = clip.blend === "alpha";
  if (clip.chromaKey) {
    const k = clip.chromaKey;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(k.color.replace("#", "").replace("0x", "").slice(i - 1, i + 1), 16) || 0);
    steps.push("format=yuva444p", `chromakey=${k.color}:${k.similarity}:${k.blend}`, `despill=type=${b > g && b > r ? "blue" : "green"}`);
  } else steps.push(alpha ? "format=yuva444p" : "format=yuv444p");

  let graph = `[0:v]${steps.join(",")}[b0]`;
  let label = "b0";
  const cf = clip.loopCrossfade ?? 0;
  if (clip.loop && cf > 0 && duration > cf * 3) {
    // Seamless loop: the output opens by crossfading the clip's tail into its head, then plays
    // the middle; its last frame therefore leads straight back into its first.
    graph += `;[b0]split=3[t][hd][m];[t]trim=start=${duration - cf}:end=${duration},setpts=PTS-STARTPTS[tail];[hd]trim=start=0:end=${cf},setpts=PTS-STARTPTS[head];[m]trim=start=${cf}:end=${duration - cf},setpts=PTS-STARTPTS[mid];[tail][head]xfade=transition=fade:duration=${cf}:offset=0[x];[x][mid]concat=n=2:v=1:a=0[lp]`;
    label = "lp";
    duration -= cf;
  }
  return { graph, label, duration, w, h, alpha, fps };
}

/** The phone crop: portrait, centred on the clip's focus, never narrower than minVisible allows. */
function mobileCrop(clip, w, h) {
  const portraitW = (h * 9) / 16;
  const cw = evenDown(Math.min(w, Math.max(portraitW, clip.minVisible * w)));
  const x = Math.round(Math.min(w - cw, Math.max(0, clip.focus.x * w - cw / 2)));
  return { x, y: 0, w: cw, h: evenDown(h) };
}

/** Average colour of the poster's top and bottom rows: the backdrop a banded clip fades into. */
async function edgeColours(poster) {
  const { data, info } = await sharp(poster).removeAlpha().resize(64, 36, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const row = (y) => {
    const c = [0, 0, 0];
    for (let x = 0; x < info.width; x++) for (let k = 0; k < 3; k++) c[k] += data[(y * info.width + x) * 3 + k];
    return `#${c.map((v) => Math.round(v / info.width).toString(16).padStart(2, "0")).join("")}`;
  };
  return { top: row(1), bottom: row(info.height - 2) };
}

/** Fail loudly if a "transparent" output came out fully opaque. */
async function assertTransparent(webm, file) {
  const png = path.join(SCRATCH, `${file}-alpha-check.png`);
  rmSync(png, { force: true });
  ffmpeg(["-c:v", "libvpx-vp9", "-i", webm, "-vf", "select='eq(n\\,0)'", "-frames:v", "1", png]);
  const { channels } = await sharp(png).stats();
  if (!channels[3] || channels[3].min > 250) throw new Error(`${file}: the transparent version came out opaque (is the master really transparent?)`);
}

async function buildClip(slot, clip) {
  let master = findMaster(clip.file);
  const placeholder = !master;
  if (!master) {
    await renderPlaceholders({ slots: [slot] });
    master = path.join(PLACEHOLDER_DIR, `${clip.file}.mp4`);
  }
  if (clip.chromaKey && clip.blend !== "alpha") throw new Error(`${clip.file}: chromaKey makes a transparent clip: also set blend: "alpha".`);
  const src = probe(master);
  if (src.hevcAlpha) {
    throw new Error(
      `${clip.file}: HEVC-with-alpha masters can't be decoded by ffmpeg. Export the master as ProRes 4444 (.mov) or VP9-alpha WebM instead.`,
    );
  }
  if (clip.blend === "alpha" && !src.alpha && !clip.chromaKey) {
    throw new Error(`${clip.file}: blend is "alpha" but the master has no transparency (use chromaKey for green screen).`);
  }
  // WebM alpha is only decoded by libvpx (ffmpeg's native VP8/VP9 decoder drops it).
  const input = [...(src.webmAlpha ? ["-c:v", /vp8/.test(src.codec) ? "libvpx" : "libvpx-vp9"] : []), "-i", master];
  const base = baseChain(clip, src);
  const gop = String(clip.seekable ? SEEKABLE_GOP : base.fps);
  const noBFrames = clip.seekable ? ["-bf", "0"] : [];
  const scaleDesk = `scale='min(${DESKTOP_MAX_W},trunc(iw/2)*2)':-2:flags=lanczos`;
  const tmp = path.join(SCRATCH, clip.file);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const out = (suffix) => path.join(tmp, `${clip.file}${suffix}`);
  const files = {};

  if (!base.alpha) {
    // H.264: plays everywhere with hardware decoding (the smoothest choice).
    ffmpeg([...input, "-filter_complex", `${base.graph};[${base.label}]${scaleDesk},format=yuv420p[v]`, "-map", "[v]", "-an",
      "-c:v", "libx264", "-preset", "slow", "-crf", clip.seekable ? "23" : "20", "-profile:v", "high", "-pix_fmt", "yuv420p", "-g", gop, "-keyint_min", gop, "-sc_threshold", "0", ...noBFrames,
      ...OUTPUT_COLOUR, "-movflags", "+faststart", out(".mp4")]);
    files.mp4 = `${clip.file}.mp4`;
  }
  // VP9 WebM: smaller for Chrome/Firefox/Edge; carries transparency for "alpha" clips.
  ffmpeg([...input, "-filter_complex", `${base.graph};[${base.label}]${scaleDesk},format=${base.alpha ? "yuva420p" : "yuv420p"}[v]`, "-map", "[v]", "-an",
    "-c:v", "libvpx-vp9", "-crf", base.alpha ? "30" : clip.seekable ? "36" : "32", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", "-g", gop,
    ...(base.alpha || clip.seekable ? ["-auto-alt-ref", "0"] : []), ...OUTPUT_COLOUR, out(".webm")]);
  files.webm = `${clip.file}.webm`;
  if (base.alpha) await assertTransparent(out(".webm"), clip.file);

  if (base.alpha) {
    // Safari's transparent format: HEVC with alpha (VideoToolbox, macOS only).
    if (process.platform === "darwin") {
      ffmpeg([...input, "-filter_complex", `${base.graph};[${base.label}]${scaleDesk},format=bgra[v]`, "-map", "[v]", "-an",
        "-c:v", "hevc_videotoolbox", "-alpha_quality", "0.8", "-q:v", "60", "-g", gop, "-tag:v", "hvc1", "-allow_sw", "1", "-movflags", "+faststart", out(".mov")]);
      files.mov = `${clip.file}.mov`;
    } else console.warn(`  ! ${clip.file}: HEVC-alpha (.mov for Safari) can only be built on macOS; Safari will show the still.`);
  }

  // Phone version: cropped (never below minVisible), lighter.
  const crop = mobileCrop(clip, base.w, base.h);
  let mobile = null;
  if (!base.alpha) {
    const mw = evenDown(Math.min(crop.w, MOBILE_MAX_W, (MOBILE_MAX_H * crop.w) / crop.h));
    ffmpeg([...input, "-filter_complex", `${base.graph};[${base.label}]crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=${mw}:-2:flags=lanczos,format=yuv420p[v]`, "-map", "[v]", "-an",
      "-c:v", "libx264", "-preset", "slow", "-crf", clip.seekable ? "25" : "23", "-profile:v", "high", "-pix_fmt", "yuv420p", "-g", gop, "-keyint_min", gop, "-sc_threshold", "0", ...noBFrames,
      ...OUTPUT_COLOUR, "-movflags", "+faststart", out("-mobile.mp4")]);
    const m = probe(out("-mobile.mp4"));
    mobile = { file: `${clip.file}-mobile.mp4`, width: m.w, height: m.h, crop: { x: crop.x / base.w, y: crop.y / base.h, w: crop.w / base.w, h: crop.h / base.h } };
  }

  // Poster: the chosen frame, picked by position in the processed clip, or the very last frame.
  const png = path.join(tmp, `${clip.file}-poster.png`);
  const posterFilter = clip.poster === "last" ? "" : `,select='gte(t\\,${Math.max(0, clip.poster)})'`;
  ffmpeg([...input, "-filter_complex", `${base.graph};[${base.label}]${scaleDesk}${posterFilter},format=${base.alpha ? "rgba" : "rgb24"}[v]`, "-map", "[v]",
    ...(clip.poster === "last" ? ["-update", "1"] : ["-frames:v", "1"]), png]);
  if (!existsSync(png)) throw new Error(`${clip.file}: no poster frame at ${clip.poster} (the processed clip is ${base.duration.toFixed(2)} s)`);
  await sharp(png).webp({ quality: 84, alphaQuality: 90 }).toFile(out("-poster.webp"));
  const backdrop = base.alpha ? null : await edgeColours(png);
  rmSync(png, { force: true });

  const main = probe(files.mp4 ? out(".mp4") : out(".webm"));
  const produced = [...Object.values(files), mobile?.file, `${clip.file}-poster.webp`].filter(Boolean);
  for (const f of produced) if (!existsSync(path.join(tmp, f))) throw new Error(`${clip.file}: missing output ${f}`);

  // Everything built and checked: swap it in (and drop outputs this build no longer makes).
  mkdirSync(OUT, { recursive: true });
  for (const suffix of SUFFIXES) {
    const name = `${clip.file}${suffix}`;
    if (produced.includes(name)) renameSync(path.join(tmp, name), path.join(OUT, name));
    else rmSync(path.join(OUT, name), { force: true });
  }
  rmSync(tmp, { recursive: true, force: true });

  const entry = {
    placeholder,
    source: path.relative(ROOT, master),
    width: main.w,
    height: main.h,
    duration: +main.duration.toFixed(3),
    fps: base.fps,
    alpha: base.alpha,
    files,
    mobile,
    poster: { file: `${clip.file}-poster.webp`, at: clip.poster === "last" ? +base.duration.toFixed(3) : clip.poster },
    backdrop,
    kb: Object.fromEntries(produced.map((f) => [f, kb(path.join(OUT, f))])),
  };
  const desktopKb = entry.kb[files.mp4 ?? files.webm] ?? 0;
  const mobileKb = mobile ? (entry.kb[mobile.file] ?? 0) : desktopKb;
  console.log(
    `${slot.padEnd(8)} ${placeholder ? "PLACEHOLDER" : "final     "} ${entry.width}x${entry.height} ${entry.duration}s ${base.fps}fps${clip.seekable ? " seekable" : ""}  ` +
      Object.entries(entry.kb).map(([f, s]) => `${f.replace(clip.file, "")}:${s}KB`).join(" "),
  );
  if (desktopKb > BUDGET_KB.desktop || mobileKb > BUDGET_KB.mobile) {
    console.warn(
      `  ! ${clip.file} is heavy (${desktopKb} KB desktop, ${mobileKb} KB phone; budget ${BUDGET_KB.desktop}/${BUDGET_KB.mobile} KB). ` +
        "Everything downloads before the intro can scroll: trim it shorter, or lower its resolution.",
    );
  }
  return entry;
}

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
for (const [slot, clip] of Object.entries(introClips)) {
  if (only && !only.includes(slot)) continue;
  manifest[slot] = await buildClip(slot, clip);
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`); // after every clip: always matches public/
}
console.log(`\nManifest: ${path.relative(ROOT, MANIFEST)}`);
