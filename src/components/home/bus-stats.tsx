"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { SampleTag } from "@/components/ui/sample-tag";
import type { Fact } from "@/content/bus";

const format = new Intl.NumberFormat("en-US");

function Counter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || !inView) return;
    if (reduce) {
      el.textContent = format.format(value) + suffix;
      return;
    }
    // Writes straight to the DOM: no React re-render per frame.
    const controls = animate(0, value, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = format.format(Math.round(v)) + suffix;
      },
    });
    return () => controls.stop();
  }, [inView, reduce, value, suffix]);

  // Server/no-JS render shows the real number; the count-up starts from 0 on view.
  return (
    <span ref={ref} className="tabular-nums">
      {format.format(value) + suffix}
    </span>
  );
}

export function BusStats({ facts }: { facts: Fact[] }) {
  const anySample = facts.some((f) => f.sample);

  return (
    <section aria-label="Smokey's at a glance" className="relative border-y border-white/8 bg-surface/60">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label} className="flex flex-col-reverse gap-1 text-center md:border-s md:border-white/8 md:first:border-s-0">
              <dt className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">{fact.label}</dt>
              <dd className="font-display text-3xl font-black tracking-tight text-foreground sm:text-4xl">
                <Counter value={fact.value} suffix={fact.suffix} />
              </dd>
            </div>
          ))}
        </dl>
        {anySample && (
          <div className="mt-6 flex justify-center">
            <SampleTag label="Sample specs · confirm before launch" />
          </div>
        )}
      </div>
    </section>
  );
}
