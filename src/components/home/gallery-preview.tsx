"use client";

import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { PartyBus } from "@/components/art/party-bus";
import { SampleTag } from "@/components/ui/sample-tag";
import { cn } from "@/lib/cn";
import { duration, enter, exit, spring } from "@/lib/motion";
import type { GalleryItem } from "@/content/gallery";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "exterior", label: "Exterior" },
  { id: "interior", label: "Interior" },
  { id: "events", label: "Events" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

/** Stand-in tile until real photos land: neon light study, clearly labelled. */
function SampleArt({ item, large = false }: { item: GalleryItem; large?: boolean }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden bg-[#0a0a0e]"
      style={{
        backgroundImage: `radial-gradient(60% 50% at 30% 30%, oklch(0.62 0.22 ${item.hue} / 0.55), transparent 70%), radial-gradient(50% 60% at 75% 75%, oklch(0.55 0.2 ${(item.hue + 60) % 360} / 0.5), transparent 70%)`,
      }}
    >
      {item.category !== "interior" && (
        <div className="absolute inset-x-[8%] bottom-[14%] opacity-70">
          <PartyBus idPrefix={`g-${item.id}${large ? "-lg" : ""}`} className="w-full" />
        </div>
      )}
      <div className="bg-grain absolute inset-0 opacity-10 mix-blend-overlay" />
    </div>
  );
}

function Media({ item, large = false, sizes }: { item: GalleryItem; large?: boolean; sizes: string }) {
  return item.src ? (
    <Image src={item.src} alt={item.alt} fill sizes={sizes} className="object-cover" />
  ) : (
    <SampleArt item={item} large={large} />
  );
}

export function GalleryPreview({ items }: { items: GalleryItem[] }) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const visible = filter === "all" ? items : items.filter((i) => i.category === filter);
  const current = openIndex === null ? undefined : visible[openIndex];

  const open = (index: number, trigger: HTMLElement) => {
    triggerRef.current = trigger;
    setOpenIndex(index);
    dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();
  const step = (dir: 1 | -1) => {
    setDirection(dir);
    setOpenIndex((i) => (i === null ? i : (i + dir + visible.length) % visible.length));
  };

  // Native dialog handles Esc + focus trap; we restore focus and add arrow keys.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      setOpenIndex(null);
      triggerRef.current?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    dialog.addEventListener("close", onClose);
    dialog.addEventListener("keydown", onKey);
    return () => {
      dialog.removeEventListener("close", onClose);
      dialog.removeEventListener("keydown", onKey);
    };
  });

  return (
    <div className="flex flex-col gap-8">
      <div role="group" aria-label="Filter photos" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = f.id === filter;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f.id)}
              className={cn(
                "relative min-h-11 rounded-full px-5 text-sm font-semibold ring-1 transition-colors",
                active ? "text-primary-foreground ring-transparent" : "text-muted-foreground ring-white/12 hover:text-foreground hover:ring-white/25",
              )}
            >
              {active && <m.span layoutId="gallery-filter" transition={spring.snappy} aria-hidden="true" className="absolute inset-0 rounded-full bg-primary" />}
              <span className="relative">{f.label}</span>
            </button>
          );
        })}
      </div>

      <m.ul layout className="grid auto-rows-[11rem] grid-cols-2 gap-3 sm:auto-rows-[14rem] md:grid-cols-3 md:gap-4">
        <AnimatePresence mode="popLayout" initial={false}>
          {visible.map((item, i) => (
            <m.li
              key={item.id}
              layout
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1, transition: enter(duration.moderate) }}
              exit={{ opacity: 0, scale: 0.94, transition: exit(duration.moderate) }}
              className={cn(item.tall && "row-span-2")}
            >
              <button
                type="button"
                onClick={(e) => open(i, e.currentTarget)}
                className="group relative block size-full overflow-hidden rounded-2xl ring-1 ring-white/8"
              >
                <span className="absolute inset-0 transition-transform duration-500 ease-enter group-hover:scale-105 motion-reduce:group-hover:scale-100">
                  <Media item={item} sizes="(min-width: 768px) 33vw, 50vw" />
                </span>
                <span className="absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-transparent opacity-80" />
                <span className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2 text-start">
                  <span className="text-xs font-medium text-white/90 capitalize">{item.category}</span>
                  <Expand aria-hidden="true" className="size-4 text-white/70 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                </span>
                {!item.src && <SampleTag className="absolute top-3 left-3" />}
                <span className="sr-only">Open: {item.alt}</span>
              </button>
            </m.li>
          ))}
        </AnimatePresence>
      </m.ul>

      <dialog
        ref={dialogRef}
        aria-label="Photo viewer"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="m-auto size-full max-h-none max-w-none bg-transparent p-0 text-foreground backdrop:bg-black/85 backdrop:backdrop-blur-md"
      >
        {current && openIndex !== null && (
          <div className="pointer-events-none flex size-full flex-col items-center justify-center gap-4 p-4 sm:p-10">
            <div className="pointer-events-auto relative aspect-[4/3] w-full max-w-5xl overflow-hidden rounded-2xl bg-black ring-1 ring-white/10 max-sm:aspect-[3/4]">
              <AnimatePresence initial={false} custom={direction} mode="popLayout">
                <m.div
                  key={current.id}
                  custom={direction}
                  className="absolute inset-0 touch-pan-y"
                  variants={{
                    enter: (d: number) => ({ opacity: 0, x: d * 60 }),
                    center: { opacity: 1, x: 0 },
                    leave: (d: number) => ({ opacity: 0, x: d * -60 }),
                  }}
                  initial="enter"
                  animate="center"
                  exit="leave"
                  transition={spring.default}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.3}
                  onDragEnd={(_, info) => {
                    if (info.offset.x < -60 || info.velocity.x < -400) step(1);
                    else if (info.offset.x > 60 || info.velocity.x > 400) step(-1);
                  }}
                >
                  <Media item={current} large sizes="(min-width: 1024px) 64rem, 100vw" />
                </m.div>
              </AnimatePresence>
              {!current.src && <SampleTag label="Sample image" className="absolute top-4 left-4" />}
            </div>

            <div className="pointer-events-auto flex w-full max-w-5xl items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                <span className="text-foreground tabular-nums">
                  {openIndex + 1} / {visible.length}
                </span>{" "}
                &middot; {current.alt}
              </p>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => step(-1)} className="grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20">
                  <ChevronLeft aria-hidden="true" className="size-5" />
                  <span className="sr-only">Previous photo</span>
                </button>
                <button type="button" onClick={() => step(1)} className="grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20">
                  <ChevronRight aria-hidden="true" className="size-5" />
                  <span className="sr-only">Next photo</span>
                </button>
                <button type="button" onClick={close} className="grid size-11 place-items-center rounded-full bg-white text-black hover:bg-white/85">
                  <X aria-hidden="true" className="size-5" />
                  <span className="sr-only">Close</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
