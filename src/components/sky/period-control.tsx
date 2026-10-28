"use client";

import { Check, Moon, Sun } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";
import type { Period } from "@/content/sky";
import { cn } from "@/lib/cn";
import { paintMoon } from "./sky-paint";
import { useBooking } from "./use-booking";

const OPTIONS: { period: Period; label: string; detail: string }[] = [
  { period: "day", label: "Day ride", detail: "Sunlit cruise" },
  { period: "night", label: "Night ride", detail: "Under the stars" },
];

/**
 * The day/night booking preference as a radio group (the accessible twin of
 * clicking the sun or the moon in the sky): Tab in, arrows switch. Nothing is
 * checked until the visitor chooses; the sky meanwhile follows the local time.
 * "compact" sits in the header; "large" is the Day or night section's picker.
 */
export function PeriodControl({ variant, className }: { variant: "compact" | "large"; className?: string }) {
  const { shown, chosen, choose } = useBooking();
  const buttons = useRef<Partial<Record<Period, HTMLButtonElement | null>>>({});

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const next: Period = (chosen ?? shown) === "day" ? "night" : "day";
    choose(next);
    buttons.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Ride time: day or night"
      className={cn(variant === "compact" ? "flex items-center gap-0.5 rounded-full bg-muted p-1 ring-1 ring-border" : "grid gap-4 sm:grid-cols-2", className)}
    >
      {OPTIONS.map(({ period, label, detail }) => {
        const checked = chosen === period;
        const showing = shown === period;
        const focusable = checked || (!chosen && period === "day");
        return variant === "compact" ? (
          <button
            key={period}
            ref={(el) => {
              buttons.current[period] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={label}
            title={label}
            tabIndex={focusable ? 0 : -1}
            onClick={() => choose(period)}
            onKeyDown={onKeyDown}
            className={cn(
              "grid size-8 place-items-center rounded-full transition-colors",
              checked ? "bg-primary text-primary-foreground" : showing ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {period === "day" ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
          </button>
        ) : (
          <button
            key={period}
            ref={(el) => {
              buttons.current[period] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={focusable ? 0 : -1}
            onClick={() => choose(period)}
            onKeyDown={onKeyDown}
            className={cn(
              "group relative flex items-center gap-5 rounded-(--radius-card) p-5 text-start ring-1 transition-[box-shadow,background-color] duration-300 sm:p-6",
              checked ? "bg-surface-raised shadow-[0_0_0_2px_var(--primary),0_20px_60px_-24px_var(--primary)] ring-transparent" : "bg-muted ring-border hover:ring-primary/60",
            )}
          >
            <Orb period={period} />
            <span className="flex flex-col">
              <span className="font-display text-xl font-bold">{label}</span>
              <span className="text-sm text-muted-foreground">{detail}</span>
            </span>
            {checked && (
              <span className="ms-auto grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">
                <Check aria-hidden="true" className="size-4" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The sun or the moon, as in the sky. */
function Orb({ period }: { period: Period }) {
  const moon = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (moon.current) paintMoon(moon.current);
  }, []);
  return period === "day" ? (
    <span
      aria-hidden="true"
      className="size-16 shrink-0 rounded-full bg-[radial-gradient(circle,#fffef6_0_38%,#ffe9b0_55%,transparent_71%)] shadow-[0_0_40px_10px_rgb(255_226_150/0.45)] transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none sm:size-20"
    />
  ) : (
    <span aria-hidden="true" className="size-14 shrink-0 rounded-full shadow-[0_0_36px_8px_rgb(200_214_255/0.35)] transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none sm:size-16">
      <canvas ref={moon} width={128} height={128} className="size-full rounded-full" />
    </span>
  );
}

/** One line saying what's saved for the quote (a polite live region: it's announced when it changes). */
export function PeriodStatus({ className }: { className?: string }) {
  const { chosen } = useBooking();
  return (
    <p role="status" className={cn("text-sm text-muted-foreground", className)}>
      {chosen ? (
        <>
          Saved for your quote: <strong className="font-semibold text-foreground">{chosen === "day" ? "a day ride" : "a night ride"}</strong>. You&apos;ll pick the exact date and time when you request it.
        </>
      ) : (
        <>No preference yet. Choose above, or click the sun or the moon in the sky.</>
      )}
    </p>
  );
}
