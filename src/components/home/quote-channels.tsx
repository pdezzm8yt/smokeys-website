"use client";

import { Mail, MessageSquare, Phone } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { useBooking } from "@/components/sky/use-booking";
import { site } from "@/content/site";
import { bookingLinks } from "@/lib/booking-message";
import { cn } from "@/lib/cn";

/**
 * The Contact scene's direct routes (QuoteCta, beside its Book and Schedule
 * buttons): call, text and email go straight to Roadrunning, the text and email
 * pre-filled with whatever the visitor has filled in so far (the booking
 * panel, the day/night choice), so nothing has to be typed twice.
 */
export function QuoteChannels({ className }: { className?: string }) {
  const { phone } = site.contact;
  const { prefs } = useBooking();
  const links = bookingLinks(prefs);

  return (
    <div className={cn("flex w-full flex-col gap-3 sm:w-auto sm:flex-row", className)}>
      <ButtonLink href={links.call} size="lg" variant="secondary">
        <Phone aria-hidden="true" className="size-5" /> Call {phone.display}
      </ButtonLink>
      <ButtonLink href={links.sms} size="lg" variant="secondary">
        <MessageSquare aria-hidden="true" className="size-5" /> Text us
      </ButtonLink>
      <ButtonLink href={links.mail} size="lg" variant="secondary">
        <Mail aria-hidden="true" className="size-5" /> Email
      </ButtonLink>
    </div>
  );
}
