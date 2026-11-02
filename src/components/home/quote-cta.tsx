import { PeriodStatus } from "@/components/sky/period-control";
import { SampleTag } from "@/components/ui/sample-tag";
import { site } from "@/content/site";
import { QuoteChannels } from "./quote-channels";

/**
 * The Contact scene's content, the world's final call to action: the direct
 * contact routes, pre-filled with the visitor's booking details (the booking
 * panel, ActionDrawer, gathers them; page.tsx wraps this in its scene).
 */
export function QuoteCta() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
        <p className="text-xs font-semibold tracking-[0.22em] text-gold uppercase">Contact &amp; quotes</p>
        <h2 id="quote-title" className="mt-4 font-display text-4xl leading-[1.05] font-black tracking-tight sm:text-6xl">
          Ready to roll?
        </h2>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          Tell us your date, pickup spot and headcount. We&apos;ll confirm availability and send an exact price, no obligation.
        </p>
        <PeriodStatus className="mt-4 max-w-xl" />

        <div className="mt-10 flex w-full justify-center">
          <QuoteChannels />
        </div>
        {site.contact.phone.sample && <SampleTag label="Sample contact details" className="mt-6" />}
    </div>
  );
}
