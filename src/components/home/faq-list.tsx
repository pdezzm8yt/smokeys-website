import { Plus } from "lucide-react";

/** Native <details>: keyboard + screen-reader support for free, animated where supported (globals.css). */
export function FaqList({ faqs }: { faqs: readonly { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-white/8 rounded-(--radius-card) bg-surface/60 ring-1 ring-white/8">
      {faqs.map((f, i) => (
        <details key={f.q} name="faq" className="group px-6" open={i === 0}>
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-5 font-semibold transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
            {f.q}
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-white/6 transition-transform duration-300 ease-enter group-open:rotate-45 group-open:bg-primary group-open:text-primary-foreground"
            >
              <Plus className="size-4" />
            </span>
          </summary>
          <p className="max-w-prose pb-6 leading-relaxed text-muted-foreground">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
