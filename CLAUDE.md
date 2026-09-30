@AGENTS.md

# Smokey's Party Bus website

Marketing site + lead capture for Smokey's, a black party bus brand. Plan and decisions: `docs/architecture.md`.

## Stack
Next.js 16.3 (App Router, all routes static) · React 19.3 · TypeScript 6 strict (typescript-eslint caps TS < 6.1) · Tailwind 4 (tokens in `src/app/globals.css`) · Motion 13 for normal UI (`motion/react`, `m` components under `LazyMotion` in `src/components/providers.tsx`) · GSAP 3 for the intro only.

## Local tooling
Node 24 lives at `~/.local/node/bin` (not on the default PATH). Prefix commands:
`export PATH=~/.local/node/bin:$PATH` then `npm run dev | build | lint | typecheck`.

## Conventions
- Content lives in `src/content/*.ts`. Anything unconfirmed has `sample: true` / `placeholder: true` and renders a visible `<SampleTag>`. Never present placeholder art or specs as the real bus.
- All media goes through `src/content/assets.ts` slots; `src: null` renders the illustrated placeholder.
- The intro's cartoon placeholder is rendered from the owner-supplied cartoon roadrunner image (a Warner Bros. character, owner's decision). Final cartoon footage must be licensed or an original character before public launch. Never add more Warner Bros. material (name, sounds, other artwork) on our own initiative, and never use third-party footage (e.g. TikTok downloads) in the deployed site: the owner provides licensed or own footage.
- Server Components by default; `"use client"` only on interactive leaves. Intro scenes are server-rendered slots passed into the client `IntroSequence`.
- Motion values come from `src/lib/motion.ts` (mirrors CSS tokens). Honour reduced motion: `MotionConfig reducedMotion="user"`; the intro engine has its own stills-only timeline.
- Nav links are homepage anchors until each page gets its own route (`src/content/site.ts`).

## Intro sequence (src/components/intro)
A scroll-driven film in one pinned stage: real roadrunner running → (scroll) cartoon roadrunner running through the desert → dust builds and swallows him → the black party bus drives out of the dust → SMOKEY'S → CTAs → the stage unpins and the page continues. Scrolling back up plays it in reverse.
- VIDEO clips provide the movement (`src/content/intro-video.ts`: the one place for each clip's processing and framing, merged with the build's `intro-video.generated.json` in `intro-clips.ts`). Web files live in `public/video/intro/` and are BUILT, never hand-made: masters in `assets/intro-source/video/` (git-ignored; see its README) → `npm run video:build`. Until a master exists, clearly labelled placeholders rendered from the owner's images stand in (`npm run video:placeholders`), and the UI shows a "Placeholder footage" tag.
- `intro-engine.ts`: ONE GSAP master timeline, scrubbed by ScrollTrigger over a tall section (`.intro-scroll`, `INTRO.scroll.screens` screen-heights) whose stage is pinned with CSS sticky. Beats overlap on purpose. Timeline units = scroll, not seconds (`intro-config.ts`). The running clips loop and never stop (playback rate follows world speed + scroll speed); the dust and bus clips are scrubbed frame-accurately with the scroll (`seekable`: encoded at ≤30 fps with a keyframe every 4 frames), so the bus drives out of the dust as you scroll, reversibly, and is at rest when the branding lands. All clip/scene/header state is derived in one idempotent `sync()` from the playhead, so any scroll jump in either direction lands right; sync() ignores ScrollTrigger's revert during a refresh and re-runs after it. Autoplay blocked (iOS Low Power Mode…): the running clips show their stills until the first tap/key press; scrubbed clips keep working (seeking needs no gesture).
- Scrubbed-timeline rules: every tween is a fromTo with explicit start AND end, later tweens use `immediateRender: false`, and each element's CSS resting state equals its first tween's start (ScrollTrigger reverts the timeline when it re-measures). Camera poses are function-based (re-measured on refresh). Never call ScrollTrigger.refresh() while the page is scrolling (it restores the scroll position it measured at).
- `intro-media.ts`: picks each clip's file for the device (phone crop, H.264 first, VP9/HEVC-alpha for transparent clips), downloads it COMPLETELY to a blob URL and primes its decoder before the scroll unlocks (no stalls, black frames or late pop-ins). `intro-sequence.tsx`: life cycle only (branded loader, scroll held at the top until the footage is in memory, Skip), zero React renders while scrolling.
- Framing: each clip sits in a `.intro-clip` box (globals.css) with its own aspect ratio: covers the frame (the small viewport; the stage itself is 100lvh so the film fills a phone once its toolbar hides) like object-fit cover, never cropping more than `1 − minVisible` of its width or 30% of its height; past that it becomes a feathered band (`data-banded` y/x). Never stretch footage. Subjects are lined up across scenes by camera transforms computed from each clip's `subject` (feet point + height).
- 60fps rules: transforms and opacity only; nothing created mid-scroll (loops prepared up front, emitters outside the gsap.context); check with `npm run perf:intro -- --gpu --frames` and `npm run test:intro` against a production build (Playwright's Chromium picks the WebM files; it has no H.264).
- Accessibility: reduced motion or Save-Data = the same story as crossfaded stills on a shorter scroll, no clips downloaded. The H1 stays in the accessibility tree throughout (opacity only); the CTAs are invisible (out of the Tab order) until they appear. Skip jumps to the end and focuses the headline. No JavaScript (or the engine fails): the finished hero, no scroll story.

## Intro assets pipeline
Owner originals live untouched in `assets/intro-source/`. `node scripts/intro-assets/build.mjs` (macOS 14+, needs `swiftc`) regenerates everything in `src/assets/intro/`: Apple Vision subject cutouts, the subject-free motion-blurred loop plates, 2x Lanczos versions of the low-res sources, the interior photo and the dust sprites. Replace a source file and re-run; never hand-edit generated files. If a replacement photo changes framing, re-measure `assets.intro.bus.headlights` and the hotspot positions in `src/content/bus.ts`.
