# Smokey's: architecture brief

**Archetype:** marketing site + lead capture. Static pages, one signature interactive intro, quote requests stored in Supabase and emailed via Resend (phase 2).

| Decision | Choice |
|---|---|
| Framework | Next.js 16.3 App Router, static rendering; bump to 16.3.8 security release when published |
| Styling / motion | Tailwind 4 tokens; GSAP 3 for the intro (loaded on demand); Motion 13 for interactive widgets |
| Content | Typed TS files in `src/content` (CMS later if needed) |
| Backend (phase 2) | Supabase Postgres `quote_requests` (RLS on, no public policies, server-only writes) + Resend |
| Auth | None in v1 |
| Hosting | Vercel with per-PR previews (previews noindex via `robots.ts`) |

## Intro
One pinned stage, three stacked scene layers, one continuous GSAP master timeline with overlapping phases (not scroll-scrubbed), built from the owner's own images. A single "world speed" value drives every loop, so the whole world accelerates together.
1. Real roadrunner: Vision cutout, mirrored to run left → right, stride bob; behind it two subject-free, motion-blurred loop plates made from the same photo (panning-shot look, parallax).
2. Click/tap: the world surges and both birds lunge together while the real world dissolves into the cartoon one (the cartoon is fully visible before the real bird has gone), then the cartoon roadrunner runs through a 4-layer parallax cartoon desert, accelerating, with speed trails and dust kicked from his feet.
3. While he is still running, the dust grows into a cloud (sprite puffs driven by one animated CSS var) that swallows him; under full cover the scene swaps to the night desert with the bus already in place; the dust clears on the black party bus standing where the roadrunner was, rolling slightly forward; headlight flares on the real lamps, light pool, masked sheen, then headline, then CTAs.
Reduced motion = crossfades, no loops. Phones get fewer dust particles and puffs (CSS). No blur filters anywhere: motion smear comes from ghost-image trails.

## Routes (planned)
`/` (done) · `/about` · `/party-bus` · `/packages` · `/events` + `/events/[slug]` · `/gallery` · `/book` · `/contact` · `/faq` · `/privacy` · `/terms`

## Phases
0 Foundations ✅ · 1 Homepage + signature intro ✅ (placeholders) · 2 Booking backend · 3 Core pages · 4 SEO/a11y/perf + Playwright · 5 Real assets + launch

## Budgets
Mobile p75: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.
Initial JS measured 2026-09-30: ~242 KB gzip (React + Next runtime ≈ 150 KB, Motion + app ≈ 90 KB); GSAP + the intro engine (~30 KB gzip) are a separate chunk loaded in parallel with the intro preload, never for returning visitors until Replay. The original 100 KB target is below the Next.js 16 baseline; revised target ≤ 200 KB, work item for phase 4 (e.g. `motion/react-mini` for the intro, split below-fold widgets). LCP element is the intro wordmark/text, so the static HTML paints before JS.

## Assets needed from owner
Licensed realistic roadrunner video/photo (landscape + portrait) · final mascot art (SVG/Lottie) · bus photos lights-off AND lights-on from the same tripod position · interior photos/video · logo SVG · brand colors/fonts · real specs, packages, contact details, service area, FAQ answers.

## Deployment (pre-launch lockdown)
Vercel project `smokey6/smokeys-website`, connected to GitHub `pdezzm8yt/smokeys-website`; production branch `main`.
On the Hobby plan, Deployment Protection covers every URL except the production domain, so until launch:
- `vercel.json` sets `git.deploymentEnabled.main = false`: pushes to `main` create no deployment. Every other branch gets a protected preview (sign-in required).
- The production alias `smokeys-website-omega.vercel.app` was removed (the project domain entry is kept, so the name stays reserved).
- `SITE_INDEXABLE` is unset: robots.txt disallows, pages and responses are `noindex`.

To launch: delete the `git` block from `vercel.json`, set `SITE_INDEXABLE=true` for Production, attach the real custom domain, merge to `main`.

