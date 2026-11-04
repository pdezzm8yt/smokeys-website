"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { bookingSmsCode } from "@/lib/booking-message";
import type { BookingPreferences } from "@/lib/booking-store";

type Uqr = typeof import("uqr");

/**
 * A QR code of the visitor's booking request as a text message (the payload:
 * SMSTO:number:message, `bookingSmsCode` in src/lib/booking-message.ts): on a
 * computer they scan it with their phone's camera and their messages open with
 * the request written in, addressed to the business, ready to send. It follows
 * the form as they fill it in. Only on computers (a phone just uses the Text
 * button): the card shows only there (CSS: a fine pointer, a wide screen), and
 * the encoder (uqr) loads once the code's place is on screen, so a phone never
 * loads it and a window widened later still gets the code. `children`: what the
 * card says beside the code. If the encoder can't load (a browser keeps a
 * failed import failed, so there's no retrying it) or can't encode the request,
 * the card goes: no "scan the code" beside an empty box.
 *
 * Dark modules on a light ground in any theme: that's what every phone camera
 * reads (like the film or a photo, it's media, not UI colour).
 */
export function TextFromPhone({ prefs, label, children }: { prefs: BookingPreferences; label: string; children: ReactNode }) {
  const [uqr, setUqr] = useState<Uqr | "failed" | null>(null);
  const spot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = spot.current;
    if (!el) return;
    let live = true;
    // A hidden card (a phone, a narrow window, the panel closed) has no box and never intersects.
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      seen.disconnect();
      import("uqr").then(
        (m) => live && setUqr(m),
        () => live && setUqr("failed"),
      );
    });
    seen.observe(el);
    return () => {
      live = false;
      seen.disconnect();
    };
  }, []);

  // The request is turned into a code only once the encoder is here (never on a phone).
  const code = useMemo(() => {
    if (!uqr || uqr === "failed") return uqr;
    try {
      const payload = bookingSmsCode(prefs);
      const { data, size } = uqr.encode(payload, { ecc: "L", border: 4 });
      // One path for every dark module (no element per module).
      let d = "";
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) if (data[y]?.[x]) d += `M${x} ${y}h1v1h-1z`;
      }
      return { payload, d, size };
    } catch {
      return "failed";
    }
  }, [uqr, prefs]);

  if (code === "failed") return null;
  return (
    <div className="hidden items-center gap-4 rounded-xl bg-muted p-3 text-sm ring-1 ring-border [@media(pointer:fine)_and_(min-width:48rem)]:flex">
      {code ? <Code {...code} label={label} /> : <div ref={spot} data-text-code-spot aria-hidden="true" className="size-36 shrink-0 rounded-lg bg-muted" />}
      {children}
    </div>
  );
}

function Code({ payload, d, size, label }: { payload: string; d: string; size: number; label: string }) {
  // At least ~2.5px a module, so a phone reads it off a screen: a longer request draws a bigger code (up to 15rem).
  const px = Math.min(240, Math.max(144, Math.round(size * 2.6)));
  return (
    <svg
      role="img"
      aria-label={label}
      data-text-code={payload}
      viewBox={`0 0 ${size} ${size}`}
      width={px}
      height={px}
      shapeRendering="crispEdges"
      className="shrink-0 rounded-lg"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={d} fill="#0b0a10" />
    </svg>
  );
}
