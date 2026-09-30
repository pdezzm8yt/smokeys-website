import { cn } from "@/lib/cn";

/**
 * Marks placeholder content (sample photos, unconfirmed specs) so it is never
 * mistaken for the real Smokey's bus or policies. Remove by setting
 * `sample: false` / `placeholder: false` in src/content once confirmed.
 */
export function SampleTag({ label = "Sample", className }: { label?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-dashed border-white/30 bg-black/40 px-2 py-0.5",
        "text-[0.6875rem] font-medium tracking-wide text-white/75 uppercase backdrop-blur-sm",
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-primary/80" />
      {label}
    </span>
  );
}
