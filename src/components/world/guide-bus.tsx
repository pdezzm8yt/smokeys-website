"use client";

import { useEffect, useRef } from "react";
import { currentAxis, worldElement } from "./world-axis";

/**
 * The party bus that carries on through the world after it drives out of the
 * tunnel: a small silhouette on the road (globals.css: the world's road),
 * appearing as the tunnel scene moves off, its wheels turning with the
 * visitor's travel (backwards when they go back), its headlights brighter at
 * night (data-sky-follow: the sky sets --night on it as it changes).
 *
 * Decoration only (aria-hidden): a generic black party bus, not a picture of
 * Smokey's own bus. Only in the sideways world.
 */
export function GuideBus() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bus = ref.current;
    if (!bus) return;
    let frame = 0;
    let idle = 0;
    const update = () => {
      frame = 0;
      const world = worldElement();
      if (!world || currentAxis() !== "x") return;
      // In once the tunnel's stage has mostly moved off the screen (it's pinned until the tunnel scene
      // ends): on the world's road, never over the film's own.
      const tunnel = document.getElementById("top");
      const right = tunnel ? tunnel.getBoundingClientRect().right : 0;
      const shown = Math.min(1, Math.max(0, (window.innerWidth * 0.55 - right) / (window.innerWidth * 0.3)));
      bus.style.opacity = String(shown);
      bus.style.translate = `${(shown - 1) * 45}% 0`;
      bus.style.visibility = shown > 0 ? "visible" : "hidden";
      // The wheels roll with the distance travelled (diameter ≈ a tenth of the bus).
      const circumference = Math.PI * 0.1 * bus.offsetWidth;
      bus.style.setProperty("--spin", `${((world.scrollLeft / Math.max(1, circumference)) * 360) % 360}deg`);
    };
    const onScroll = () => {
      frame ||= requestAnimationFrame(update);
      bus.dataset.moving = "";
      window.clearTimeout(idle);
      idle = window.setTimeout(() => delete bus.dataset.moving, 160);
    };
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
      window.clearTimeout(idle);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-sky-follow
      data-guide-bus
      className="pointer-events-none invisible fixed bottom-[calc(var(--road-h)*0.16)] left-[clamp(0.75rem,5vw,4rem)] z-20 hidden w-[clamp(7.5rem,15vw,13rem)] opacity-0 world:block"
    >
      {/* The headlights' beam on the road ahead: faint by day, bright at night. */}
      <div className="absolute top-[52%] left-[94%] h-[38%] w-[70%] origin-left bg-[radial-gradient(ellipse_at_left,rgb(255_244_214/0.85),transparent_70%)] opacity-[calc(0.12+var(--night,1)*0.75)] blur-[2px]" />
      <svg viewBox="0 0 200 74" className="guide-bus relative block w-full">
        <defs>
          <linearGradient id="guide-bus-cabin" x1="0" x2="1">
            <stop offset="0" stopColor="#5b1d6b" />
            <stop offset="0.5" stopColor="#c03dbb" />
            <stop offset="1" stopColor="#4a1d78" />
          </linearGradient>
        </defs>
        <ellipse cx="100" cy="70" rx="94" ry="3.5" fill="rgb(0 0 0 / 0.4)" />
        {/* Body, cabin windows lit from inside, windscreen, gold trim, door, lights */}
        <path d="M10 12 Q10 5 18 5 H168 Q181 5 187 15 L194 31 Q196 35 196 41 V56 Q196 62 190 62 H10 Q4 62 4 56 V18 Q4 12 10 12 Z" fill="#0c0c10" />
        <rect x="14" y="12" width="146" height="20" rx="3" fill="#120f18" />
        <rect x="16" y="14.5" width="142" height="15" rx="2" fill="url(#guide-bus-cabin)" opacity="0.55" />
        <path d="M165 12 H177 L188 31 H165 Z" fill="#161a22" />
        <rect x="6" y="41" width="188" height="2" fill="#f5b43c" />
        <rect x="148" y="35" width="13" height="23" rx="1.5" fill="#17171c" />
        <rect x="187" y="45" width="8" height="4.5" rx="1.5" fill="#fff4d6" />
        <rect x="4" y="45" width="3" height="6" rx="1" fill="#ff4a3d" />
        {[42, 160].map((cx) => (
          <g key={cx} className="guide-bus-wheel" style={{ transformOrigin: `${cx}px 61px` }}>
            <circle cx={cx} cy="61" r="10.5" fill="#050506" />
            <circle cx={cx} cy="61" r="5.5" fill="#3b3b42" />
            <path d={`M${cx - 5} 61 H${cx + 5} M${cx} 56 V66`} stroke="#0c0c10" strokeWidth="1.6" />
          </g>
        ))}
      </svg>
    </div>
  );
}
