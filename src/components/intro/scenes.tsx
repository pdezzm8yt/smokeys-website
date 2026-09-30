import Image from "next/image";
import type { CSSProperties } from "react";
import { PartyBus } from "@/components/art/party-bus";
import { ButtonLink } from "@/components/ui/button";
import { SampleTag } from "@/components/ui/sample-tag";
import { assets, type AssetSlot } from "@/content/assets";
import { quoteHref, site } from "@/content/site";
import { DesertBackdrop } from "./desert-backdrop";
import { Mascot } from "./mascot";
import { RoadrunnerSilhouette } from "./roadrunner-silhouette";

const DUST = [
  { top: "62%", size: 180, delay: "0s", dur: "13s", o: 0.35 },
  { top: "70%", size: 260, delay: "-4s", dur: "17s", o: 0.25 },
  { top: "56%", size: 120, delay: "-8s", dur: "11s", o: 0.4 },
  { top: "78%", size: 320, delay: "-2s", dur: "19s", o: 0.2 },
  { top: "66%", size: 90, delay: "-11s", dur: "9s", o: 0.45 },
];

/** Scene 1: realistic roadrunner at dusk. Uses real media once supplied. */
export function SceneReal() {
  const media: AssetSlot = assets.intro.realRoadrunner;
  const hasVideo = Boolean(media.video?.mp4 || media.video?.webm);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#120a24]">
      {/* Slow cinematic drift */}
      <div className="absolute inset-0 motion-safe:animate-kenburns">
        {hasVideo ? (
          <video className="absolute inset-0 size-full object-cover" autoPlay muted loop playsInline poster={media.src ?? undefined}>
            {media.video?.webm && <source src={media.video.webm} type="video/webm" />}
            {media.video?.mp4 && <source src={media.video.mp4} type="video/mp4" />}
          </video>
        ) : media.src ? (
          <Image src={media.src} alt="" fill preload sizes="100vw" className="object-cover" />
        ) : (
          <>
            <DesertBackdrop />
            <RoadrunnerSilhouette className="absolute bottom-[13%] left-1/2 w-[min(90vw,640px)] -translate-x-[60%]" />
          </>
        )}
      </div>

      {/* Heat shimmer over the horizon */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-[62%] h-[5%] bg-linear-to-b from-transparent via-[oklch(0.85_0.12_70/0.35)] to-transparent blur-md motion-safe:animate-shimmer"
      />

      {/* Drifting dust, fewer on phones */}
      <div aria-hidden="true" className="absolute inset-0">
        {DUST.map((d, i) => (
          <span
            key={i}
            className="absolute left-0 rounded-full bg-[radial-gradient(circle,oklch(0.85_0.08_60/0.55),transparent_70%)] motion-safe:animate-dust max-md:[&:nth-child(n+4)]:hidden"
            style={
              {
                top: d.top,
                width: d.size,
                height: d.size * 0.45,
                animationDelay: d.delay,
                animationDuration: d.dur,
                "--dust-opacity": d.o,
              } as CSSProperties
            }
          />
        ))}
      </div>

      {/* Vignette + grain for a filmic finish */}
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgb(0_0_0/0.75)_100%)]" />
      <div aria-hidden="true" className="bg-grain absolute inset-0 opacity-[0.07] mix-blend-overlay" />

      {/* Subtle brand intro */}
      <p className="absolute top-[max(5rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 font-display sm:top-[max(1.75rem,env(safe-area-inset-top))] text-xs font-bold tracking-[0.6em] whitespace-nowrap text-white/70 motion-safe:animate-[pulse-soft_5s_ease-in-out_infinite] sm:text-sm">
        {site.name.toUpperCase()}
      </p>

      {media.placeholder && <SampleTag label="Placeholder art" className="absolute bottom-6 left-4 max-sm:hidden" />}
    </div>
  );
}

/** Scene 2: the original cartoon mascot, pop-art burst behind. */
export function SceneCartoon() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[oklch(0.3_0.16_300)]">
      <div
        data-cartoon-bg
        aria-hidden="true"
        className="absolute inset-[-40%] [background:repeating-conic-gradient(from_0deg,oklch(0.42_0.2_310)_0deg_9deg,oklch(0.34_0.18_295)_9deg_18deg)] motion-safe:animate-[spin_60s_linear_infinite]"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,oklch(0.7_0.24_350/0.55),transparent_55%)]" />
      <div aria-hidden="true" className="absolute inset-0 [background-image:radial-gradient(rgb(0_0_0/0.22)_1.2px,transparent_1.4px)] [background-size:12px_12px]" />

      <div className="absolute inset-0 flex items-center justify-center">
        <div data-mascot className="w-[min(82vw,540px)] will-change-transform">
          <Mascot className="w-full drop-shadow-[0_18px_30px_rgb(0_0_0/0.45)]" />
        </div>
      </div>

      <p
        data-cartoon-copy
        className="absolute inset-x-4 bottom-[18%] text-center font-display text-2xl font-black tracking-tight text-white opacity-0 [text-shadow:0_4px_0_rgb(0_0_0/0.35)] sm:text-4xl"
      >
        Fast like a roadrunner&hellip;
      </p>
    </div>
  );
}

/** Scene 3: the black party bus reveal. Holds the page's H1 and main CTAs. */
export function SceneBus() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#050507]">
      {/* Night road: perspective floor + drifting city light streaks */}
      <div aria-hidden="true" className="absolute inset-0">
        <div className="absolute inset-x-0 bottom-0 h-[42%] bg-linear-to-b from-transparent to-[oklch(0.2_0.06_300/0.6)]" />
        <div className="absolute inset-x-[-50%] bottom-0 h-[38%] origin-bottom [transform:perspective(500px)_rotateX(62deg)] [background-image:linear-gradient(90deg,oklch(0.7_0.24_350/0.18)_1px,transparent_1px),linear-gradient(0deg,oklch(0.66_0.22_295/0.14)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_top,black,transparent)]" />
        <div className="absolute top-[64%] left-[-20%] h-px w-[40%] bg-linear-to-r from-transparent via-neon-cyan/60 to-transparent motion-safe:animate-[dust_7s_linear_infinite]" />
        <div className="absolute top-[72%] left-[-20%] h-px w-[30%] bg-linear-to-r from-transparent via-neon-pink/60 to-transparent motion-safe:animate-[dust_9s_linear_infinite_-3s]" />
        <div className="absolute top-[12%] left-1/2 size-[60vmax] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,oklch(0.66_0.22_295/0.18),transparent_60%)]" />
      </div>

      <div className="relative z-10 flex h-full flex-col items-center px-4 pt-[calc(var(--header-h)+1.25rem)] pb-20 text-center sm:pt-[calc(var(--header-h)+2.5rem)]">
        <p data-bus-copy className="font-display text-sm font-bold tracking-tight text-neon-pink sm:text-lg">
          &hellip;loud like a party bus.
        </p>
        <h1 data-bus-copy className="mt-3 font-display leading-[0.95] font-black tracking-tight">
          <span className="block text-[clamp(2.5rem,1.2rem+7vw,7.5rem)] text-glow-amber">SMOKEY&apos;S</span>{" "}
          <span className="mt-2 block text-sm font-semibold tracking-[0.55em] text-muted-foreground sm:text-lg">PARTY BUS</span>
        </h1>
        <p data-bus-copy className="mt-5 max-w-md text-base text-pretty text-muted-foreground sm:text-lg">
          Birthdays, prom, weddings and nights out. Tell us the plan and we&apos;ll bring the party to your door.
        </p>
        <div data-bus-copy className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href={quoteHref} size="lg">
            Get a Quote
          </ButtonLink>
          <ButtonLink href="#bus" size="lg" variant="secondary">
            See the Bus
          </ButtonLink>
        </div>

        <div className="relative mt-auto flex w-full min-h-0 flex-1 items-center justify-center pt-6 sm:items-end">
          <PartyBus idPrefix="intro-bus" beam className="max-h-full w-[min(1080px,125vw)] shrink-0 max-sm:-translate-x-[9%]" />
          {assets.bus.heroLightsOn.placeholder && (
            <SampleTag label="Illustration · real photos coming" className="absolute right-0 bottom-0 max-sm:hidden" />
          )}
        </div>
      </div>
    </div>
  );
}
