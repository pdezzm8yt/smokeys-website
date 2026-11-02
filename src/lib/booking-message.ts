import { site } from "@/content/site";
import type { BookingPreferences } from "./booking-store";

/**
 * The booking request as a message to Smokey's: what the visitor filled in
 * (the booking panel, the day/night choice), ready to send by text or email
 * from their own phone or mail app. Nothing is sent from the site, and a
 * request isn't a booking: Smokey's replies to confirm.
 */

const ride = (p: BookingPreferences) => (p.period === "day" ? "a day ride" : p.period === "night" ? "a night ride" : "a ride");

/** 2026-11-14 → "Sat, Nov 14, 2026" (read as a local date: parsing it as UTC would show the day before in the US). */
export function formatDate(date: string | undefined) {
  const m = date && /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date ?? "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

/** 19:30 → "7:30 PM". */
export function formatTime(time: string | undefined) {
  const m = time && /^(\d{2}):(\d{2})/.exec(time);
  if (!m) return time ?? "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

export function bookingMessage(p: BookingPreferences) {
  const pickup = [formatTime(p.time), p.pickup?.trim()].filter(Boolean).join(", ");
  const lines = [
    `Hi ${site.name}! I'd like to book ${ride(p)}.`,
    `Date: ${formatDate(p.date)}`,
    `Pickup (time and place): ${pickup}`,
    `Guests: ${p.passengers ?? ""}`,
    `Occasion: ${p.eventType ?? ""}`,
    ...(p.package ? [`Package: ${p.package}`] : []),
    ...(p.notes?.trim() ? [`Notes: ${p.notes.trim()}`] : []),
  ];
  const subject = `Booking request: ${ride(p)}${p.date ? `, ${formatDate(p.date)}` : ""}`;
  return { subject, body: lines.join("\n") };
}

/** Text and email links that open the visitor's own app with the request filled in. */
export function bookingLinks(p: BookingPreferences) {
  const { phone, email } = site.contact;
  const { subject, body } = bookingMessage(p);
  return {
    sms: `${phone.href.replace("tel:", "sms:")}?body=${encodeURIComponent(body)}`,
    mail: `${email.href}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    call: phone.href,
  };
}
