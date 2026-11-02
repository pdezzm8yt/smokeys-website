import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Native <details>: keyboard + screen-reader support for free, animated where
 * supported (globals.css). One card of questions down the page and on larger
 * screens (sideways on a short screen, a little tighter: down to 56px rows on
 * the shortest phones). Sideways on a phone the card is too tall for the
 * screen, so it splits into two cards side by side along the world (each a
 * screen wide), the `note` under the second; they stay one accordion (`name`).
 * The two halves are always in the markup: down the page they're
 * `display: contents`, invisible to layout.
 */
export function FaqList({ faqs, note }: { faqs: readonly { q: string; a: string }[]; note?: ReactNode }) {
  const half = Math.ceil(faqs.length / 2);
  const halves = [faqs.slice(0, half), faqs.slice(half)].filter((h) => h.length);

  return (
    // Sideways on a phone: a grid of two screen-wide columns, the first half spanning both rows, the note under the second.
    <div className="max-sm:world:grid max-sm:world:grid-cols-[repeat(2,calc(100vw-4rem))] max-sm:world:grid-rows-[auto_1fr] max-sm:world:gap-x-6">
      <div className="rounded-(--radius-card) bg-surface-raised ring-1 ring-border max-sm:world:contents">
        {/* Each half: no box down the page (the card's dividers run straight through), its own card sideways on a phone. */}
        {halves.map((items, h) => (
          <div
            key={h}
            className={cn(
              "contents max-sm:world:block max-sm:world:self-start max-sm:world:rounded-(--radius-card) max-sm:world:bg-surface-raised max-sm:world:ring-1 max-sm:world:ring-border",
              h === 0 && "max-sm:world:row-span-2",
            )}
          >
            {items.map((f, j) => {
              const i = h * half + j;
              return (
                <details
                  key={f.q}
                  name="faq"
                  className={cn("group px-6 max-sm:world:px-5", i < faqs.length - 1 && "border-b border-border max-sm:world:last:border-b-0")}
                  open={i === 0}
                >
                  <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-5 font-semibold transition-colors hover:text-gold max-sm:world:min-h-14 max-sm:world:gap-4 max-sm:world:py-4 max-sm:world:[@media(max-height:37.5rem)]:py-3 sm:world:[@media(max-height:48rem)]:py-4 [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span
                      aria-hidden="true"
                      className="grid size-8 shrink-0 place-items-center rounded-full bg-muted transition-transform duration-300 ease-enter group-open:rotate-45 group-open:bg-primary group-open:text-primary-foreground"
                    >
                      <Plus className="size-4" />
                    </span>
                  </summary>
                  <p className="max-w-prose pb-6 leading-relaxed text-muted-foreground max-sm:world:pb-5 max-sm:world:[@media(max-height:37.5rem)]:pb-4 sm:world:[@media(max-height:48rem)]:pb-5">{f.a}</p>
                </details>
              );
            })}
          </div>
        ))}
      </div>
      {note && <div className="contents max-sm:world:col-start-2 max-sm:world:row-start-2 max-sm:world:block">{note}</div>}
    </div>
  );
}
