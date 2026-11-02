import { Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/cn";
import type { Package } from "@/content/packages";
import { quoteHref } from "@/content/site";

/**
 * The package cards: stacked on phones and a row of three from md down the
 * page. Sideways they're always a row (one column per card, no wrapping):
 * phone-wide columns below xl (the scene runs along the world), sharing the
 * width beside the heading from xl (the scene fits one screen). The Sample tag
 * is the scene's (../scenes/packages-scene.tsx).
 */
export function PackagesGrid({ packages, className }: { packages: Package[]; className?: string }) {
  return (
    <ul
      className={cn(
        "grid gap-9 md:grid-cols-3 md:items-stretch md:gap-5",
        "world:grid-flow-col world:auto-cols-[min(100vw-5rem,22rem)] world:items-stretch world:gap-5 md:world:grid-cols-none xl:world:auto-cols-fr",
        className,
      )}
    >
      {packages.map((p, i) => (
        <li key={p.id} className="h-full">
          <Reveal delay={i * 0.08} className="h-full">
            <article
              className={cn(
                "relative flex h-full flex-col rounded-(--radius-card) p-7 ring-1 transition-transform duration-300 ease-enter hover:-translate-y-1 motion-reduce:hover:translate-y-0",
                p.featured
                  ? "bg-[linear-gradient(var(--surface-raised),var(--surface-raised))_padding-box,linear-gradient(135deg,var(--primary),var(--accent),var(--primary))_border-box] shadow-[0_30px_80px_-30px_var(--primary)] ring-transparent [border:1.5px_solid_transparent] md:-my-3 md:py-10 world:-my-3 world:py-10"
                  : "bg-surface-raised ring-border",
              )}
            >
              {p.featured && (
                <p className="absolute -top-3 left-7 rounded-full bg-ink px-3 py-1 text-[0.6875rem] font-bold tracking-wider text-primary uppercase ring-1 ring-primary/60">
                  Featured
                </p>
              )}
              <h3 className="font-display text-2xl font-bold">{p.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.kicker}</p>
              <p className="mt-6 font-display text-sm font-bold tracking-wide text-gold uppercase">{p.duration}</p>
              <ul className="mt-6 flex flex-col gap-3 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-3">
                    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-gold" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-8">
                <ButtonLink
                  href={quoteHref}
                  data-action="quote"
                  data-book-package={p.name}
                  variant={p.featured ? "primary" : "secondary"}
                  className="w-full"
                  aria-label={`Request pricing for ${p.name}`}
                >
                  Request pricing
                </ButtonLink>
              </div>
            </article>
          </Reveal>
        </li>
      ))}
    </ul>
  );
}
