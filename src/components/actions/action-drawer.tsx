"use client";

import { Mail, MessageSquare, Phone, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { PeriodControl } from "@/components/sky/period-control";
import { useBooking } from "@/components/sky/use-booking";
import { buttonClasses } from "@/components/ui/button";
import { SampleTag } from "@/components/ui/sample-tag";
import { occasions } from "@/content/occasions";
import { packages } from "@/content/packages";
import { site } from "@/content/site";
import { bookingLinks, bookingMessage } from "@/lib/booking-message";
import { updateBooking, type BookingPreferences } from "@/lib/booking-store";
import { cn } from "@/lib/cn";

/** What a [data-action] element asks for. Calls are plain tel: links; everything else opens this panel. */
const MODES = {
  book: { eyebrow: "Book", title: "Book your ride", focus: "date" },
  quote: { eyebrow: "Quote", title: "Get a quote", focus: "date" },
  schedule: { eyebrow: "Schedule", title: "Pick your date", focus: "date" },
  message: { eyebrow: "Message", title: "Message us", focus: "notes" },
  email: { eyebrow: "Email", title: "Email us", focus: "notes" },
} as const;
type Mode = keyof typeof MODES;
const isMode = (m: string | undefined): m is Mode => !!m && m in MODES;

const field =
  // The outline that identifies a field must stand out (3:1, WCAG 1.4.11): the muted text colour, not the hairline border.
  "w-full rounded-xl bg-surface px-3.5 py-3 text-base text-foreground ring-1 ring-muted-foreground transition-shadow placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * The world's actions (Book, Get a quote, Schedule, Message, Email) open this
 * panel over the world instead of taking the visitor somewhere else: a native
 * modal dialog (focus kept inside, Esc closes, focus returns to the button
 * that opened it). The visitor fills in what they know, saved as they type
 * (src/lib/booking-store.ts), and sends it to Smokey's as a text or an email
 * from their own phone or mail app, or calls. Nothing is booked or sent by
 * the site: Smokey's confirms.
 *
 * Any element with data-action="book|quote|schedule|message|email" opens it
 * (a link to the Contact scene, so it still works without JS); it can also
 * preset a detail: data-book-package, data-book-occasion.
 */
export function ActionDrawer() {
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<Mode>("book");
  const { prefs } = useBooking();
  const uid = useId();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const trigger = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-action]") : null;
      const asked = trigger?.dataset.action;
      if (!trigger || !isMode(asked)) return;
      e.preventDefault();
      const patch: Partial<BookingPreferences> = {};
      if (trigger.dataset.bookPackage) patch.package = trigger.dataset.bookPackage;
      if (trigger.dataset.bookOccasion) patch.eventType = trigger.dataset.bookOccasion;
      if (Object.keys(patch).length) updateBooking(patch);
      // Opened from another dialog (the phone menu): that one closes first.
      trigger.closest("dialog")?.close();
      setMode(asked);
      const dialog = ref.current;
      if (!dialog || dialog.open) return;
      dialog.showModal();
      // The field this action is about (after React has rendered the mode).
      requestAnimationFrame(() => dialog.querySelector<HTMLElement>(`[data-field="${MODES[asked].focus}"]`)?.focus());
    };
    // Capture: before the world's in-page link handling sees the click.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const set = (patch: Partial<BookingPreferences>) => updateBooking(patch);
  const close = () => ref.current?.close();
  const links = bookingLinks(prefs);
  const { body } = bookingMessage(prefs);
  const { title, eyebrow } = MODES[mode];
  const emailFirst = mode === "email";
  const id = (name: string) => `${uid}-${name}`;

  return (
    <dialog
      ref={ref}
      aria-labelledby={id("title")}
      onClick={(e) => {
        if (e.target === e.currentTarget) close(); // backdrop click
      }}
      className={cn(
        "fixed inset-y-0 ms-auto me-0 h-dvh max-h-dvh w-[min(30rem,100vw)] bg-surface-raised p-0 text-foreground shadow-2xl ring-1 ring-border backdrop-blur-xl",
        "translate-x-full opacity-0 transition-[translate,opacity,display,overlay] transition-discrete duration-300 ease-enter",
        "open:translate-x-0 open:opacity-100 starting:open:translate-x-full starting:open:opacity-0",
        "backdrop:bg-black/0 backdrop:transition-all backdrop:transition-discrete backdrop:duration-300",
        "open:backdrop:bg-black/60 open:backdrop:backdrop-blur-sm starting:open:backdrop:bg-black/0",
        "motion-reduce:transition-none",
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.22em] text-gold uppercase">{eyebrow}</p>
            <h2 id={id("title")} className="mt-1 font-display text-2xl font-bold">
              {title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Fill in what you know. It goes to us by text or email, and we reply to confirm.</p>
          </div>
          <button type="button" onClick={close} className="-me-2 grid size-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-muted">
            <X aria-hidden="true" className="size-6" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <form className="flex-1 overflow-y-auto overscroll-contain px-6 py-5" onSubmit={(e) => e.preventDefault()}>
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-semibold">Day or night ride</span>
              <PeriodControl variant="compact" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" htmlFor={id("date")}>
                <input id={id("date")} data-field="date" type="date" className={field} value={prefs.date ?? ""} onChange={(e) => set({ date: e.target.value || undefined })} />
              </Field>
              <Field label="Pickup time" htmlFor={id("time")}>
                <input id={id("time")} type="time" className={field} value={prefs.time ?? ""} onChange={(e) => set({ time: e.target.value || undefined })} />
              </Field>
            </div>
            <Field label="Pickup place" htmlFor={id("pickup")}>
              <input
                id={id("pickup")}
                type="text"
                autoComplete="street-address"
                enterKeyHint="next"
                placeholder="Address or venue"
                className={field}
                value={prefs.pickup ?? ""}
                onChange={(e) => set({ pickup: e.target.value || undefined })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Guests" htmlFor={id("guests")}>
                <input
                  id={id("guests")}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className={field}
                  value={prefs.passengers ?? ""}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value.replace(/\D/g, ""), 10);
                    set({ passengers: Number.isFinite(n) && n > 0 ? n : undefined });
                  }}
                />
              </Field>
              <Field label="Occasion" htmlFor={id("occasion")}>
                <select id={id("occasion")} className={field} value={prefs.eventType ?? ""} onChange={(e) => set({ eventType: e.target.value || undefined })}>
                  <option value="">Choose…</option>
                  {occasions.map((o) => (
                    <option key={o.slug} value={o.title}>
                      {o.title}
                    </option>
                  ))}
                  <option value="Something else">Something else</option>
                </select>
              </Field>
            </div>
            <Field label="Package" htmlFor={id("package")} hint="Sample packages: we'll confirm what's on offer.">
              <select id={id("package")} className={field} value={prefs.package ?? ""} onChange={(e) => set({ package: e.target.value || undefined })}>
                <option value="">Not sure yet</option>
                {packages.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Anything else" htmlFor={id("notes")}>
              <textarea
                id={id("notes")}
                data-field="notes"
                rows={3}
                className={cn(field, "resize-y")}
                value={prefs.notes ?? ""}
                onChange={(e) => set({ notes: e.target.value || undefined })}
              />
            </Field>
            <details className="rounded-xl bg-muted px-4 py-3 text-sm ring-1 ring-border">
              <summary className="cursor-pointer font-semibold">Preview your message</summary>
              <p className="mt-3 whitespace-pre-line text-muted-foreground">{body}</p>
            </details>
          </div>
        </form>

        <div className="flex flex-col gap-3 border-t border-border px-6 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className={cn("flex gap-3", emailFirst && "flex-row-reverse")}>
            <a href={links.sms} className={buttonClasses({ variant: emailFirst ? "secondary" : "primary", className: "flex-1" })}>
              <MessageSquare aria-hidden="true" className="size-5" /> Text it to us
            </a>
            <a href={links.mail} className={buttonClasses({ variant: emailFirst ? "primary" : "secondary", className: "flex-1" })}>
              <Mail aria-hidden="true" className="size-5" /> Email it
            </a>
          </div>
          <a href={links.call} className={buttonClasses({ variant: "ghost" })}>
            <Phone aria-hidden="true" className="size-5" /> Or call {site.contact.phone.display}
          </a>
          <p className="flex flex-wrap items-center justify-center gap-2 text-center text-xs text-muted-foreground">
            Nothing is booked until we confirm.
            {site.contact.phone.sample && <SampleTag label="Sample contact details" />}
          </p>
        </div>
      </div>
    </dialog>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
