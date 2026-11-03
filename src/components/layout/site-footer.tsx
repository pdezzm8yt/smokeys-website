import { Mail, MapPin, Phone } from "lucide-react";
import { SampleTag } from "@/components/ui/sample-tag";
import { nav, quoteHref, site } from "@/content/site";
import { cn } from "@/lib/cn";
import { Logo } from "./logo";

/**
 * The footer: the foot of every page, and the homepage world's last stop.
 *
 * Down the page and on every other page it's the classic footer (its wrapper
 * is a plain block there). Sideways (only in the homepage's world: `world:`
 * classes) the wrapper is the stop, like a Scene's section: the screen's
 * height between the header and the road, and the screen's width from `sm` up
 * (the footer has the world's final screen to itself); the footer is its
 * glass panel, as tall as its content, centred. Being the stop's panel (not
 * the stop) it glides in like every scene's panel without throwing off where
 * the world measures the stop.
 *
 * Sideways its columns sit side by side, the Explore links in two short
 * columns: brand, Explore and Contact in a row on a large screen; brand over
 * Explore, beside Contact, on a tablet; and on a phone the same two columns a
 * screen wide each, so the panel runs on past the screen (a swipe through it,
 * ending on the contact details and the copyright, right-aligned to be on that
 * last screen).
 */
export function SiteFooter() {
  const { phone, email, serviceArea } = site.contact;
  const year = new Date().getFullYear();

  return (
    <div
      id="footer"
      data-scene
      className={cn(
        "world:flex world:h-full world:w-max world:min-w-screen world:flex-none world:items-center world:justify-center sm:world:w-screen",
        "world:px-3 world:pt-[calc(var(--header-h)+0.75rem)] world:pb-[calc(var(--road-h)+0.75rem)] sm:world:px-5 lg:world:px-8",
      )}
    >
      <footer
        data-panel
        className="glass relative rounded-t-[2rem] border-b-0 world:max-h-full world:w-max world:overflow-y-auto world:overscroll-y-contain world:rounded-[1.75rem] world:border-b sm:world:w-full sm:world:max-w-[72rem]"
      >
        <div aria-hidden="true" className="absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-primary/70 to-transparent" />
        <div
          className={cn(
            "mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8",
            "world:grid-cols-[repeat(2,calc(100vw-4rem))] world:gap-x-10 world:gap-y-8 world:px-5 world:py-8 world:[grid-template-areas:'brand_contact'_'explore_contact']",
            "sm:world:grid-cols-2 sm:world:px-10 sm:world:py-10",
            "lg:world:grid-cols-[minmax(0,1fr)_auto_auto] lg:world:gap-x-16 lg:world:px-14 lg:world:[grid-template-areas:'brand_explore_contact']",
          )}
        >
          <div className="flex flex-col gap-4 world:[grid-area:brand]">
            <Logo />
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground sm:world:font-display sm:world:text-balance sm:world:text-2xl sm:world:leading-tight sm:world:font-black sm:world:text-foreground">
              {site.tagline}
            </p>
          </div>

          <nav aria-label="Footer" className="world:[grid-area:explore]">
            <h2 className="text-xs font-semibold tracking-[0.2em] text-foreground uppercase">Explore</h2>
            <ul className="mt-4 flex flex-col gap-1 world:grid world:grid-flow-col world:grid-rows-5 world:justify-start world:gap-x-10">
              {nav.map((item) => (
                <li key={item.href}>
                  <a href={item.href} className="inline-block py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground world:block world:py-3 sm:world:py-1.5 sm:world:pointer-coarse:py-3">
                    {item.label}
                  </a>
                </li>
              ))}
              <li>
                <a href={quoteHref} className="inline-block py-1.5 text-sm text-gold transition-colors hover:text-foreground world:block world:py-3 sm:world:py-1.5 sm:world:pointer-coarse:py-3">
                  Request a Quote
                </a>
              </li>
            </ul>
          </nav>

          <div className="world:[grid-area:contact] world:self-center lg:world:self-start">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold tracking-[0.2em] text-foreground uppercase">Contact</h2>
              {phone.sample && <SampleTag />}
            </div>
            <ul className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground world:gap-1 sm:world:gap-3 sm:world:pointer-coarse:gap-1">
              <li>
                <a href={phone.href} className="inline-flex items-center gap-3 py-1 transition-colors hover:text-foreground world:py-3 sm:world:py-1 sm:world:pointer-coarse:py-3">
                  <Phone aria-hidden="true" className="size-4 text-gold" /> {phone.display}
                </a>
              </li>
              <li>
                <a href={email.href} className="inline-flex items-center gap-3 py-1 break-all transition-colors hover:text-foreground world:py-3 sm:world:py-1 sm:world:pointer-coarse:py-3">
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
          <p className="mx-auto max-w-7xl px-4 py-6 text-xs text-muted-foreground sm:px-6 lg:px-8 world:px-5 world:py-4 world:text-end sm:world:px-10 sm:world:py-5 sm:world:text-start lg:world:px-14">
            &copy; {year} {site.legalName}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
