@AGENTS.md

# Smokey's Party Bus website

Marketing site + lead capture for Smokey's, a black party bus brand. Plan and decisions: `docs/architecture.md`.

## Stack
Next.js 16.3 (App Router, all routes static) · React 19.3 · TypeScript 6 strict (typescript-eslint caps TS < 6.1) · Tailwind 4 (tokens in `src/app/globals.css`) · Motion 13 (`motion/react`, `m` components under `LazyMotion` in `src/components/providers.tsx`).

## Local tooling
Node 24 lives at `~/.local/node/bin` (not on the default PATH). Prefix commands:
`export PATH=~/.local/node/bin:$PATH` then `npm run dev | build | lint | typecheck`.

## Conventions
- Content lives in `src/content/*.ts`. Anything unconfirmed has `sample: true` / `placeholder: true` and renders a visible `<SampleTag>`. Never present placeholder art or specs as the real bus.
- All media goes through `src/content/assets.ts` slots; `src: null` renders the illustrated placeholder.
- The Scene 2 mascot is Smokey's ORIGINAL character. Never add Warner Bros. Road Runner likeness, name or sounds without a license.
- Server Components by default; `"use client"` only on interactive leaves. Intro scenes are server-rendered slots passed into the client `IntroSequence`.
- Motion values come from `src/lib/motion.ts` (mirrors CSS tokens). Honour reduced motion: `MotionConfig reducedMotion="user"` + explicit checks in the intro.
- Nav links are homepage anchors until each page gets its own route (`src/content/site.ts`).

## Intro sequence (src/components/intro)
State machine `real → cartoon → bus`. Advance = click/tap/wheel/swipe-up/Space/Enter/↓. Timelines use `useAnimate` sequences targeting `data-scene`, `data-fx`, `data-mascot`, `data-bus-*` hooks. Page scroll is locked (`html[data-scroll-lock]`) only while it plays. `html[data-intro="seen"]` (set pre-paint in `app/layout.tsx`) skips it for the rest of the tab session and for deep links.
