"use client";

import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import Image from "next/image";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { BusInterior } from "@/components/art/bus-interior";
import { PartyBus } from "@/components/art/party-bus";
import { SampleTag } from "@/components/ui/sample-tag";
import { cn } from "@/lib/cn";
import { duration, enter, exit, spring } from "@/lib/motion";
import { assets } from "@/content/assets";
import { exteriorHotspots, interiorHotspots, type Hotspot } from "@/content/bus";

// Each view's art box takes its image's exact aspect ratio (hotspots are % of
// that box), then fits the panel: wide images by width, tall ones by height.
const VIEWS = [
  {
    id: "exterior",
    label: "Exterior",
    hotspots: exteriorHotspots,
    media: assets.bus.exterior,
    box: "w-full",
    fallbackRatio: "1200 / 440",
    fallback: <PartyBus idPrefix="meet-bus" className="absolute inset-0 size-full" />,
  },
  {
    id: "interior",
    label: "Interior",
    hotspots: interiorHotspots,
    media: assets.bus.interior,
    box: "h-full",
    fallbackRatio: "1200 / 640",
    fallback: <BusInterior className="absolute inset-0 size-full" />,
  },
] as const;

type ViewId = (typeof VIEWS)[number]["id"];

export function MeetTheBus() {
  const [view, setView] = useState<ViewId>("exterior");
  const [activeId, setActiveId] = useState<string>(exteriorHotspots[0]?.id ?? "");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const uid = useId();

  const current = VIEWS.find((v) => v.id === view) ?? VIEWS[0];
  const active: Hotspot | undefined = current.hotspots.find((h) => h.id === activeId) ?? current.hotspots[0];

  const selectView = (id: ViewId) => {
    setView(id);
    setActiveId(VIEWS.find((v) => v.id === id)?.hotspots[0]?.id ?? "");
  };

  // APG tabs: arrows move + activate, Home/End jump.
  const onTabKey = (e: KeyboardEvent, index: number) => {
    const last = VIEWS.length - 1;
    const next =
      e.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    const target = VIEWS[next];
    if (!target) return;
    selectView(target.id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="flex flex-col gap-5">
        <div role="tablist" aria-label="Bus view" className="inline-flex self-start rounded-full bg-muted p-1 ring-1 ring-border">
          {VIEWS.map((v, i) => {
            const selected = v.id === view;
            return (
              <button
                key={v.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                role="tab"
                id={`${uid}-tab-${v.id}`}
                aria-selected={selected}
                aria-controls={`${uid}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectView(v.id)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={cn(
                  "relative min-h-11 rounded-full px-6 text-sm font-semibold transition-colors",
                  selected ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {selected && (
                  <m.span layoutId={`${uid}-pill`} transition={spring.snappy} className="absolute inset-0 rounded-full bg-primary" aria-hidden="true" />
                )}
                <span className="relative">{v.label}</span>
              </button>
            );
          })}
        </div>

        <div
          id={`${uid}-panel`}
          role="tabpanel"
          data-sky-follow
          aria-labelledby={`${uid}-tab-${view}`}
          className="relative overflow-hidden rounded-(--radius-card) bg-[linear-gradient(to_bottom,var(--sky-top),var(--sky-mid)_60%,var(--sky-horizon))] ring-1 ring-border"
        >
          <div className="relative aspect-[16/10] w-full">
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={view}
                className="absolute inset-0"
                initial={{ opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1, transition: enter(duration.moderate) }}
                exit={{ opacity: 0, scale: 0.98, transition: exit(duration.moderate) }}
              >
                <div className="absolute inset-0 flex items-center justify-center p-[4%]">
                  <div
                    className={cn("relative max-h-full max-w-full", current.box)}
                    style={{
                      aspectRatio: current.media.src ? `${current.media.src.width} / ${current.media.src.height}` : current.fallbackRatio,
                    }}
                  >
                    {current.media.src ? (
                      <Image
                        src={current.media.src}
                        alt={current.media.alt}
                        fill
                        sizes="(min-width: 1024px) 60vw, 92vw"
                        quality={85}
                        className={cn("object-contain", current.id === "interior" && "rounded-xl")}
                      />
                    ) : (
                      current.fallback
                    )}
                    {current.media.src && <BusLight view={current.id} src={current.media.src.src} />}

                    {current.hotspots.map((h) => {
                      const isActive = h.id === active?.id;
                      return (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => setActiveId(h.id)}
                          aria-pressed={isActive}
                          style={{ left: `${h.x}%`, top: `${h.y}%` }}
                          className="group absolute grid size-11 -translate-1/2 place-items-center rounded-full"
                        >
                          <span className="sr-only">{h.label}</span>
                          <span
                            aria-hidden="true"
                            className={cn(
                              "absolute size-8 rounded-full border-2 border-primary/70 motion-safe:animate-ping",
                              isActive && "border-accent",
                            )}
                          />
                          <span
                            aria-hidden="true"
                            className={cn(
                              "relative size-4 rounded-full bg-primary shadow-[0_0_18px_var(--primary)] ring-4 ring-black/40 transition-transform duration-200 group-hover:scale-125",
                              isActive && "scale-125 bg-accent shadow-[0_0_22px_var(--accent)]",
                            )}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </m.div>
            </AnimatePresence>
          </div>
          {current.media.placeholder && (
            <SampleTag label={current.media.src ? "Sample photo · confirm before launch" : "Illustration · real photos coming"} className="absolute top-3 right-3" />
          )}
        </div>
      </div>

      {/* Feature list mirrors the hotspots: big tap targets, readable on phones. */}
      <div className="flex flex-col gap-3 lg:pt-16">
        <ul className="flex flex-col gap-2" aria-label={`${current.label} features`}>
          {current.hotspots.map((h) => {
            const isActive = h.id === active?.id;
            return (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(h.id)}
                  aria-expanded={isActive}
                  className={cn(
                    "w-full rounded-2xl px-5 py-4 text-start ring-1 transition-[background-color,box-shadow] duration-200",
                    isActive ? "bg-surface-raised ring-primary/60" : "bg-muted ring-border hover:bg-surface-raised hover:ring-primary/40",
                  )}
                >
                  <span className="flex items-center gap-3 font-semibold">
                    <span aria-hidden="true" className={cn("size-2 rounded-full", isActive ? "bg-accent" : "bg-primary/60")} />
                    {h.label}
                  </span>
                  <AnimatePresence initial={false}>
                    {isActive && (
                      <m.span
                        key="body"
                        className="block overflow-hidden"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1, transition: enter(duration.moderate) }}
                        exit={{ height: 0, opacity: 0, transition: exit(duration.moderate) }}
                      >
                        <span className="block pt-2 ps-5 text-sm leading-relaxed text-muted-foreground">{h.body}</span>
                      </m.span>
                    )}
                  </AnimatePresence>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * The bus in the light of the sky (--night: 0 by day … 1 by night, set by
 * the sky as it changes): by day warm sunlight from the sun's side; by night
 * a cooler, darker grade, and its headlights and roof marker lights glow.
 * The grade follows the photo's own outline (a mask of the cut-out), so only
 * the bus is lit, never the sky behind it.
 */
function BusLight({ view, src }: { view: ViewId; src: string }) {
  if (view !== "exterior") {
    // The interior: its LED strips stand out more at night.
    return <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-xl bg-[#0b1a4a] opacity-[calc(var(--night)*0.25)] mix-blend-multiply" />;
  }
  const mask = { maskImage: `url(${src})`, WebkitMaskImage: `url(${src})`, maskSize: "100% 100%", WebkitMaskSize: "100% 100%" };
  const glow = (x: number, y: number, size: string, colour: string) => (
    <span
      className="absolute -translate-1/2 rounded-full opacity-[var(--night)]"
      style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, background: `radial-gradient(circle, ${colour}, transparent 65%)` }}
    />
  );
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      <span className="absolute inset-0" style={mask}>
        <span className="absolute inset-0 bg-[linear-gradient(200deg,var(--sky-light),transparent_55%)] opacity-[calc((1-var(--night))*0.55)] mix-blend-soft-light" />
        <span className="absolute inset-0 bg-[#0b1a4a] opacity-[calc(var(--night)*0.42)] mix-blend-multiply" />
      </span>
      {glow(71.5, 61, "14%", "rgb(255 250 230 / 0.95)")}
      {glow(98.5, 62, "9%", "rgb(255 250 230 / 0.8)")}
      {glow(73.5, 76.5, "6%", "rgb(255 245 220 / 0.7)")}
      {[57.5, 60, 62.5, 65].map((x) => (
        <span key={x}>{glow(x, 3.4, "3.2%", "rgb(255 190 90 / 0.95)")}</span>
      ))}
    </span>
  );
}
