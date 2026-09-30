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
One pinned stage, three stacked scene layers, fixed-length Motion timelines per transition (not scroll-scrubbed). Match cut: camera zooms on the bird's head (`data-zoom-target`), flash + speed lines hide the cut to the mascot. Mascot dashes off, smoke cloud wipes to black, headlights → bus → lights → copy. Reduced motion = crossfades. Lite mode (phones / coarse pointer / Save-Data) drops live blur.

## Routes (planned)
`/` (done) · `/about` · `/party-bus` · `/packages` · `/events` + `/events/[slug]` · `/gallery` · `/book` · `/contact` · `/faq` · `/privacy` · `/terms`

## Phases
0 Foundations ✅ · 1 Homepage + signature intro ✅ (placeholders) · 2 Booking backend · 3 Core pages · 4 SEO/a11y/perf + Playwright · 5 Real assets + launch

## Budgets
Mobile p75: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.
Initial JS measured 2026-09-30: ~239 KB gzip (React + Next runtime ≈ 150 KB, Motion + app ≈ 90 KB). The original 100 KB target is below the Next.js 16 baseline; revised target ≤ 200 KB, work item for phase 4 (e.g. `motion/react-mini` for the intro, split below-fold widgets). LCP element is the intro wordmark/text, so the static HTML paints before JS.

## Assets needed from owner
Licensed realistic roadrunner video/photo (landscape + portrait) · final mascot art (SVG/Lottie) · bus photos lights-off AND lights-on from the same tripod position · interior photos/video · logo SVG · brand colors/fonts · real specs, packages, contact details, service area, FAQ answers.
