"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { SKY_KEYS } from "@/content/sky";
import { getBooking, skyPeriod, subscribeBooking, updateBooking } from "@/lib/booking-store";
import { SkyEngine } from "./sky-engine";

/**
 * The living sky behind every page: day (blue sky, sun and rays, white
 * clouds) or night (navy sky, moon, twinkling stars, the odd shooting star),
 * following the visitor's day/night booking preference (or the local time of
 * day until they choose). Clicking the sun or the moon in the sky chooses.
 * Decorative (aria-hidden): the same choice is a labelled control in the
 * header and the "Day or night?" section. All the work is in ./sky-engine.
 */
export function LivingSky() {
  const ref = useRef<HTMLDivElement>(null);
  const engine = useRef<SkyEngine | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const sky = new SkyEngine(root, skyPeriod(), { onPick: (period) => updateBooking({ period }) });
    engine.current = sky;
    sky.start();
    let last = skyPeriod();
    const unsubscribe = subscribeBooking(() => {
      const next = skyPeriod(getBooking());
      if (next === last) return;
      last = next;
      sky.setPeriod(next);
    });
    return () => {
      unsubscribe();
      sky.destroy();
      engine.current = null;
    };
  }, []);

  // A new page renders its own #main (the sky pauses under the homepage's intro by watching it).
  useEffect(() => {
    engine.current?.observeMain();
  }, [pathname]);

  return (
    <div ref={ref} data-sky-layer aria-hidden="true" className="living-sky pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* The gradient: one static layer per keyframe (day, sunset, twilight, night), crossfaded by
          opacity as the sky changes: the GPU blends them, nothing is repainted. */}
      <div className="absolute inset-0">
        {SKY_KEYS.map((k, i) => (
          <div
            key={k.at}
            data-sky-key={i}
            className="absolute inset-0"
            style={{ background: `linear-gradient(to bottom, ${k.top}, ${k.mid} 55%, ${k.horizon})` }}
          />
        ))}
      </div>
      {/* Fine grain over the gradient: no banding in the deep night blues. */}
      <div className="bg-grain absolute inset-0 opacity-[0.05] mix-blend-overlay" />
      <div data-sky-stars className="absolute inset-0 opacity-0">
        <canvas className="absolute inset-0 size-full" />
        <canvas className="absolute inset-0 size-full" />
        <canvas className="absolute inset-0 size-full" />
      </div>
      {/* The sun: a white midday version and a warm sunset version of its disk and glow, crossfaded. */}
      <div data-sky-sun className="sky-body">
        <div data-sky-rays />
        <div className="sun-glow" />
        <div data-sky-sun-warm className="sun-glow sun-glow-warm opacity-0" />
        <div className="sun-disk" />
        <div data-sky-sun-warm className="sun-disk sun-disk-warm opacity-0" />
      </div>
      <div data-sky-moon className="sky-body opacity-30">
        <div data-sky-moon-glow className="moon-glow opacity-0" />
        <canvas width={168} height={168} />
      </div>
      <span data-sky-shooting />
      <canvas data-sky-clouds className="absolute inset-0 size-full" />
    </div>
  );
}
