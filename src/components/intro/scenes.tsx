import { preload } from "react-dom";
import { PartyBus } from "@/components/art/party-bus";
import { ButtonLink } from "@/components/ui/button";
import { assets } from "@/content/assets";
import { quoteHref, site } from "@/content/site";
import { CartoonDesert } from "./cartoon-desert";
import { DesertBackdrop } from "./desert-backdrop";
import { Mascot } from "./mascot";
import { AnchoredSubject, KickDust, LoopLayer, SpeedLines, StripTile } from "./parts";
import { INTRO } from "./intro-config";
import { RoadrunnerSilhouette } from "./roadrunner-silhouette";

/**
 * Scene 1: the owner's real roadrunner, sprinting. The bird is a sharp cutout
 * with a quick stride bob; behind it, subject-free plates made from the same
 * photo stream past at two speeds (a camera panning with the bird).
 */
export function SceneReal() {
  const real = assets.intro.real;
  // The plate strip is painted first but, as a CSS background, is discovered late:
  // preload it from <head> for early discovery (no priority boost, so it can't
  // outrank the bus image for returning visitors, who start on the bus).
  if (real.src) preload(real.plate.src, { as: "image" });
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#2a1d12]">
      <div data-camera="real" className="absolute inset-0 origin-[50%_75%] will-change-transform">
        {real.src ? (
          <>
            <LoopLayer seconds={INTRO.loops.realPlate} className="inset-y-0">
              <StripTile image={real.plate} />
            </LoopLayer>
            <LoopLayer seconds={INTRO.loops.realGround} className="bottom-0 h-[34%] [mask-image:linear-gradient(to_bottom,transparent,black_45%)]">
              <StripTile image={real.ground} />
            </LoopLayer>
          </>
        ) : (
          <DesertBackdrop />
        )}
      </div>

      {/* Grade: warm the photo and pull focus to the bird */}
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(18_10_4/0.45),transparent_38%,transparent_70%,rgb(24_10_2/0.5))]" />
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_70%,transparent_40%,rgb(0_0_0/0.6)_100%)]" />
      <div aria-hidden="true" className="bg-grain absolute inset-0 opacity-[0.035] max-md:hidden pointer-coarse:hidden" />

      <SpeedLines name="real" className="opacity-35" />

      <AnchoredSubject
        name="real"
        image={real.src}
        alt=""
        priority
        sizes="(min-width: 1024px) 900px, 92vw"
        idleClassName="motion-safe:animate-run-real"
        fallback={<RoadrunnerSilhouette className="w-full" />}
      >
        {/* Contact shadow + dirt kicked up by the planted foot */}
        <span aria-hidden="true" className="absolute -bottom-[4%] left-[30%] -z-10 h-[10%] w-[50%] rounded-[50%] bg-black/45 blur-md" />
        <KickDust x={60} y={96} size={16} />
      </AnchoredSubject>

      <p className="absolute top-[max(5rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 font-display text-xs font-bold tracking-[0.6em] whitespace-nowrap text-white/75 motion-safe:animate-[pulse-soft_5s_ease-in-out_infinite] sm:top-[max(1.75rem,env(safe-area-inset-top))] sm:text-sm">
        {site.name.toUpperCase()}
      </p>
    </div>
  );
}

/** Scene 2: the cartoon roadrunner tearing through a parallax desert. */
export function SceneCartoon() {
  const cartoon = assets.intro.cartoon;
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#7cc4ee]">
      <div data-camera="cartoon" className="absolute inset-0 origin-[50%_80%] will-change-transform">
        <CartoonDesert />
      </div>

      <SpeedLines name="cartoon" className="opacity-0" />

      <AnchoredSubject
        name="cartoon"
        image={cartoon.src}
        alt=""
        sizes="(min-width: 1024px) 480px, 74vw"
        idleClassName="motion-safe:animate-run-cartoon"
        fallback={<Mascot className="w-full" />}
      >
        <span aria-hidden="true" className="absolute -bottom-[3%] left-[15%] -z-10 h-[8%] w-[70%] rounded-[50%] bg-[#7a3f16]/35 blur-sm" />
        {/* Cartoon "whoosh" lines trailing behind */}
        <span aria-hidden="true" className="absolute top-[34%] right-[92%] flex w-[70%] flex-col items-end gap-[0.9vmin]">
          {[80, 55, 95, 65].map((w, i) => (
            <span
              key={w}
              className="h-[0.9vmin] min-h-1 origin-right rounded-full bg-white/90 shadow-[0_0_0_2px_rgb(58_31_20/0.5)] motion-safe:animate-whoosh"
              style={{ width: `${w}%`, animationDelay: `${-i * 0.09}s` }}
            />
          ))}
        </span>
        <KickDust x={22} y={94} size={30} count={5} period={0.6} />
      </AnchoredSubject>

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
 * Scene 3: the black party bus, revealed where the roadrunner stood. Holds the
 * page's H1 and main calls to action.
 */
export function SceneBus() {
  const bus = assets.intro.bus;
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#030205]">
      <DesertBackdrop variant="night" />
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_75%_40%_at_50%_100%,oklch(0.32_0.12_300/0.5),transparent_70%)]" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/4 bg-linear-to-t from-black/70 to-transparent" />

      <AnchoredSubject
        name="bus"
        image={bus.src}
        alt={bus.alt}
        sizes="(min-width: 1024px) 780px, 94vw"
        fallback={<PartyBus idPrefix="intro-bus" className="w-full" />}
      >
        {/* Grounding: contact shadow, then a light pool the headlights spill onto */}
        <span aria-hidden="true" className="absolute -bottom-[3%] left-[4%] -z-10 h-[9%] w-[92%] rounded-[50%] bg-black/80 blur-md" />
        <span
          data-bus-pool
          aria-hidden="true"
          className="absolute -right-[22%] -bottom-[14%] -left-[16%] -z-20 h-[34%] rounded-[50%] bg-[radial-gradient(ellipse_at_62%_50%,oklch(0.85_0.12_75/0.45),oklch(0.55_0.2_310/0.35)_45%,transparent_72%)] blur-lg"
        />

        {/* Sheen that sweeps along the paint, masked to the bus silhouette */}
        {bus.src && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden mix-blend-screen"
            style={{
              maskImage: `url(${bus.mask.src})`,
              WebkitMaskImage: `url(${bus.mask.src})`,
              maskSize: "100% 100%",
              WebkitMaskSize: "100% 100%",
            }}
          >
            <span
              data-bus-sweep
              className="absolute inset-y-0 left-0 w-[60%] bg-[linear-gradient(100deg,transparent_25%,rgb(255_255_255/0.55)_50%,transparent_75%)] opacity-0"
            />
          </span>
        )}

        {/* Headlight flares on the real lamps */}
        {bus.headlights.map((h) => (
          <span
            key={`${h.x}-${h.y}`}
            data-bus-flare
            aria-hidden="true"
            className="pointer-events-none absolute aspect-square -translate-1/2 opacity-80 mix-blend-screen"
            style={{ left: `${h.x}%`, top: `${h.y}%`, width: `${(h.size ?? 1) * 16}%` }}
          >
            <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle,#fff_0%,rgb(255_236_200/0.9)_14%,rgb(255_196_120/0.35)_38%,transparent_68%)]" />
            <span className="absolute top-1/2 left-1/2 h-[7%] w-[420%] -translate-1/2 rounded-full bg-[radial-gradient(ellipse,rgb(255_244_220/0.85),rgb(170_190_255/0.25)_45%,transparent_70%)]" />
          </span>
        ))}
      </AnchoredSubject>

      <div
        data-bus-copyblock
        className="relative z-10 flex flex-col items-center px-4 pt-[calc(var(--header-h)+1rem)] text-center sm:pt-[calc(var(--header-h)+2rem)] short:absolute short:top-0 short:left-0 short:w-[max(44%,16rem)] short:items-start short:ps-6 short:pt-[calc(var(--header-h)+0.25rem)] short:text-start"
      >
        <p data-bus-copy className="font-display text-sm font-bold tracking-tight text-neon-pink sm:text-lg short:[@media(max-height:20rem)]:hidden">
          &hellip;loud like a party bus.
        </p>
        {/* tabIndex -1: the intro moves focus here when the reveal lands, so Tab continues to the CTAs. */}
        <h1 id="intro-title" tabIndex={-1} data-bus-copy className="mt-3 font-display leading-[0.95] font-black tracking-tight outline-none short:mt-1">
          <span className="block text-(length:--h1-size) text-glow-amber short:text-[clamp(1.75rem,9svh,2.5rem)]">SMOKEY&apos;S</span>{" "}
          <span className="mt-2 block text-sm font-semibold tracking-[0.55em] text-muted-foreground sm:text-base short:text-xs">PARTY BUS</span>
        </h1>
        <p data-bus-copy className="mt-4 hidden max-w-md text-base text-pretty text-muted-foreground [@media(min-height:56rem)]:block">
          Birthdays, prom, weddings and nights out. Tell us the plan and we&apos;ll bring the party to your door.
        </p>
        {/* data-bus-ctas: made inert by IntroSequence until the reveal (only the buttons, so the H1 stays readable). */}
        <div data-bus-copy data-bus-ctas className="mt-6 flex flex-wrap items-center justify-center gap-3 short:mt-3 short:flex-nowrap short:justify-start short:gap-2">
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
