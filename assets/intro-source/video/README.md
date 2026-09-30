# Intro video masters

Put the intro's final footage here. Masters stay on your machine (they're
git-ignored: big files, and the repo is public). Only the web versions built
from them are committed, in `public/video/intro/`.

| Scene | Master file name | What it should be |
|---|---|---|
| 1 | `real-roadrunner.<ext>` | Real roadrunner running side-on, 3–6 s, loops (the intro loops it until the visitor scrolls on) |
| 2 | `cartoon-roadrunner.<ext>` | Cartoon roadrunner running through the desert, 3–6 s, loops. Or the runner alone on transparent / green: set `blend: "alpha"` (or `chromaKey`) and it runs over the built-in parallax desert |
| — | `dust-transition.<ext>` | A dust burst that builds to FULL cover, then thins out, 3–5 s, on **black** (or transparent). It follows the scroll frame by frame |
| 3 | `party-bus.<ext>` | The black party bus driving in and coming to rest, 3–6 s, ending at rest. It follows the scroll (reversible) and has stopped when SMOKEY'S appears |

`<ext>`: `mov`, `mp4`, `m4v`, `webm` or `mkv`. Any codec ffmpeg reads (ProRes, H.264, HEVC…).
Transparent masters: ProRes 4444 `.mov` or VP9-alpha `.webm` (Apple's HEVC-with-alpha
can't be decoded by ffmpeg: re-export it). Green or blue screen: set `chromaKey`
together with `blend: "alpha"`. iPhone HDR footage is converted to standard
(Rec.709) colour automatically; variable frame rates are made constant.

**Best results:** landscape, 1920×1080 or larger (4K is fine), 30–60 fps, no
text or watermarks, every clip running the same way (left → right; `mirror`
can flip one), subjects on a similar ground line. Keep clips short: every clip
is downloaded completely before the intro can be scrolled, and the build warns
above ~4.5 MB (desktop) / ~1.5 MB (phone) per clip. The dust and bus are
scrubbed with the scroll, so they're encoded at ≤30 fps for instant seeking.

## Steps

1. Drop the master here with the name above.
2. Check it: `npm run video:inspect -- assets/intro-source/video/party-bus.mov`
   (resolution, duration, frame rate, transparency, background, cuts, a contact
   sheet in `.cache/intro-video/`).
3. Tune its entry in `src/content/intro-video.ts`: `trim`, `crop` (measured on
   the master as you see it, applied before `mirror`), `mirror`,
   `focus` (what to keep in view on other screen shapes), `minVisible`,
   `subject` (where it stands: this lines the scenes up), `poster`, and for
   the dust `introClipTiming.dustPeakAt` (the second it covers the most).
4. `npm run video:build` (or `-- --only=bus`): writes every web version to
   `public/video/intro/`, updates `src/content/intro-video.generated.json`
   and marks that clip as final (its "placeholder" label disappears).

Until a master exists, the build uses a generated, clearly labelled
placeholder (`npm run video:placeholders` renders them from the images in
`src/assets/intro`).
