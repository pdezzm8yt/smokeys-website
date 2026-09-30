"use client";

import {
  ArrowLeft, ArrowRight, Cake, Crown, Gem, GlassWater, Moon, Music, PartyPopper, Sparkles, Trophy, Users, type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { cn } from "@/lib/cn";
import type { Occasion, OccasionIcon } from "@/content/occasions";
import { quoteHref } from "@/content/site";

const ICONS: Record<OccasionIcon, LucideIcon> = {
  cake: Cake, crown: Crown, rings: Gem, glass: GlassWater, moon: Moon, music: Music,
  trophy: Trophy, party: PartyPopper, users: Users, sparkles: Sparkles,
};

/** Spotlight that follows the pointer (CSS variables, no re-render). */
function trackPointer(e: PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}

export function OccasionsRail({ occasions }: { occasions: Occasion[] }) {
  const railRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const updateEdges = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const start = el.scrollLeft <= 4;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useEffect(() => {
    updateEdges();
    window.addEventListener("resize", updateEdges);
    return () => window.removeEventListener("resize", updateEdges);
  }, [updateEdges]);

  const page = (dir: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div className="relative">
      <div className="mb-6 flex justify-end gap-2">
        {([-1, 1] as const).map((dir) => {
          const Icon = dir === -1 ? ArrowLeft : ArrowRight;
          const disabled = dir === -1 ? edges.start : edges.end;
          return (
            <button
              key={dir}
              type="button"
              onClick={() => page(dir)}
              disabled={disabled}
              className="grid size-11 place-items-center rounded-full bg-white/6 ring-1 ring-white/12 transition-[background-color,opacity] hover:bg-white/12 disabled:opacity-35"
            >
              <Icon aria-hidden="true" className="size-5" />
              <span className="sr-only">{dir === -1 ? "Previous occasions" : "Next occasions"}</span>
            </button>
          );
        })}
      </div>

      <ul
        ref={railRef}
        onScroll={updateEdges}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:-mx-8 lg:scroll-px-8 lg:px-8 [&::-webkit-scrollbar]:hidden"
      >
        {occasions.map((o, i) => {
          const Icon = ICONS[o.icon];
          return (
            <li key={o.slug} className="w-[min(78vw,19rem)] shrink-0 snap-start">
              <a
                href={quoteHref}
                onPointerMove={trackPointer}
                className={cn(
                  "group relative flex h-full min-h-64 flex-col overflow-hidden rounded-(--radius-card) bg-surface p-6 ring-1 ring-white/8",
                  "transition-[transform,box-shadow] duration-300 ease-enter hover:-translate-y-1 hover:shadow-[0_24px_60px_-20px_var(--neon-violet)] hover:ring-white/20",
                  "motion-reduce:hover:translate-y-0",
                )}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 [background:radial-gradient(18rem_circle_at_var(--mx,50%)_var(--my,50%),oklch(0.7_0.24_350/0.16),transparent_60%)]"
                />
                <span className="flex items-center justify-between">
                  <span className="grid size-12 place-items-center rounded-2xl bg-linear-to-br from-neon-pink/25 to-neon-violet/20 text-neon-pink ring-1 ring-white/10">
                    <Icon aria-hidden="true" className="size-6" />
                  </span>
                  <span aria-hidden="true" className="font-display text-xs text-white/25 tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </span>
                <span className="mt-6 font-display text-xl font-bold">{o.title}</span>
                <span className="mt-2 text-sm leading-relaxed text-muted-foreground">{o.blurb}</span>
                <span className="mt-auto flex items-center gap-2 pt-6 text-sm font-semibold text-primary">
                  Plan this ride
                  <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
