# Smokey's: architecture brief

**Archetype:** marketing site + lead capture. Static pages, one signature interactive intro, quote requests stored in Supabase and emailed via Resend (phase 2).

| Decision | Choice |
|---|---|
| Framework | Next.js 16.3 App Router, static rendering; bump to 16.3.8 security release when published |
| Styling / motion | Tailwind 4 tokens; GSAP 3 + ScrollTrigger for the scroll-driven intro (loaded on demand); Motion 13 for interactive widgets |
| Content | Typed TS files in `src/content` (CMS later if needed) |
| Backend (phase 2) | Supabase Postgres `quote_requests` (RLS on, no public policies, server-only writes) + Resend |
| Auth | None in v1 |
| Hosting | Vercel with per-PR previews (previews noindex via `robots.ts`) |

## Intro
One scroll-driven scene: a pinned stage (CSS sticky inside a ~5.5-screen section) whose single GSAP master timeline is scrubbed by ScrollTrigger, reversible both ways. Video clips provide the movement; GSAP adds the camera, crossfades, dust/haze, speed and branding.
1. Real roadrunner clip (looping) running from the start; scrolling pushes the camera in and speeds the world up (playback rate + speed lines + feet dust).
2. The cartoon clip, already running, crossfades in over it, lined up (same spot, size, ground line) by measured camera transforms; the camera eases back to the cartoon's framing as it runs.
3. Dust gathers at his feet, the dust clip (scrubbed frame by frame with the scroll) grows over him, a flat dust-coloured cover guarantees full cover at the swap; the bus layer takes over underneath.
4. The dust thins, the bus clip (scrubbed with the scroll, like the dust) drives out of it, the camera settles; SMOKEY'S, then the CTAs; the stage unpins and the page continues.
Clips: `src/content/intro-video.ts` → `npm run video:build` → `public/video/intro/` (H.264 MP4 ≤1920 wide, VP9 WebM, phone crop, still frame; HEVC-alpha for transparent clips). Everything is downloaded fully before the scroll unlocks. Temporary, clearly labelled placeholders are rendered from the owner's images until the real footage arrives (see `assets/intro-source/video/README.md`).
Reduced motion / Save-Data = crossfaded stills on a shorter scroll (no clips downloaded). No JS = the finished hero.

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

