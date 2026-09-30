import { Mail, MapPin, Phone } from "lucide-react";
import { SampleTag } from "@/components/ui/sample-tag";
import { nav, quoteHref, site } from "@/content/site";
import { Logo } from "./logo";

export function SiteFooter() {
  const { phone, email, serviceArea } = site.contact;
  const year = new Date().getFullYear();

  return (
    <footer className="relative border-t border-white/8 bg-[#08080a]">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-neon-pink/50 to-transparent" />
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
              <a href={quoteHref} className="inline-block py-1.5 text-sm text-primary transition-colors hover:text-foreground">
                Request a Quote
              </a>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-foreground uppercase">
            Contact {phone.sample && <SampleTag />}
          </h2>
          <ul className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground">
            <li>
              <a href={phone.href} className="inline-flex items-center gap-3 py-1 transition-colors hover:text-foreground">
                <Phone aria-hidden="true" className="size-4 text-primary" /> {phone.display}
              </a>
            </li>
            <li>
              <a href={email.href} className="inline-flex items-center gap-3 py-1 break-all transition-colors hover:text-foreground">
                <Mail aria-hidden="true" className="size-4 shrink-0 text-primary" /> {email.display}
              </a>
            </li>
            <li className="inline-flex items-center gap-3 py-1">
              <MapPin aria-hidden="true" className="size-4 text-primary" /> {serviceArea.display}
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/6">
        <p className="mx-auto max-w-7xl px-4 py-6 text-xs text-muted-foreground sm:px-6 lg:px-8">
          &copy; {year} {site.legalName}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
