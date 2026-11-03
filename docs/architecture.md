# Smokey's: architecture brief

**Archetype:** marketing site + lead capture. The homepage is one continuous sideways world (the signature tunnel scene is its first scene, not an intro); quote requests stored in Supabase and emailed via Resend (phase 2; today the booking panel composes a text or email for the visitor to send).

| Decision | Choice |
|---|---|
| Framework | Next.js 16.4 App Router, static rendering (16.4.3: the critical security release, PR #6; see docs/audit.md C1) |
| Styling / motion | Tailwind 4 tokens; GSAP 3 (one timeline, driven by the world's scroll; loaded on demand) for the tunnel scene; Motion 13 for interactive widgets; scroll-driven CSS for the scenes' entrances |
| Content | Typed TS files in `src/content` (CMS later if needed) |
| Backend (phase 2) | Supabase Postgres `quote_requests` (RLS on, no public policies, server-only writes) + Resend |
| Auth | None in v1 |
| Hosting | Vercel with per-PR previews (previews noindex via `robots.ts`) |

## The world
The homepage is ONE continuous world travelled sideways (`src/components/world`): the tunnel scene, then the bus, features, gallery, day or night, packages, events, how booking works, about, FAQ, contact and the footer, side by side, under one living sky, along one road. It is a fixed full-screen horizontal scroll container (not the page: a wider page makes phones zoom out), and a LOOP that only goes forward: after the footer the journey comes straight back round to the tunnel (the real one: the world moves it round to its end while it's off the screen, and back once its stage is pinned, so the join shows nothing) and on again. Every input (wheel, trackpad, swipes, drag, keys, a "Next stop" button) moves it on; asking to go back only tugs it a little; nav links travel to their scene ahead (a trip past the tunnel never replays its story), with no history entries. Focus, find-in-page and assistive tech still move it natively. Only actions open something over it (the booking panel). Screens under 40rem tall (a phone on its side, a short laptop window, high zoom) and no-JS visitors get the same scenes as a vertical column (WCAG 1.4.10).

## The tunnel scene
One scroll-driven film: a pinned stage (CSS sticky inside a long section: ~6 screens sideways) whose single GSAP master timeline is scrubbed by the world's scroll (its own driver, ScrollTrigger's scrub feel), forward each time round the loop. ONE continuous shot provides all the movement; it never plays on its own, it's seeked frame by frame to the playhead. GSAP adds the camera, the tunnel's black, the glow, the caption and the branding.
1. The roadrunner runs at the tunnel (the camera pushes in slowly; "Fast like a roadrunner…").
2. He runs in and the light goes: a black closes over everything, complete at the film's darkest frame. While it's black the film jumps past its own swap (the footage's lit dust and the bus waiting in the tunnel are never shown): that's where he becomes the bus.
3. Two headlights glow through the dark, then the bus's shape; it drives out onto the road, the camera settles; SMOKEY'S, then the CTAs, in the scene; the camera drifts on and the stage moves off as the world carries on.
Each stretch between the film's beats (tunnel, dark, lights, rest…: seconds, set per cut in `src/content/intro-video.ts`) gets its own share of the scroll (`intro-config.ts`).
Footage: two cuts of the same shot, portrait (phones) and wide 16:9 (desktops), each from its own master → `npm run video:build` → `public/video/intro/` (H.264 ≤1920 plus a lighter ≤1440 phone version, VP9; all encoded for instant seeking; three stills; five tiny pre-blurred glows). Each screen gets the closer cut; until the wide master exists, desktops show the portrait cut as a feathered band over the glow. The film downloads fully before the scroll unlocks (~3 MB on phones; its files are named after their content and served `immutable`, so a return visit takes them from the browser's cache). The current film is the owner's AI render with a generic coach, not Smokey's bus: it's labelled "Placeholder footage" until a render with the real bus replaces it (see `assets/intro-source/video/README.md`).
Reduced motion / Save-Data / 2G / a film that can't load, or whose download, judged ~2 s after its first byte, is on course to take over ~10 s (`INTRO.slowNet`) = crossfaded stills on a shorter scroll. No JS = the finished hero on the film's resting frame.

## Living sky and themes
Every page sits on a living sky (`src/components/sky`): day (blue sky, sun and rays, white clouds) or night (navy sky, moon, twinkling stars, rare shooting stars), changing through sunset and twilight (or back through sunrise) in ~5 s. It follows the visitor's day/night booking preference (clicking the sun or the moon, the header switch, or the "Day or night?" section), else the local time. Content sits on glass panels: white glass and navy text by day, navy glass and white text by night, gold accents, so no section is plain black. Clouds are a small WebGL shader, no Three.js (the whole sky, picker and booking store included, is ~9.5 KB gzip); everything else is static layers crossfaded by opacity, and the page theme flips inside a View Transition. Measured (Chromium, GPU): 60 fps scrolling day and night; a change runs with 0.3% slow frames (one, at the theme flip) on desktop and on a phone at 4x CPU. Measured text contrast on the panels: ≥ 5.4:1 by day, ≥ 8.2:1 by night (`npm run test:sky`). The preference lives in one merged booking record (`src/lib/booking-store.ts`, localStorage) for the booking form to extend; today it pre-fills the quote text/email.

## Routes (planned)
`/` (done) · `/about` · `/party-bus` · `/packages` · `/events` + `/events/[slug]` · `/gallery` · `/book` · `/contact` · `/faq` · `/privacy` · `/terms`

## Phases
0 Foundations ✅ · 1 Homepage + signature intro ✅ (placeholders) · 2 Booking backend · 3 Core pages · 4 SEO/a11y/perf + Playwright · 5 Real assets + launch

## Budgets
Mobile p75: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.
Initial JS measured 2026-10-28: ~258 KB gzip (React + Next runtime ≈ 150 KB, Motion + app ≈ 95 KB, the living sky ≈ 10 KB); GSAP + the intro engine (~30 KB gzip) are a separate chunk loaded on demand, in parallel with the film download, on every homepage visit (never for no-JS visitors; there is no returning-visitor shortcut or Replay yet). The original 100 KB target is below the Next.js 16 baseline; revised target ≤ 200 KB, work item for phase 4 (e.g. `motion/react-mini` for the intro, split below-fold widgets). LCP is unmeasured since the one-film intro: the branded loader covers the opening still until the engine code, the still and the fonts are in (see docs/audit.md).

## Assets needed from owner
Intro film re-rendered with the real bus, portrait 9:16 AND wide 16:9 (same story beats) · final mascot art (SVG/Lottie) · bus photos lights-off AND lights-on from the same tripod position · interior photos/video · logo SVG · brand colors/fonts · real specs, packages, contact details, service area, FAQ answers.

## Deployment (pre-launch lockdown)
Vercel project `smokey6/smokeys-website`, connected to GitHub `pdezzm8yt/smokeys-website`; production branch `main`.
On the Hobby plan, Deployment Protection covers every URL except the production domain, so until launch:
- `vercel.json` sets `git.deploymentEnabled.main = false`: pushes to `main` create no deployment. Every other branch gets a protected preview (sign-in required).
- The production alias `smokeys-website-omega.vercel.app` was removed (the project domain entry is kept, so the name stays reserved).
- `SITE_INDEXABLE` is unset: robots.txt disallows, pages and responses are `noindex`.

To launch: delete the `git` block from `vercel.json`, set `SITE_INDEXABLE=true` for Production, attach the real custom domain, merge to `main`.

