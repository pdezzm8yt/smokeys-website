"use client";

import { ClipboardList, MessageSquareText, PartyPopper } from "lucide-react";
import * as m from "motion/react-m";
import { enter, duration } from "@/lib/motion";

const STEPS = [
  { icon: ClipboardList, title: "Tell us the plan", body: "Date, pickup, stops and headcount. Takes about two minutes." },
  { icon: MessageSquareText, title: "Get your quote", body: "We confirm availability and send an exact price. No obligation." },
  { icon: PartyPopper, title: "Ride loud", body: "We pull up, lights on, playlist ready. You just show up." },
];

/**
 * The three steps: stacked down the page on small screens, a row joined by a
 * "road" line from md up. Sideways they're always a row (stacked, they're too
 * tall for a phone's screen). On phones that row runs on past the screen's
 * edge (the scene is wider: how-scene.tsx) as a timeline under the heading:
 * steps of a fixed width, aligned to the start, the line joining their icons
 * and the second step already in view when the scene arrives.
 */
export function HowItWorks() {
  return (
    <ol className="relative grid gap-10 md:grid-cols-3 md:gap-6 world:grid-cols-3 world:gap-6 max-sm:world:grid-cols-[repeat(3,12rem)] max-sm:world:gap-4">
      {/* Connecting "road" line draws itself in on scroll (sideways on a phone it's never all on screen at once: a low threshold) */}
      <m.span
        aria-hidden="true"
        className="absolute top-7 right-[16%] left-[16%] hidden h-0.5 origin-left bg-linear-to-r from-primary via-accent to-primary md:block world:block max-sm:world:right-[10.25rem] max-sm:world:left-7"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
      />
      {STEPS.map((step, i) => (
        <m.li
          key={step.title}
          className="relative flex flex-col items-center text-center max-sm:world:items-start max-sm:world:text-start"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ ...enter(duration.slow), delay: 0.15 + i * 0.18 }}
        >
          <span className="relative grid size-14 place-items-center rounded-full bg-surface-raised ring-2 ring-primary/70 shadow-[0_0_30px_-6px_var(--primary)]">
            <step.icon aria-hidden="true" className="size-6 text-gold" />
            <span className="absolute -top-1 -right-1 grid size-6 place-items-center rounded-full bg-ink text-xs font-bold text-primary ring-1 ring-primary/60">
              {i + 1}
            </span>
          </span>
          <h3 className="mt-5 font-display text-lg font-bold">{step.title}</h3>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{step.body}</p>
        </m.li>
      ))}
    </ol>
  );
}
