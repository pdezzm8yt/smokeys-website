import { Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { SampleTag } from "@/components/ui/sample-tag";
import { cn } from "@/lib/cn";
import type { Package } from "@/content/packages";
import { quoteHref } from "@/content/site";

export function PackagesGrid({ packages }: { packages: Package[] }) {
  return (
    <>
      <ul className="grid gap-9 md:grid-cols-3 md:items-stretch md:gap-5">
        {packages.map((p, i) => (
          <li key={p.id} className="h-full">
            <Reveal delay={i * 0.08} className="h-full">
              <article
                className={cn(
                  "relative flex h-full flex-col rounded-(--radius-card) p-7 ring-1 transition-transform duration-300 ease-enter hover:-translate-y-1 motion-reduce:hover:translate-y-0",
                  p.featured
                    ? "bg-[linear-gradient(var(--surface-raised),var(--surface-raised))_padding-box,linear-gradient(135deg,var(--neon-pink),var(--primary),var(--neon-violet))_border-box] shadow-[0_30px_80px_-30px_var(--neon-pink)] ring-transparent [border:1.5px_solid_transparent] md:-my-3 md:py-10"
                    : "bg-surface ring-white/8",
                )}
              >
                {p.featured && (
                  <p className="absolute -top-3 left-7 rounded-full bg-neon-pink px-3 py-1 text-[0.6875rem] font-bold tracking-wider text-black uppercase">
                    Featured
                  </p>
                )}
                <h3 className="font-display text-2xl font-bold">{p.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.kicker}</p>
                <p className="mt-6 font-display text-sm font-bold tracking-wide text-primary uppercase">{p.duration}</p>
                <ul className="mt-6 flex flex-col gap-3 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-3">
                      <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-8">
                  <ButtonLink
                    href={quoteHref}
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
      {packages.some((p) => p.sample) && (
        <div className="mt-8 flex justify-center">
          <SampleTag label="Sample packages · final lineup coming" />
        </div>
      )}
    </>
  );
}
