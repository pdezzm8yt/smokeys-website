import { Mail, MapPin, Phone } from "lucide-react";
import { SampleTag } from "@/components/ui/sample-tag";
import { nav, quoteHref, site } from "@/content/site";
import { Logo } from "./logo";

/**
 * The footer: the end of the homepage's world (its last scene, sideways: a
 * glass panel filling the screen's height), and the foot of every other page.
 */
export function SiteFooter() {
  const { phone, email, serviceArea } = site.contact;
  const year = new Date().getFullYear();

  return (
    <footer
      id="footer"
      data-panel
      data-scene
      className="glass relative rounded-t-[2rem] border-b-0 world:my-[calc(var(--header-h)+0.75rem)] world:me-3 world:mb-[calc(var(--road-h)+0.75rem)] world:flex world:w-[min(72rem,calc(100vw-1.5rem))] world:flex-none world:items-center world:overflow-y-auto world:rounded-[1.75rem] sm:world:me-5"
    >
      <div aria-hidden="true" className="absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-primary/70 to-transparent" />
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div className="flex flex-col gap-4">
          <Logo />
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">{site.tagline}</p>
        </div>

        <nav aria-label="Footer">
          <h2 className="text-xs font-semibold tracking-[0.2em] text-foreground uppercase">Explore</h2>
          <ul className="mt-4 flex flex-col gap-1">
            {nav.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="inline-block py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <a href={quoteHref} className="inline-block py-1.5 text-sm text-gold transition-colors hover:text-foreground">
                Request a Quote
              </a>
            </li>
          </ul>
        </nav>

        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold tracking-[0.2em] text-foreground uppercase">Contact</h2>
            {phone.sample && <SampleTag />}
          </div>
          <ul className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground">
            <li>
              <a href={phone.href} className="inline-flex items-center gap-3 py-1 transition-colors hover:text-foreground">
                <Phone aria-hidden="true" className="size-4 text-gold" /> {phone.display}
              </a>
            </li>
            <li>
              <a href={email.href} className="inline-flex items-center gap-3 py-1 break-all transition-colors hover:text-foreground">
                <Mail aria-hidden="true" className="size-4 shrink-0 text-gold" /> {email.display}
              </a>
            </li>
            <li className="inline-flex items-center gap-3 py-1">
              <MapPin aria-hidden="true" className="size-4 text-gold" /> {serviceArea.display}
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-7xl px-4 py-6 text-xs text-muted-foreground sm:px-6 lg:px-8">
          &copy; {year} {site.legalName}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
