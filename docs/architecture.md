# Smokey's: architecture brief

**Archetype:** marketing site + lead capture. Static pages, one signature interactive intro, quote requests stored in Supabase and emailed via Resend (phase 2).

| Decision | Choice |
|---|---|
| Framework | Next.js 16.3 App Router, static rendering; bump to 16.3.8 security release when published |
| Styling / motion | Tailwind 4 tokens; Motion 13 only for intro + interactive widgets |
| Content | Typed TS files in `src/content` (CMS later if needed) |
| Backend (phase 2) | Supabase Postgres `quote_requests` (RLS on, no public policies, server-only writes) + Resend |
| Auth | None in v1 |
| Hosting | Vercel with per-PR previews (previews noindex via `robots.ts`) |

## Intro
One pinned stage, three stacked scene layers, fixed-length Motion timelines per transition (not scroll-scrubbed), built from the owner's own images.
1. Real roadrunner: Vision cutout, mirrored to run left → right, stride bob; behind it two subject-free, motion-blurred loop plates made from the same photo (panning-shot look, parallax).
2. Click/tap: the bird accelerates, the camera whips, a speed flash hides the swap to the cartoon roadrunner on the same anchor, running through a 4-layer parallax cartoon desert.
3. After a beat: dust explodes out of the anchor (sprite puffs driven by one animated CSS var), covers the frame, the scene swaps to the night desert under cover, dust clears on the black party bus standing where the roadrunner was; headlight flares on the real lamps, light pool, masked sheen, then headline + CTAs.
Reduced motion = crossfades, no loops. Lite mode (phones / coarse pointer / Save-Data) drops live blur and half the dust puffs.

## Routes (planned)
`/` (done) · `/about` · `/party-bus` · `/packages` · `/events` + `/events/[slug]` · `/gallery` · `/book` · `/contact` · `/faq` · `/privacy` · `/terms`

## Phases
0 Foundations ✅ · 1 Homepage + signature intro ✅ (placeholders) · 2 Booking backend · 3 Core pages · 4 SEO/a11y/perf + Playwright · 5 Real assets + launch

## Budgets
Mobile p75: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.
Initial JS measured 2026-09-30: ~239 KB gzip (React + Next runtime ≈ 150 KB, Motion + app ≈ 90 KB). The original 100 KB target is below the Next.js 16 baseline; revised target ≤ 200 KB, work item for phase 4 (e.g. `motion/react-mini` for the intro, split below-fold widgets). LCP element is the intro wordmark/text, so the static HTML paints before JS.

## Assets needed from owner
Licensed realistic roadrunner video/photo (landscape + portrait) · final mascot art (SVG/Lottie) · bus photos lights-off AND lights-on from the same tripod position · interior photos/video · logo SVG · brand colors/fonts · real specs, packages, contact details, service area, FAQ answers.

## Deployment (pre-launch lockdown)
Vercel project `smokey6/smokeys-website`, connected to GitHub `pdezzm8yt/smokeys-website`; production branch `main`.
On the Hobby plan, Deployment Protection covers every URL except the production domain, so until launch:
- `vercel.json` sets `git.deploymentEnabled.main = false`: pushes to `main` create no deployment. Every other branch gets a protected preview (sign-in required).
- The production alias `smokeys-website-omega.vercel.app` was removed (the project domain entry is kept, so the name stays reserved).
- `SITE_INDEXABLE` is unset: robots.txt disallows, pages and responses are `noindex`.

To launch: delete the `git` block from `vercel.json`, set `SITE_INDEXABLE=true` for Production, attach the real custom domain, merge to `main`.

