import { cn } from "@/lib/cn";
import { site } from "@/content/site";

/**
 * Provisional wordmark until the real Smokey's logo (SVG) is supplied via
 * `assets.brand.logo`. The glyph is a speeding roadrunner head + speed lines.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 40 28" className="h-7 w-10 shrink-0" aria-hidden="true">
        <path d="M2 10 H12 M0 15 H10 M4 20 H13" stroke="var(--neon-pink)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M16 8 L13 2 L18 6 L18 1 L21 6 L24 3 L23 8 Z" fill="var(--neon-pink)" />
        <circle cx="22" cy="14" r="7.5" fill="#2d2438" stroke="var(--foreground)" strokeWidth="1.6" />
        <path d="M28 12 Q34 12.5 39 14.5 Q34 16.5 28 16.5 Z" fill="var(--primary)" />
        <rect x="17.5" y="11" width="10" height="3.6" rx="1.8" fill="#0b0a10" />
        <path d="M20 22 L18 27 M24 22 L26 27" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="font-display text-lg leading-none font-black tracking-tight">{site.name.toUpperCase()}</span>
    </span>
  );
}
