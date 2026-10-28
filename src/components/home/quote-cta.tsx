import { PeriodStatus } from "@/components/sky/period-control";
import { SampleTag } from "@/components/ui/sample-tag";
import { site } from "@/content/site";
import { QuoteChannels } from "./quote-channels";

/**
 * Final call to action, on a glass panel over the sky. Until the quote form
 * ships (next phase) it offers the direct contact routes, pre-filled with the
 * visitor's day/night choice; the form will slot into this section at #quote.
 */
export function QuoteCta() {
  return (
    <section id="quote" aria-labelledby="quote-title" className="relative px-4 pt-12 pb-24 sm:px-6 sm:pb-32 lg:px-8">
      <div data-panel className="glass mx-auto flex max-w-4xl flex-col items-center rounded-[2rem] px-6 py-14 text-center sm:px-12 sm:py-20">
        <p className="text-xs font-semibold tracking-[0.22em] text-gold uppercase">Request a quote</p>
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
    </section>
  );
}
