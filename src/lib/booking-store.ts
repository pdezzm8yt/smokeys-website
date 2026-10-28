import { periodForHour, type Period } from "@/content/sky";

/**
 * What the visitor has chosen on the way to a booking: today the day/night
 * preference (picked by clicking the sun or the moon); the booking form will
 * add the bus, package, date, time, passengers… to the same record. Every
 * update is MERGED, so changing one choice never erases another. Kept in this
 * browser (localStorage), so a reload keeps it. No React here: the sky engine
 * and any component can use it.
 *
 * A preference is not a booking: the visitor still picks the exact date and
 * time, and nothing here says anything is available.
 */
export type BookingPreferences = {
  /** Day or night ride, as chosen by the visitor (absent until they choose). */
  period?: Period;
  /** Reserved for the booking form (phase 2): kept untouched by anything that only changes `period`. */
  vehicle?: string;
  package?: string;
  passengers?: number;
  date?: string;
  time?: string;
  eventType?: string;
};

/** The localStorage key (the pre-paint script in layout.tsx reads it too). */
export const BOOKING_KEY = "smokeys:booking";

const listeners = new Set<() => void>();
let state: BookingPreferences = {};
let loaded = false;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = JSON.parse(window.localStorage.getItem(BOOKING_KEY) ?? "{}") as unknown;
    if (raw && typeof raw === "object") state = raw as BookingPreferences;
  } catch {
    // private mode / blocked storage: start empty, keep working in memory
  }
}

export function getBooking(): BookingPreferences {
  load();
  return state;
}

/** Merge a change into the preferences (other fields are kept). */
export function updateBooking(patch: Partial<BookingPreferences>) {
  load();
  state = { ...state, ...patch };
  try {
    window.localStorage.setItem(BOOKING_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable: the choice still holds for this visit
  }
  for (const listener of listeners) listener();
}

export function subscribeBooking(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The sky to show: the visitor's choice, or the local time of day until they choose. */
export function skyPeriod(prefs: BookingPreferences = getBooking()): Period {
  return prefs.period ?? periodForHour(new Date().getHours());
}

// Another tab changed the preferences: follow it.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== BOOKING_KEY) return;
    loaded = false;
    load();
    for (const listener of listeners) listener();
  });
}
