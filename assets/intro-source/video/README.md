# Intro film masters

Put the intro film's masters here. Masters stay on your machine (they're
git-ignored: big files, and the repo is public). Only the web versions built
from them are committed, in `public/video/intro/`.

The intro is ONE continuous shot, scrubbed by the scroll: the roadrunner runs
into a tunnel, the dust swallows him, the black party bus drives out of it and
comes into full view. It comes in two cuts of the same story:

| Cut | Master file name | Used on |
|---|---|---|
| portrait | `film-portrait.<ext>` | Phones and other tall screens. 9:16, 1080×1920 or larger |
| wide | `film-wide.<ext>` | Desktops, tablets on their side, phones in landscape. 16:9, 1920×1080 or larger |

Each screen gets the cut closest to its shape. While a cut has no master, the
other one stands in (a desktop then shows the portrait film as a strip in the
middle, over a soft glow of the same scene).

`<ext>`: `mov`, `mp4`, `m4v`, `webm` or `mkv`. Any codec ffmpeg reads (ProRes,
H.264, HEVC…). iPhone HDR footage is converted to standard (Rec.709) colour
automatically; variable frame rates are made constant. Audio is dropped.

**Best results:** the same story beats in both cuts; the bus is Smokey's own
(make it from photos of the real bus); about 10–14 s up to the moment the bus
is fully in view (the build trims everything after that); 24–30 fps; no text
or watermarks. The film downloads completely before the intro can be
scrolled, and the build warns above ~7 MB (desktop) / ~3.5 MB (phones).

## Steps

1. Drop the master here with the name above.
2. Check it: `npm run video:inspect -- assets/intro-source/video/film-wide.mp4`
   (resolution, duration, frame rate, cuts, black or frozen stretches, and a
   contact sheet in `.cache/intro-video/`).
3. Set that cut's entry in `src/content/intro-video.ts`, read off the contact
   sheet (seconds into the film):
   - `beats.tunnel`: he runs into the tunnel;
   - `beats.swallowed`: the dust has swallowed him (nothing of him left);
   - `beats.cover`: the thickest dust, nothing visible at all;
   - `beats.headlights`: the bus's headlights cut through;
   - `beats.rest`: the bus fully in view: the film stops here, under the
     headline and the buttons (pick a frame with the top third fairly calm);
   - `trim.end`: just after `rest`; `crop` / `mirror` / `focus` / `minVisible`
     if needed.
4. `npm run video:build` (or `-- --only=wide`): writes the web versions to
   `public/video/intro/` and updates `src/content/intro-video.generated.json`.
5. Once a cut shows Smokey's real bus, set `introFilm.placeholder` to `false`
   (the "Placeholder footage" tag goes away).
