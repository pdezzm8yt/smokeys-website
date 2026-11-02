#!/usr/bin/env node
/**
 * Names the intro film's web files after their content:
 *   <name>.<ext> → <name>.<hash>.<ext>   (the first 10 hex of the file's sha256)
 * so new footage always gets new URLs, and next.config.ts can serve these
 * names as immutable (browsers keep them for good: no revalidation per visit).
 *
 *   npm run video:hash      (renames what's already built: nothing is re-encoded)
 *
 * The build runs the same step after every cut. Safe to stop at any point:
 * each hashed file is complete before it gets its name, the manifest moves to
 * the new names next, and only then are the files it no longer names removed.
 * Running it again is a no-op.
 */
import { createHash } from "node:crypto";
import { copyFileSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { introFilm } from "../../src/content/intro-video.ts";

// Not lib.mjs's ROOT: importing lib.mjs needs ffmpeg, and renaming doesn't.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const OUT = path.join(ROOT, "public/video/intro");
export const MANIFEST = path.join(ROOT, "src/content/intro-video.generated.json");

/** An earlier hash in a name: a dot and 10 hex just before the extension (the shape next.config.ts matches). */
const HASH = /\.[0-9a-f]{10}(?=\.\w+$)/;

/** Every web file a cut's manifest entry names. */
const filesOf = (entry) => [...Object.values(entry.files), ...Object.values(entry.stills), ...Object.values(entry.glows)];

/** film-portrait-small.mp4 (or an older hash of it) → film-portrait-small.<hash of its bytes>.mp4 */
function hashedName(name) {
  const hash = createHash("sha256").update(readFileSync(path.join(OUT, name))).digest("hex").slice(0, 10);
  const plain = name.replace(HASH, "");
  const ext = path.extname(plain);
  return `${plain.slice(0, -ext.length)}.${hash}${ext}`;
}

/**
 * Give every built cut's files their hashed names, record them in the
 * manifest, then remove the cut's files it no longer names (older builds,
 * unhashed names, leftovers). Takes the build's manifest, or reads the
 * committed one.
 */
export function hashFiles(manifest = JSON.parse(readFileSync(MANIFEST, "utf8"))) {
  const built = Object.keys(introFilm.cuts).filter((name) => manifest[name]);
  for (const name of built) {
    const entry = manifest[name];
    const renamed = new Map(filesOf(entry).map((f) => [f, hashedName(f)]));
    for (const [from, to] of renamed) {
      if (from === to) continue;
      // Copied, not moved (the manifest names the old file until it's rewritten); named only once complete.
      copyFileSync(path.join(OUT, from), path.join(OUT, `${to}.partial`));
      renameSync(path.join(OUT, `${to}.partial`), path.join(OUT, to));
      console.log(`  ${from} → ${to}`);
    }
    const rename = (group) => Object.fromEntries(Object.entries(group).map(([k, f]) => [k, renamed.get(f)]));
    Object.assign(entry, { files: rename(entry.files), stills: rename(entry.stills), glows: rename(entry.glows) });
    entry.kb = Object.fromEntries(filesOf(entry).map((f) => [f, Math.round(statSync(path.join(OUT, f)).size / 1024)]));
  }
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  // Only now that the manifest has moved on: drop what it no longer names.
  const keep = new Set(built.flatMap((name) => filesOf(manifest[name])));
  for (const name of built) {
    const { file } = introFilm.cuts[name];
    for (const f of readdirSync(OUT)) if ((f.startsWith(`${file}.`) || f.startsWith(`${file}-`)) && !keep.has(f)) rmSync(path.join(OUT, f));
  }
  return manifest;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  hashFiles();
  console.log(`Manifest: ${path.relative(ROOT, MANIFEST)}`);
}
