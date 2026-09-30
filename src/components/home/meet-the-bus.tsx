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
        <div role="tablist" aria-label="Bus view" className="inline-flex self-start rounded-full bg-white/6 p-1 ring-1 ring-white/10">
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
          aria-labelledby={`${uid}-tab-${view}`}
          className="relative overflow-hidden rounded-(--radius-card) bg-[radial-gradient(ellipse_at_50%_80%,oklch(0.25_0.08_300),#07070a_70%)] ring-1 ring-white/10"
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
                              isActive && "border-neon-pink",
                            )}
                          />
                          <span
                            aria-hidden="true"
                            className={cn(
                              "relative size-4 rounded-full bg-primary shadow-[0_0_18px_var(--primary)] ring-4 ring-black/40 transition-transform duration-200 group-hover:scale-125",
                              isActive && "scale-125 bg-neon-pink shadow-[0_0_22px_var(--neon-pink)]",
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
          {current.media.placeholder && <SampleTag label="Illustration · real photos coming" className="absolute top-3 right-3" />}
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
                    isActive ? "bg-surface-raised ring-primary/50" : "bg-surface/60 ring-white/8 hover:bg-surface hover:ring-white/15",
                  )}
                >
                  <span className="flex items-center gap-3 font-semibold">
                    <span aria-hidden="true" className={cn("size-2 rounded-full", isActive ? "bg-neon-pink" : "bg-primary/60")} />
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
