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
- Scene 2 currently uses the owner-supplied cartoon roadrunner image (a Warner Bros. character, owner's decision, see `launchNote` in `src/content/assets.ts`). It must be licensed or swapped before public launch: setting `assets.intro.cartoon.src` to `null` falls back to Smokey's original mascot (`src/components/intro/mascot.tsx`). Never add more Warner Bros. material (name, sounds, other artwork) on our own initiative.
- Server Components by default; `"use client"` only on interactive leaves. Intro scenes are server-rendered slots passed into the client `IntroSequence`.
- Motion values come from `src/lib/motion.ts` (mirrors CSS tokens). Honour reduced motion: `MotionConfig reducedMotion="user"`; the intro engine has its own crossfade-only timeline.
- Nav links are homepage anchors until each page gets its own route (`src/content/site.ts`).

## Intro sequence (src/components/intro)
Real roadrunner (photo cutout over looping motion-blurred plates) → click/tap → cartoon roadrunner in a parallax SVG desert → auto dust explosion → black party bus revealed on the same anchor point.
- One continuous GSAP master timeline (`intro-engine.ts`, GSAP 3). Phases overlap on purpose: the cartoon fades in before the real bird is gone, dust forms while he runs, the bus is in place behind the dust before it clears. One `world.speed` value drives every loop (parallax, stride, speed lines, dust emission, speed trails) and only ever rises. The engine and GSAP are loaded on demand (dynamic import), never on the hydration path. Motion stays for normal UI only; never animate the intro with it.
- `intro-config.ts`: timing, world-speed and loop tunables. Layout tunables (shared anchor, subject widths, portrait and short-landscape variants, the bus-fits-under-the-headline formula) are CSS custom properties on `.intro-stage` in `src/app/globals.css`. `intro-engine.ts` targets `data-scene`, `data-camera`, `data-subject`, `data-bob`, `data-trail`, `data-loop`, `data-streak`, `data-particle`, `data-caption`, `data-dust`, `data-fx`, `data-intro-*`, `data-bus-*` hooks. `intro-sequence.tsx`: life cycle only (two-stage preload + branded loader, skip/replay, scroll lock, focus), zero React renders while the shot plays; `use-intro-input.ts`: wheel/keys/swipe/anchor-link handling.
- 60fps rules: animate transforms and opacity only (no filters, no layout properties); build tweens while scene 1 idles, never mid-shot; per-frame writers (dust puffs, trails) stay outside the gsap.context and are cleared in `destroy()`. Check with `npm run perf:intro -- --gpu --frames` against a production build.
- All subjects stand on one shared anchor (`AnchoredSubject`); widths come from the CSS vars, heights from each image's aspect ratio. Never set a height or stretch an image.
- Accessibility contract: only the hero CTA row is `inert` during the intro (the H1 stays readable); focus parks on the stage while a transition runs and lands on `#intro-title` after a user-triggered reveal.
- Page scroll is locked (`html[data-scroll-lock]`) only while it plays. `html[data-intro="seen"]` (set pre-paint in `app/layout.tsx`) skips it for the rest of the tab session, for deep links and for restored scroll positions; the boot script also falls back to it if the intro JS hasn't taken over the loader within 12 s.

## Intro assets pipeline
Owner originals live untouched in `assets/intro-source/`. `node scripts/intro-assets/build.mjs` (macOS 14+, needs `swiftc`) regenerates everything in `src/assets/intro/`: Apple Vision subject cutouts, the subject-free motion-blurred loop plates, 2x Lanczos versions of the low-res sources, the interior photo and the dust sprites. Replace a source file and re-run; never hand-edit generated files. If a replacement photo changes framing, re-measure `assets.intro.bus.headlights` and the hotspot positions in `src/content/bus.ts`.
