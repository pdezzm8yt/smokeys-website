import { CalendarDays, Ticket } from "lucide-react";
import { PeriodStatus } from "@/components/sky/period-control";
import { ButtonLink } from "@/components/ui/button";
import { SampleTag } from "@/components/ui/sample-tag";
import { quoteHref, site } from "@/content/site";
import { QuoteChannels } from "./quote-channels";

/**
 * The Contact scene's content, the world's final call to action: Book and
 * Schedule open the booking panel over the world (ActionDrawer; without JS
 * they're plain links to this scene), and the direct routes (QuoteChannels)
 * come pre-filled with the visitor's booking details. page.tsx wraps this in
 * its scene.
 *
 * Down the page, and sideways on a large screen, it's one centred column.
 * Sideways on a phone it runs along the world instead (two columns a screen
 * wide each, so nothing scrolls inside the panel): the pitch with Book and
 * Schedule, then, a swipe on, the direct routes. The two halves are
 * display: contents in the column layout, so the column is exactly as it was.
 * On short large screens the column tightens up to fit between the header and
 * the road.
 */
export function QuoteCta() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center text-center world:grid world:max-w-none world:grid-cols-[repeat(2,calc(100vw-4rem))] world:items-center world:gap-x-10 sm:world:flex sm:world:max-w-4xl">
      <div className="contents world:flex world:flex-col world:items-center sm:world:contents">
        <p className="text-xs font-semibold tracking-[0.22em] text-gold uppercase">Contact &amp; quotes</p>
        <h2
          id="quote-title"
          className="mt-4 font-display text-4xl leading-[1.05] font-black tracking-tight sm:text-6xl world:text-[length:min(2.25rem,9.4vw)] sm:world:text-6xl sm:world:[@media(max-height:42rem)]:text-5xl"
        >
          Ready to roll?
        </h2>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          Tell us your date, pickup spot and headcount. We&apos;ll confirm availability and send an exact price, no obligation.
        </p>
        <PeriodStatus className="mt-4 max-w-xl" />

        <div className="mt-10 flex w-full flex-col gap-3 sm:w-auto sm:flex-row world:mt-8 sm:world:mt-10 sm:world:[@media(max-height:42rem)]:mt-6">
          <ButtonLink href={quoteHref} data-action="book" size="lg">
            <Ticket aria-hidden="true" className="size-5" /> Book your ride
          </ButtonLink>
          <ButtonLink href={quoteHref} data-action="schedule" size="lg" variant="secondary">
            <CalendarDays aria-hidden="true" className="size-5" /> Schedule a date
          </ButtonLink>
        </div>
      </div>

      <div className="contents world:flex world:flex-col world:items-center sm:world:contents">
        {/* Heads the second column (sideways on a phone); the column layout runs straight on from Book and Schedule. */}
        <p className="hidden text-xs font-semibold tracking-[0.22em] text-gold uppercase world:block sm:world:hidden">Or reach us directly</p>
        <QuoteChannels className="mt-3 world:mt-5 sm:world:mt-3" />
        {site.contact.phone.sample && <SampleTag label="Sample contact details" className="mt-6 sm:world:[@media(max-height:42rem)]:mt-4" />}
      </div>
    </div>
  );
}
