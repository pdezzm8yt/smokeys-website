"use client";

import { Mail, MessageSquare, Phone } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { useBooking } from "@/components/sky/use-booking";
import { site } from "@/content/site";

/**
 * How to request a quote until the booking form ships: call, text or email.
 * The text and email come pre-filled with what the visitor has chosen so far
 * (today: day or night), plus blanks for what we need, so the choice reaches
 * the business without being typed again.
 */
export function QuoteChannels() {
  const { phone, email } = site.contact;
  const { chosen } = useBooking();
  const ride = chosen === "day" ? "a day ride" : chosen === "night" ? "a night ride" : "a ride";
  const message = `Hi Smokey's! I'd like a quote for ${ride}.\nDate:\nPickup time and place:\nGuests:\nOccasion:`;
  const sms = `${phone.href.replace("tel:", "sms:")}?body=${encodeURIComponent(message)}`;
  const mail = `${email.href}?subject=${encodeURIComponent(`Quote request: ${ride}`)}&body=${encodeURIComponent(message)}`;

  return (
    <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
      <ButtonLink href={phone.href} size="lg">
        <Phone aria-hidden="true" className="size-5" /> Call {phone.display}
      </ButtonLink>
      <ButtonLink href={sms} size="lg" variant="secondary">
        <MessageSquare aria-hidden="true" className="size-5" /> Text us
      </ButtonLink>
      <ButtonLink href={mail} size="lg" variant="secondary">
        <Mail aria-hidden="true" className="size-5" /> Email
      </ButtonLink>
    </div>
  );
}
