"use client";

import * as m from "motion/react-m";
import type { ReactNode } from "react";
import { revealVariants } from "@/lib/motion";

/**
 * Fades + lifts content in once as it scrolls into view. Used sparingly on
 * section content, never on above-the-fold/LCP content.
 */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <m.div
      className={className}
      variants={
        delay
          ? { ...revealVariants, shown: { ...revealVariants.shown, transition: { ...revealVariants.shown.transition, delay } } }
          : revealVariants
      }
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.25 }}
    >
      {children}
    </m.div>
  );
}
