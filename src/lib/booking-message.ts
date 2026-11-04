import { site } from "@/content/site";
import type { BookingPreferences } from "./booking-store";

/**
 * The booking request as a message to Roadrunning: what the visitor filled in
 * (the booking panel, the day/night choice), ready to send by text or email
 * from their own phone or mail app. Nothing is sent from the site, and a
 * request isn't a booking: Roadrunning replies to confirm.
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

/**
 * The most a QR code of the request carries, in bytes (a code stores the text
 * as UTF-8: an accented letter takes 2, a Chinese character 3, an emoji 4): past
 * this it gets too dense to scan off a screen.
 */
const QR_BYTES = 420;

/** `text`'s length in UTF-8. */
function bytes(text: string) {
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

/** `text` as the characters a reader sees (an emoji, a flag, an accented letter), so a cut never splits one. */
const characters = (text: string) =>
  typeof Intl.Segmenter === "function" ? Array.from(new Intl.Segmenter().segment(text), (s) => s.segment) : Array.from(text);

/** The longest start of `text` that fits in `budget` bytes, ending "…" if anything was cut. */
function shorten(text: string, budget: number) {
  if (bytes(text) <= budget) return text;
  let kept = "";
  let used = bytes("…");
  // (Every UTF-16 unit takes at least a byte, so what fits is within the first `budget` units: a long note costs no more.)
  for (const ch of characters(text.slice(0, Math.max(0, budget + 1)))) {
    used += bytes(ch);
    if (used > budget) break;
    kept += ch;
  }
  return `${kept.trimEnd()}…`;
}

/**
 * The same text message as a QR code's payload (SMSTO:number:message, the QR
 * standard for a text: a phone's camera offers to send it), for a visitor on a
 * computer to send from their phone. A very long request loses the end of its
 * notes, then of its pickup place (each cut marked "…"), so the code stays
 * scannable and every other detail stays in.
 */
export function bookingSmsCode(p: BookingPreferences) {
  const start = `SMSTO:${site.contact.phone.href.replace("tel:", "")}:`;
  // Well-formed: a stray half of an emoji (pasted, or from storage) can't reach the encoder.
  const code = (q: BookingPreferences) => (start + bookingMessage(q).body).toWellFormed();
  let q: BookingPreferences = { ...p, notes: p.notes?.trim(), pickup: p.pickup?.trim() };
  for (const field of ["notes", "pickup"] as const) {
    const over = bytes(code(q)) - QR_BYTES;
    const text = q[field];
    if (over <= 0) break;
    if (text) q = { ...q, [field]: shorten(text, bytes(text) - over) };
  }
  // (Only a request tampered with in storage gets here: the other fields are short.)
  return shorten(code(q), QR_BYTES);
}
