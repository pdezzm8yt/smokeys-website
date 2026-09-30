import { Mail, MessageSquare, Phone } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { SampleTag } from "@/components/ui/sample-tag";
import { site } from "@/content/site";

/**
 * Final call to action. Until the quote form ships (next phase) it offers the
 * direct contact routes; the form will slot into this section at #quote.
 */
export function QuoteCta() {
  const { phone, email } = site.contact;
  const sms = phone.href.replace("tel:", "sms:");

  return (
    <section id="quote" aria-labelledby="quote-title" className="relative isolate overflow-hidden px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
      {/* Headlights in the dark */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[#050507]">
        <div className="absolute top-1/2 left-[18%] size-[36rem] -translate-1/2 rounded-full bg-[radial-gradient(circle,oklch(0.9_0.1_80/0.35),transparent_60%)] motion-safe:animate-float" />
        <div className="absolute top-1/2 left-[82%] size-[36rem] -translate-1/2 rounded-full bg-[radial-gradient(circle,oklch(0.9_0.1_80/0.35),transparent_60%)] motion-safe:animate-float [animation-delay:-3s]" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-neon-violet/15 to-transparent" />
      </div>

      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <p className="text-xs font-semibold tracking-[0.22em] text-primary uppercase">Request a quote</p>
        <h2 id="quote-title" className="mt-4 font-display text-4xl leading-[1.05] font-black tracking-tight sm:text-6xl">
          Ready to roll?
        </h2>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          Tell us your date, pickup spot and headcount. We&apos;ll confirm availability and send an exact price, no obligation.
        </p>

        <div className="mt-10 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <ButtonLink href={phone.href} size="lg">
            <Phone aria-hidden="true" className="size-5" /> Call {phone.display}
          </ButtonLink>
          <ButtonLink href={sms} size="lg" variant="secondary">
            <MessageSquare aria-hidden="true" className="size-5" /> Text us
          </ButtonLink>
          <ButtonLink href={email.href} size="lg" variant="secondary">
            <Mail aria-hidden="true" className="size-5" /> Email
          </ButtonLink>
        </div>
        {phone.sample && <SampleTag label="Sample contact details" className="mt-6" />}
      </div>
    </section>
  );
}
