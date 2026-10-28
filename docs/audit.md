# Site audit (2026-10-28)

The whole project, checked against the owner's phase 1–5 specs and the "master recovery" brief.

_Status updated after the merge (2026-10-28): PRs #5–#9 landed together through PR #10, and PR #9 added the living day/night sky. Where the original said "this PR", it meant PR #8._

**How it was checked**
- **Six read-only audit agents:** homepage, shell/SEO/a11y, showroom, booking/backend, intro vs spec, and technology research.
- **An independent four-lens review of the new intro:** runtime, markup/CSS/a11y, build pipeline, and tests/docs. Every finding was put to a skeptic told to disprove it.
- **Runtime checks in a browser:** console errors, failed requests, broken anchors, overflow and screenshots on desktop and phone; `npm audit`; response headers.

**Confirmed** means it was reproduced or traced in the code. **Suspected** means the evidence points to it but it can't be verified from here.

## At a glance

- **Built and working:** the scroll-driven intro film, the homepage sections with sample content, the tap-to-explore bus photo with hotspots, the gallery with lightbox, the FAQ, and the living day/night sky behind every page (glass panels; choose with the sun, the moon, the header switch or the "Day or night?" picker), and the pre-launch lockdown (noindex, no production deploys, "Only me" previews).
- **Not built yet:**
  - the booking form, backend and payments;
  - accounts and the admin dashboard;
  - SMS, the service-area map and analytics;
  - the showroom's side navigation and the interior 360;
  - any 3D / Three.js work.

  These are specs, not broken code.
- **The site has no working way to book or contact the business** (see C2). That's fine behind the protected preview, but it blocks launch.

## Findings by severity

| # | Severity | Finding | Confirmed? | Status |
|---|---|---|---|---|
| C1 | Critical | next 16.3.7 had two unauthenticated remote-code-execution advisories (image optimizer with SVG; `use cache`), plus SSRF, a Server Actions DoS and cache poisoning. Transitive `zod` and `source-map-js` also had high-severity advisories | Confirmed (`npm audit`) | **Repaired:** PR #6 (next 16.4.3; `npm audit`: 0) |
| C2 | Critical (launch blocker) | Every "Get a Quote" path ends at a fictional phone number (555-0199) and a `.example` email. No form exists, so a visitor can't reach the business | Confirmed (rendered page) | **Open:** needs the real contact details, then the booking form (see "What I need from you") |
| H1 | High | 23 defects in the new intro. Among them: Skip followed by a failed load threw the visitor 3–5 screens down; background tabs fell back to stills; the frame flashed after Skip; the progress bar never filled; H.264 Level 5.0 was declared as 4.0; and the tests couldn't catch any of it | Confirmed (review + reproduction tests) | **Repaired:** PR #7 (20 flows now cover them) |
| H2 | High | The "Meet the bus" photos were shown as Smokey's own bus. A dealer-style plate, fleet unit "71" and an operator placard suggest they may be dealer or another operator's photos; rights aren't confirmed; the exterior is only 560 px wide | Suspected | **Repaired:** shown as "Sample photo" with a neutral alt text until you confirm (PR #8) |
| H3 | High | Two different buses appear back to back: the intro's AI coach (3-axle motorcoach) and the "Meet the bus" Ford shuttle | Confirmed | **Open:** needs footage and photos of the real bus |
| H4 | High | A Warner Bros. Road Runner image is tracked in a **public** repo: `assets/intro-source/roadrunner-cartoon.webp` plus a derivative | Confirmed | **Partly repaired:** PR #5 removed the generated copies. The original is yours, so deleting it (and purging it from history) needs your decision |
| H5 | High | Vercel Hobby is for non-commercial use only; taking bookings and payments needs Pro | Confirmed (Vercel terms) | **Open:** your decision before launch |
| H6 | High | Nothing has been tested on a real iPhone, iPad, Android, Safari/WebKit or Firefox. The scripts only drive Chromium | Confirmed gap | **Open:** needs devices (or a device cloud) on the protected preview |
| M1 | Medium | Unconfirmed claims were shown untagged: FAQ policies (alcohol, booking lead time), the events list (prom with minors, airport runs, wine tours), "leather" seats, "keeps the party private", and "every package includes…" | Confirmed | **Repaired:** tagged "Sample", or reworded to only what's visible (PR #8) |
| M2 | Medium | The sample phone number in the mobile menu had no "Sample" tag; the footer's tag sat inside its heading | Confirmed | **Repaired** (PR #8) |
| M3 | Medium | Nav and logo links were hash-only (`#bus`), so they broke on the 404 page and would on every future route | Confirmed | **Repaired:** `/#bus` etc. (PR #8) |
| M4 | Medium | The root layout set the canonical and OG URL to "/", which every future route would inherit | Confirmed | **Repaired:** moved to the homepage (PR #8) |
| M5 | Medium | No Content-Security-Policy | Confirmed | **Open:** needs care (inline pre-paint script, `blob:` video, Vercel toolbar, and later Stripe and maps). Ship Report-Only first |
| M6 | Medium | Initial JS is ~258 KB gzip (248 KB before the living sky added ~10 KB), over the 200 KB budget | Confirmed (measured) | **Open:** trim when the booking island lands |
| M7 | Medium | The film is served with `max-age=0` under unhashed names, so every visit revalidates 3–6 MB before scrolling unlocks | Confirmed | **Open:** content-hash the names and mark them immutable |
| M8 | Medium | "Meet the bus" on phones: a tapped hotspot's text appears below the photo, often off screen, and screen readers aren't told | Confirmed | **Open** |
| M9 | Medium | The gallery lightbox crops photos (`object-cover` in a fixed frame), so real photos will be cut | Confirmed | **Open:** fix before real photos go in |
| M10 | Medium | On slow connections the intro holds the page for up to 25 s before falling back to stills (Skip is the only way out) | Confirmed | **Open:** network-aware early fallback |
| M11 | Medium | The placeholder domain `smokeys.example` is baked into the canonical, OG, sitemap and robots output | Confirmed | Launch item (`site.url`) |
| L1 | Low | `/favicon.ico` returns 404; no apple-icon or web manifest | Confirmed | Open (needs the logo) |
| L2 | Low | The intro footage carries the generator's small "Ai" badge, visible on desktop and partly on phones | Confirmed | Your decision (keep, crop, or re-render) |
| L3 | Low | Colour seams: theme colour and loader `#0b0a10`, footer `#08080a`, stage `#000`, page about `#070709` | Confirmed | **Partly repaired:** PR #9 (the theme colour follows the sky; the footer and page are glass over the sky). Open: the loader `#0b0a10` and the black film stage |
| L4 | Low | The mobile menu button has no `aria-expanded` / `aria-controls` | Confirmed | Open |
| L5 | Low | `.vercelignore` didn't exclude the 22 MB of local film masters, so a CLI deploy would upload them | Confirmed | **Repaired** (PR #8) |

Nothing else turned up in the runtime checks: no console errors, failed requests, broken in-page anchors or horizontal overflow on desktop or phone. The baseline security headers (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`) are present.

## Your vision vs what exists

### Phase 1: cinematic intro
**Done (PR #7):**
- one continuous scroll-scrubbed shot: real roadrunner, desert, tunnel, darkness and headlights, the bus driving out, then the branding;
- forward and reverse scrolling, pinned stage, no cuts, flashes or stretching;
- 60 fps with ~99% of film frames shown in Chromium;
- reduced motion, Skip and no-JS fallbacks.

**Missing**, with what each needs:

| Item | Needs |
|---|---|
| Your headline and button text ("YOUR JOURNEY…", "BOOK YOUR RIDE", "EXPLORE THE FLEET") | Your call on "fleet" for a one-bus business |
| Desktop full-screen film | A **16:9 render** |
| The real bus in the film | **Renders made from photos of Smokey's bus** |
| Mouse parallax on desktop | Nothing (small) |
| Lenis smooth scrolling | Your taste; recommended: skip it |
| Three.js effects | A real 3D model of the bus; recommended: none in the intro |
| Frame-sequence fallback for slow seekers | Nothing to build it, but only worth it if real devices show stutter (measured cost: 4.8 MB) |

### Phase 2: luxury homepage and booking

| Item | Today | Needs from you |
|---|---|---|
| Black/gold/white design | Provisional black/gold/white on a living day/night sky with frosted-glass panels (PR #9); neons only in the party illustrations | Approve or replace the provisional gold, logo SVG, typeface direction |
| About Us | Missing | Your story, years in business, licence and insurance |
| Our Fleet | One bus section (sample photos) | Confirm the photos, real specs, "fleet" wording |
| Gallery (interior/exterior) | Illustrated placeholders | Real photos (and guest consent) |
| Packages | 3 sample packages, "Request pricing" | Real packages, durations, inclusions, pricing policy |
| Services and events | Sample list (now tagged) | Confirm what you offer |
| Customer reviews | Missing | Real reviews with permission, or your Google profile |
| Booking/quote form with storage and email | Missing | See below |
| Contact | Sample details | Real phone, email, service area, hours, socials |

### Phase 4: business platform (plan only, as you asked)

| Feature | Dependencies | Credentials / accounts | Your decisions | Size |
|---|---|---|---|---|
| Booking request form + storage + email | Server Action, zod, Postgres (Neon or Supabase **Pro**: Supabase Free pauses inactive projects), Resend | Database URL, Resend API key, a verified sending domain (DNS) | Who gets notified; required fields; minimum hours and lead time | M–L |
| Instant quote calculator | Pricing function, recomputed on the server | none | **Full pricing rules**: hourly rates, minimums, day/night/weekend/season, travel fees, deposits | M |
| Stripe deposits (sandbox first) | Hosted Checkout + signed webhook | Stripe account (test keys first) | Deposit %, refund and cancellation policy, when to charge | M |
| Availability (one bus) | Bookings table with an overlap constraint | none | Source of truth (calendar?), working hours, buffers, blackout dates | L |
| Customer accounts / manage booking | Emailed "manage my booking" link first; full accounts only if needed | none | Accounts or magic link; data retention | L |
| Admin dashboard | Auth with an owner allowlist | none | Who has access; booking statuses | L |
| Email + SMS confirmations and reminders | Resend; Twilio after A2P 10DLC registration (~10–15 days, ~$15) | Twilio account, EIN, legal name and address | Timing; SMS opt-in wording | M |
| Service-area map | Static map + city/ZIP list first | none (MapLibre later: none; Google: API key) | Service area | M |
| SEO + analytics | Real domain, LocalBusiness data, share image, Vercel Analytics or GA4 | Domain DNS; GA4 ID if chosen | Analytics provider, consent stance | M |
| Privacy policy and terms | Two routes | none | Approved legal text (needed before the form ships) | S |

Order that best helps customers book: real contact details → booking request form (storage + email) → privacy/terms → Stripe deposit link → pricing and availability → accounts, admin, SMS, map.

### Phase 5: interactive showroom (plan only)
**Exists:**
- exterior and interior hotspots on two photos, with a keyboard-accessible list (8 points);
- a site-wide day/night choice (PR #9): the bus photo gets a night grade with glowing headlights and roof markers, and the choice is saved in `src/lib/booking-store.ts` for the quote.

**Missing:**
- the 8-section side navigation;
- hotspots for the engine, wheels, headlights, doors (opening the interior), windows and rear;
- a photographed night look of the bus (today it's a grade of one daytime photo);
- the interior 360;
- the booking fields beyond day or night (the booking form will extend `src/lib/booking-store.ts`).

**Needs:**
- **verified specs:** make, model and year; engine, horsepower, fuel and drivetrain; tyres; capacity; amenities;
- **photos of each zone** at 3000 px+, from the same shoot;
- a **day/night photo pair** shot from the same tripod position;
- **360° interior photos** (2:1, 6000×3000+, from 2–3 positions, lights off and on);
- your decision on what day vs night means for booking (a time window? pricing?). Today it's only a preference: the customer still picks the date and time.

Without verified specs, those hotspots would be fake interactions, so they wait.

## What I need from you

1. **Business details:** legal name, phone, email, service area, hours, social links, production domain.
2. **Confirmation:**
   - that the "Meet the bus" photos show **your** bus and that you hold the rights;
   - that the FAQ answers and the events list are right.
3. **Decisions:**
   - "Explore the fleet" vs "Explore the bus";
   - black/gold palette: approve the provisional gold (PR #9) or provide your brand gold;
   - the Vercel Pro plan before launch;
   - what to do with the Warner Bros. original in the repo;
   - keep or crop the "Ai" badge;
   - analytics provider.
4. **Accounts, when you're ready** (set up in your name; secrets go only into Vercel's environment settings, never the code): a database (Neon or Supabase Pro), Resend plus DNS access for the domain, Stripe (test mode first), and later Twilio.
5. **Footage and photos:**
   - the film re-rendered with your bus, portrait **and** 16:9;
   - photos of your bus (exterior day and night, each zone, interior);
   - 360 interior captures for the showroom.
6. **Booking rules:** packages and pricing, minimums, deposit and cancellation policy, availability rules.

## Tests

**Passed (run 2026-10-28):**
- `typecheck`, `lint` and `build` on each branch.
- `npm run test:intro` against production builds:
  - PR #7: all 20 flows;
  - PR #6 and PR #8: all 17 of `main`'s flows;
  - PR #10 (the merged #5–#9): all 20 flows.
- `npm run perf:intro -- --gpu` on PR #7: 60 fps with 0% slow frames on desktop and phone at 1×, 4× and 6× CPU throttle; 274 of 277 film frames shown.
- `npm run test:sky` on PR #9 and on PR #10: all 12 checks (each transition, clicking the sky, the booking merge, reduced motion, measured contrast day and night, frame rate, no-JS).
- `npm audit` on PR #6: 0 vulnerabilities.
- On PR #8: nav links from the 404 page reach their sections (desktop, and the phone drawer); the tags render; the homepage alone declares the canonical.

**Failed:** none outstanding. Every failure found during this audit was repaired, and the re-run passed.

**Not run (no means to here):**
- real iPhone, iPad and Android devices;
- Safari/WebKit and Firefox;
- Lighthouse (the largest-paint element is unmeasured since the film rewrite);
- screen readers (VoiceOver, NVDA);
- booking, payment, email and SMS flows (they don't exist yet).

## Your seven questions

1. **Working:** the intro film (scrubbed, reversible, smooth in Chromium, with fallbacks), the living day/night sky, the homepage sections, the bus hotspots, the gallery and lightbox, the FAQ, the pre-launch lockdown and the security headers.
2. **Needs improvement:**
   - sample content presented without tags (fixed);
   - the photo provenance;
   - the two different buses;
   - "Meet the bus" feedback on phones;
   - the lightbox cropping;
   - caching;
   - the JS budget;
   - the slow-network wait.
3. **Missing from the animation:**
   - the 16:9 version and the real bus (assets);
   - your headline and buttons (wording decision);
   - desktop mouse parallax;
   - real-device verification.
4. **More realistic and immersive:**
   - footage of the real bus, from the same render as the roadrunner;
   - the 16:9 cut, so desktops get full-screen film;
   - a subtle desktop parallax;
   - consistent black-gold lighting and colour across the page;
   - real photography.

   3D models of a bus that doesn't exist yet would make it look less real, not more.
5. **60 fps:** already measured in Chromium: transforms and opacity only, a seek-optimised encode, one seek in flight, the film fully in memory, glows pre-blurred at build time. Still to do: real-device checks, a seek-latency probe, and a frame-sequence fallback only for devices that need it.
6. **Assets:** see "What I need from you", items 5 and 1–2.
7. **Next, in order:**
   1. ~~merge the open PRs~~ (done: #5–#9 merged through PR #10 on 2026-10-28);
   2. real contact details;
   3. the reveal headline and buttons (needs only the "fleet" decision; the provisional black-gold retheme came with PR #9);
   4. the booking request form (needs the accounts above);
   5. device testing on the preview;
   6. privacy and terms;
   7. Stripe deposits;
   8. the showroom, once verified specs and photos exist.
