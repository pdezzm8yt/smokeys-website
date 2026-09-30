/**
 * Shared helpers for the intro video scripts (build, placeholders, inspect).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CACHE = path.join(ROOT, ".cache/intro-video");

/**
 * The ffmpeg binary: $FFMPEG_PATH, or the optional `ffmpeg-static` package
 * (an optional dependency, so a failed download never breaks `npm install`
 * or a deploy; only these local scripts need it).
 */
export async function findFfmpeg() {
  if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  try {
    const mod = await import("ffmpeg-static");
    if (mod.default && existsSync(mod.default)) return mod.default;
  } catch {
    /* not installed */
  }
  console.error("ffmpeg not found. Run `npm install` (it installs ffmpeg-static), or set FFMPEG_PATH to an ffmpeg binary.");
  process.exit(1);
}

export const FFMPEG = await findFfmpeg();

/** Run ffmpeg; throws with its error output if it fails. */
export function ffmpeg(args) {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${r.status}):\n${r.stderr}`);
  return r.stderr;
}

/** ffmpeg's banner for a file (it exits non-zero for `-i` alone: that's expected). */
export function banner(file) {
  return spawnSync(FFMPEG, ["-hide_banner", "-i", file], { encoding: "utf8" }).stderr ?? "";
}

/**
 * What the build needs to know about a master: size (rotation applied), frame
 * rate, duration (from its frames, not the container's rounded figure),
 * transfer (HDR?), alpha and whether libvpx must decode it (WebM alpha).
 */
export function probe(file) {
  const info = banner(file);
  const vLine = info.match(/Stream #\d+:\d+[^:]*: Video: (.*)/)?.[1] ?? "";
  const size = vLine.match(/, (\d{2,5})x(\d{2,5})/);
  let [w, h] = [Number(size?.[1] ?? 0), Number(size?.[2] ?? 0)];
  if (/rotation of -?90/.test(info)) [w, h] = [h, w];
  const fps = Number(vLine.match(/([\d.]+) fps/)?.[1] ?? vLine.match(/([\d.]+) tbr/)?.[1] ?? 30);
  const codec = vLine.match(/^(\w+)/)?.[1] ?? "?";
  const pixFmt = vLine.match(/^\w+[^,]*, (\w+)/)?.[1] ?? "";
  const hdr = /arib-std-b67|smpte2084/.test(vLine);
  const webmAlpha = /alpha_mode\s*:\s*1/.test(info);
  const containerDuration = (info.match(/Duration: ([\d:.]+)/)?.[1] ?? "0").split(":").reduce((a, v) => a * 60 + Number(v), 0);
  const counted = spawnSync(FFMPEG, ["-hide_banner", "-i", file, "-map", "0:v:0", "-c", "copy", "-f", "null", "-"], { encoding: "utf8" }).stderr ?? "";
  const frames = Number([...counted.matchAll(/frame=\s*(\d+)/g)].at(-1)?.[1] ?? 0);
  const duration = frames && fps ? Math.min(containerDuration || Infinity, frames / fps) : containerDuration;
  const alphaPixFmt = /^(yuva|rgba|bgra|argb|abgr|gbrap|ya\d)/.test(pixFmt);
  const hevcAlpha = /hevc/.test(codec) && process.platform === "darwin" ? avfoundationAlpha(file) : false;
  return { w, h, fps, frames, duration, codec, pixFmt, hdr, alpha: alphaPixFmt || webmAlpha || hevcAlpha, webmAlpha, hevcAlpha };
}

/** macOS: does an HEVC track carry Apple's alpha layer? (ffmpeg can't see or decode it.) */
export function avfoundationAlpha(file) {
  mkdirSync(CACHE, { recursive: true });
  const swift = path.join(CACHE, "has-alpha.swift");
  const bin = path.join(CACHE, "has-alpha");
  if (!existsSync(bin)) {
    writeFileSync(
      swift,
      `import AVFoundation
let asset = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[1]))
let sem = DispatchSemaphore(value: 0)
var alpha = false
Task {
  for t in (try? await asset.loadTracks(withMediaType: .video)) ?? [] {
    for fd in (try? await t.load(.formatDescriptions)) ?? [] {
      if let ext = CMFormatDescriptionGetExtensions(fd) as? [String: Any], (ext["ContainsAlphaChannel"] as? Bool) == true { alpha = true }
    }
  }
  sem.signal()
}
sem.wait()
print(alpha ? "1" : "0")
`,
    );
    try {
      execFileSync("swiftc", ["-O", swift, "-o", bin], { stdio: "ignore" });
    } catch {
      return false; // no Xcode tools: can't tell
    }
  }
  try {
    return execFileSync(bin, [file], { encoding: "utf8" }).trim() === "1";
  } catch {
    return false;
  }
}
