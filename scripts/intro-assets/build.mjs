#!/usr/bin/env node
/**
 * Builds the bus photos ("Meet the bus", via src/content/assets.ts) from the
 * owner's source images. The intro film has its own pipeline (npm run video:build).
 *
 *   npm run assets:intro      (or: node scripts/intro-assets/build.mjs)
 *
 * Inputs  (assets/intro-source/): the owner's original, untouched files.
 * Outputs (src/assets/intro/):    the exterior cutout and the interior photo,
 *                                 imported by components (Next.js hashes +
 *                                 optimizes them).
 *
 * Re-run after replacing any source file (e.g. higher-resolution versions).
 * The exterior cutout uses Apple's Vision framework, so this script needs
 * macOS 14+ with the Xcode command line tools (swiftc).
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
  const cutout = path.join(CACHE, `${path.parse(uprightFile).name.replace(".upright", "")}-cutout.png`);
  execFileSync(LIFT, [uprightFile, cutout], { stdio: "inherit" });
  return cutout;
}

const report = [];
async function save(pipeline, name, note) {
  const file = path.join(OUT, name);
  const info = await pipeline.toFile(file);
  report.push({ file: path.relative(ROOT, file), size: `${info.width}x${info.height}`, kb: Math.round(info.size / 1024), note });
}

// ---------------------------------------------------------------------------
// Exterior: black party bus. Source is 560px wide, so a 2x Lanczos version is
// prepared for high-density screens (no new detail, just cleaner scaling).
// ---------------------------------------------------------------------------
{
  const src = await upright("bus-exterior.png");
  const trimmed = await sharp(lift(src)).trim({ threshold: 1 }).toBuffer();
  const { width } = await sharp(trimmed).metadata();
  await save(
    sharp(trimmed).resize({ width: width * 2, kernel: "lanczos3" }).sharpen({ sigma: 0.7 }).webp({ quality: 92, alphaQuality: 100, effort: 6 }),
    "bus-exterior.webp",
    "Vision cutout (street removed), trimmed, 2x Lanczos from 560px source",
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

console.table(report);
