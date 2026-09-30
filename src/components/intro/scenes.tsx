import type { CSSProperties } from "react";
import { ButtonLink } from "@/components/ui/button";
import type { ClipSlot } from "@/content/intro-video";
import { quoteHref, site } from "@/content/site";
import { cn } from "@/lib/cn";
import { CartoonDesert } from "./cartoon-desert";
import { clipUrl, getClip } from "./intro-clips";
import { DustEmitter, SpeedLines } from "./parts";

/*
 * The intro's layers, server-rendered. The VIDEO provides the subject's
 * movement; the GSAP engine (intro-engine.ts) only moves the camera around it,
 * fades between layers and adds the dust. Clip files and framing come from
 * src/content/intro-video.ts (+ the generated manifest).
 */

/**
 * One clip, framed for any screen (see .intro-clip in globals.css): never
 * stretched, cropped like `object-fit: cover` down to the clip's minVisible,
 * then shown as a band. Its still frame sits underneath the video.
 */
function ClipFrame({ slot, posterEager = false }: { slot: ClipSlot; posterEager?: boolean }) {
  const clip = getClip(slot);
  const m = clip.manifest;
  const style = {
    "--aspect": m ? m.width / m.height : 16 / 9,
    "--fx": clip.focus.x,
    "--fy": clip.focus.y,
    "--min-visible": Math.max(0.0001, clip.minVisible),
    // minVisible 0 (the dust) means "always fill the frame", vertically too.
    ...(clip.minVisible === 0 ? { "--min-visible-y": 0.0001 } : {}),
  } as CSSProperties;
  const poster = m ? clipUrl(m.poster.file) : undefined;
  return (
    <div data-clip-box={slot} className="intro-clip" style={style}>
      {poster && m ? (
        // A plain <img>: the exact frame the video ends on (no re-encode). Only the bus still loads
        // up front (returning visitors land on it); the others load only if they're ever needed.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          data-poster={slot}
          src={posterEager ? poster : undefined}
          data-src={poster}
          alt=""
          width={m.width}
          height={m.height}
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
      {/* No src here: the intro downloads the right file for this device first, then attaches it. */}
      <video
        data-clip={slot}
        muted
        playsInline
        preload="none"
        loop={clip.loop}
        disablePictureInPicture
        disableRemotePlayback
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 size-full object-cover"
      />
    </div>
  );
}

/** What shows around a clip when a narrow screen letterboxes it: its own edge colours. */
function backdrop(slot: ClipSlot, fallback: string) {
  const b = getClip(slot).manifest?.backdrop;
  return b ? `linear-gradient(${b.top}, ${b.bottom})` : fallback;
}

/** Positioned by the engine at the subject's feet: dust kicked up behind the runner. */
function FeetDust({ name, cartoon = false }: { name: string; cartoon?: boolean }) {
  return (
    <div data-subject-box={name} aria-hidden="true" className="pointer-events-none absolute">
      <DustEmitter name={name} x={34} y={97} size={cartoon ? 26 : 18} count={cartoon ? 14 : 6} phoneCount={cartoon ? 8 : 4} cartoon={cartoon} />
    </div>
  );
}

/** Scene 1: the real roadrunner, already running (the clip loops until the tap). */
export function SceneReal() {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: backdrop("real", "#2a1d12") }}>
      <div data-camera="real" className="absolute inset-0 origin-top-left will-change-transform">
        <ClipFrame slot="real" />
        <FeetDust name="real" />
      </div>
      <SpeedLines name="real" className="opacity-35" />
      <p
        data-intro-wordmark
        className="absolute top-[max(5rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 font-display text-xs font-bold tracking-[0.6em] whitespace-nowrap text-white/75 [text-shadow:0_1px_12px_rgb(0_0_0/0.6)] sm:top-[max(1.75rem,env(safe-area-inset-top))] sm:text-sm"
      >
        {site.name.toUpperCase()}
      </p>
    </div>
  );
}

/**
 * Scene 2: the cartoon roadrunner running through the desert. If the clip is
 * transparent (the runner alone), it runs over the layered parallax desert.
 */
export function SceneCartoon() {
  const isolated = getClip("cartoon").blend === "alpha";
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: backdrop("cartoon", "#7cc4ee") }}>
      <div data-camera="cartoon" className="absolute inset-0 origin-top-left will-change-transform">
        {isolated ? <CartoonDesert /> : null}
        <ClipFrame slot="cartoon" />
        <FeetDust name="cartoon" cartoon />
      </div>
      <SpeedLines name="cartoon" className="opacity-0" />
      <p
        data-caption="cartoon"
        className="absolute inset-x-4 top-[18%] text-center font-display text-2xl font-black tracking-tight text-white opacity-0 [text-shadow:0_3px_0_#3a1f14,0_0_24px_rgb(58_31_20/0.4)] sm:text-4xl"
      >
        Fast like a roadrunner&hellip;
      </p>
    </div>
  );
}

/**
 * Scene 3: the black party bus, rolling out of the dust where the roadrunner
 * vanished. Holds the page's H1 and main calls to action.
 */
export function SceneBus() {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: backdrop("bus", "#050306") }}>
      <div data-camera="bus" className="absolute inset-0 origin-top-left will-change-transform">
        <ClipFrame slot="bus" posterEager />
      </div>
      {/* Emerging from the dust's shadow (opacity-only, faded by the engine) */}
      <div data-bus-shade aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black opacity-50" />
      {/* Keeps the headline readable over any footage */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[62%] bg-linear-to-b from-black/80 via-black/40 to-transparent short:inset-y-0 short:right-auto short:h-full short:w-[60%] short:bg-linear-to-r"
      />

      <div
        data-bus-copyblock
        className="relative z-10 flex flex-col items-center px-4 pt-[calc(var(--header-h)+1rem)] text-center sm:pt-[calc(var(--header-h)+2rem)] short:absolute short:top-0 short:left-0 short:w-[max(44%,16rem)] short:items-start short:ps-6 short:pt-[calc(var(--header-h)+0.25rem)] short:text-start"
      >
        <p data-bus-copy className="font-display text-sm font-bold tracking-tight text-neon-pink opacity-0 sm:text-lg short:[@media(max-height:20rem)]:hidden">
          &hellip;loud like a party bus.
        </p>
        {/* tabIndex -1: the intro moves focus here when the reveal lands, so Tab continues to the CTAs. */}
        <h1 id="intro-title" tabIndex={-1} data-bus-copy className="mt-3 font-display leading-[0.95] font-black tracking-tight opacity-0 outline-none short:mt-1">
          <span className="block text-(length:--h1-size) text-glow-amber short:text-[clamp(1.75rem,9svh,2.5rem)]">SMOKEY&apos;S</span>{" "}
          <span className="mt-2 block text-sm font-semibold tracking-[0.55em] text-muted-foreground sm:text-base short:text-xs">PARTY BUS</span>
        </h1>
        <p data-bus-copy className="mt-4 hidden max-w-md text-base text-pretty text-muted-foreground opacity-0 [@media(min-height:56rem)]:block">
          Birthdays, prom, weddings and nights out. Tell us the plan and we&apos;ll bring the party to your door.
        </p>
        {/* The copy stays hidden until the timeline brings it in: opacity only, so the H1 stays readable
            to screen readers throughout; the CTAs are also invisible (out of the Tab order) until then. */}
        <div data-bus-copy data-bus-ctas className="invisible mt-6 flex flex-wrap items-center justify-center gap-3 opacity-0 short:mt-3 short:flex-nowrap short:justify-start short:gap-2">
          <ButtonLink href={quoteHref} size="lg" className="short:h-10 short:px-4 short:text-sm">
            Get a Quote
          </ButtonLink>
          <ButtonLink href="#bus" size="lg" variant="secondary" className="short:h-10 short:px-4 short:text-sm">
            See the Bus
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

/**
 * The dust clip that hides the transformation. On black it's layered with
 * "screen" (black drops out); a transparent clip is layered normally. It sits
 * directly in the stage's stacking context so the blend reaches the scenes.
 */
export function DustLayer() {
  const dust = getClip("dust");
  return (
    <div
      data-dust
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 z-21 origin-top-left opacity-0 will-change-transform", dust.blend === "screen" && "mix-blend-screen")}
    >
      <ClipFrame slot="dust" />
    </div>
  );
}
