"use client";

import { CalendarDays, Mail, MessageSquare, Phone, Ticket } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { useBooking } from "@/components/sky/use-booking";
import { quoteHref, site } from "@/content/site";
import { bookingLinks } from "@/lib/booking-message";

/**
 * The Contact scene's actions. Book and Schedule open the booking panel over
 * the world (ActionDrawer: without JS they're plain links to this scene); call,
 * text and email go straight to Smokey's, the text and email pre-filled with
 * whatever the visitor has filled in so far (the booking panel, the day/night
 * choice), so nothing has to be typed twice.
 */
export function QuoteChannels() {
  const { phone } = site.contact;
  const { prefs } = useBooking();
  const links = bookingLinks(prefs);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <ButtonLink href={quoteHref} data-action="book" size="lg">
          <Ticket aria-hidden="true" className="size-5" /> Book your ride
        </ButtonLink>
        <ButtonLink href={quoteHref} data-action="schedule" size="lg" variant="secondary">
          <CalendarDays aria-hidden="true" className="size-5" /> Schedule a date
        </ButtonLink>
      </div>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
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
    </div>
  );
}
