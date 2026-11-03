import type { CSSProperties } from "react";
import { ButtonLink } from "@/components/ui/button";
import { FILM_GLOWS, FILM_STILLS, type FilmGlow, type FilmStill } from "@/content/intro-video";
import { quoteHref } from "@/content/site";
import { cn } from "@/lib/cn";
import { cutFor, filmUrl, framingVars, WIDE_SCREEN, type Cut } from "./intro-film";

/*
 * The tunnel scene's layers, server-rendered. The FILM provides all the
 * movement; the GSAP engine (intro-engine.ts) only scrubs it with the scroll,
 * moves the camera around it and fades the layers. Files, framing and story
 * beats come from src/content/intro-video.ts (+ the generated manifest).
 */

/**
 * The stills shown in the scene: the opening frame, and the bus out on the
 * road (the build also makes a "cover" frame from the old dusty swap, which
 * the dark story doesn't show).
 */
const SHOWN_STILLS = FILM_STILLS.filter((name): name is Exclude<FilmStill, "cover"> => name !== "cover");

/** The cut tall screens get, and the one wide screens get (the same one while only one exists). */
const tall = cutFor(false);
const wide = cutFor(true);

type Frame = { kind: "still"; name: FilmStill } | { kind: "glow"; name: FilmGlow };

/**
 * One of the film's frames as a picture: wide screens get the wide cut's
 * version (chosen before anything downloads). Once the intro runs it locks
 * in the cut it picked for this screen (intro-media.ts).
 */
function CutPicture({ frame, className, priority, lead = false }: { frame: Frame; className?: string; priority?: "high" | "low"; lead?: boolean }) {
  if (!tall) return null;
  const file = (cut: Cut) => (frame.kind === "still" ? cut.manifest.stills[frame.name] : cut.manifest.glows[frame.name]);
  // The lead-in's mirror images are marked apart (FilmMedia pins them to the same cut; nothing mistakes them for the stage's).
  const still = frame.kind === "still" ? frame.name : undefined;
  const glow = frame.kind === "glow" ? frame.name : undefined;
  return (
    <picture
      data-still={lead ? undefined : still}
      data-glow={lead ? undefined : glow}
      data-lead-still={lead ? still : undefined}
      data-lead-glow={lead ? glow : undefined}
      className={className}
    >
      {wide && wide !== tall ? <source media={WIDE_SCREEN} srcSet={filmUrl(file(wide))} /> : null}
      {/* A plain <img>: the film's own frames (no re-encode by the image optimizer). */}
      <img src={filmUrl(file(tall))} alt="" decoding="async" fetchPriority={priority} className="size-full object-cover" />
    </picture>
  );
}

/**
 * The film, framed for any screen (see .intro-film in globals.css): it covers
 * the frame like `object-fit: cover`, up to the cut's minVisible; past that
 * it's a feathered band over a soft glow of the same scene. Its stills sit
 * underneath the video (reduced motion, no JS, until the film is in memory).
 */
export function FilmLayer() {
  if (!tall) return <div className="absolute inset-0 bg-black" />;
  const style = { ...framingVars(tall, "tall-"), ...framingVars(wide ?? tall, "wide-") } as CSSProperties;
  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {/* The glow: one per stretch of the story, stacked in story order (the engine fades each in over the last). */}
      <div aria-hidden="true" className="absolute inset-0">
        {FILM_GLOWS.map((name) => (
          <CutPicture key={name} frame={{ kind: "glow", name }} className={cn("absolute inset-0", name !== "start" && "opacity-0")} />
        ))}
      </div>
      <div data-camera className="absolute inset-0 origin-[50%_55%] will-change-transform">
        <div data-film-box className="intro-film" style={style}>
          {SHOWN_STILLS.map((name) => (
            <CutPicture
              key={name}
              frame={{ kind: "still", name }}
              priority={name === "start" ? "high" : "low"}
              className={cn("absolute inset-0", name !== "start" && "opacity-0")}
            />
          ))}
          {/* No src here: the intro downloads the right file for this screen first, then attaches it. */}
          <video
            data-film
            muted
            playsInline
            preload="none"
            disablePictureInPicture
            disableRemotePlayback
            aria-hidden="true"
            tabIndex={-1}
            className="absolute inset-0 size-full object-cover"
          />
        </div>
      </div>
      <p
        data-caption
        className="invisible absolute inset-x-4 top-[18%] text-center font-display text-2xl font-black tracking-tight text-white opacity-0 [text-shadow:0_3px_0_#3a1f14,0_0_24px_rgb(58_31_20/0.5)] sm:text-4xl"
      >
        Fast like a roadrunner&hellip;
      </p>
    </div>
  );
}

/**
 * Where the bus comes out onto the road: the page's H1 and main calls to
 * action appear in the scene itself (no separate hero), over a scrim that
 * keeps them readable on any footage.
 */
export function IntroCopy() {
  return (
    <div className="absolute inset-0 z-25">
      <div
        data-copy-scrim
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[62%] bg-linear-to-b from-black/80 via-black/40 to-transparent opacity-0 short:inset-y-0 short:right-auto short:h-full short:w-[60%] short:bg-linear-to-r"
      />
      <div
        data-bus-copyblock
        className="relative flex flex-col items-center px-4 pt-[calc(var(--header-h)+1rem)] text-center sm:pt-[calc(var(--header-h)+2rem)] short:absolute short:top-0 short:left-0 short:w-[max(44%,16rem)] short:items-start short:ps-6 short:pt-[calc(var(--header-h)+0.25rem)] short:text-start"
      >
        <p data-bus-copy className="font-display text-sm font-bold tracking-tight text-gold opacity-0 sm:text-lg short:[@media(max-height:20rem)]:hidden">
          &hellip;loud like a party bus.
        </p>
        {/* tabIndex -1: Skip moves focus here, so Tab continues to the CTAs. */}
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
          {/* Opens the booking panel over the world (ActionDrawer); without JS, the contact scene. */}
          <ButtonLink href={quoteHref} data-action="book" size="lg" className="short:h-10 short:px-4 short:text-sm">
            Book your ride
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
 * What leads the tunnel stage in when the world's loop comes back round to
 * it (src/components/world/world-scroll.ts: the scene is moved round to the
 * end of the world): the stage's own edge in mirror image, its glow behind
 * its film framed exactly as the stage frames them (FilmMedia pins it to the
 * same cut), fading into the world (globals.css: .intro-lead), so the world's
 * light turns to the desert's with no edge where they meet. Pictures only.
 */
export function OpeningLead() {
  if (!tall) return null;
  const style = { ...framingVars(tall, "tall-"), ...framingVars(wide ?? tall, "wide-") } as CSSProperties;
  return (
    <div className="intro-lead-mirror theme-night">
      <div className="absolute inset-0 overflow-hidden bg-black">
        <CutPicture lead frame={{ kind: "glow", name: "start" }} className="absolute inset-0" />
        <CutPicture lead frame={{ kind: "glow", name: "rest" }} className="absolute inset-0" />
      </div>
      <div data-lead-film className="intro-film" style={style}>
        <CutPicture lead frame={{ kind: "still", name: "start" }} className="absolute inset-0" />
        <CutPicture lead frame={{ kind: "still", name: "rest" }} className="absolute inset-0" />
      </div>
    </div>
  );
}
