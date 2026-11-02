import { periodForHour, type Period } from "@/content/sky";

/**
 * What the visitor has chosen on the way to a booking: the day/night
 * preference (picked by clicking the sun or the moon, or in the booking
 * panel) and the details they fill in (src/components/actions/action-drawer.tsx):
 * date, pickup, guests, occasion, package, notes. Every update is MERGED, so
 * changing one choice never erases another. Kept in this browser
 * (localStorage), so a reload keeps it. No React here: the sky engine and any
 * component can use it.
 *
 * A preference is not a booking: the visitor still picks the exact date and
 * time, and nothing here says anything is available.
 */
export type BookingPreferences = {
  /** Day or night ride, as chosen by the visitor (absent until they choose). */
  period?: Period;
  /** Reserved (one bus today): kept untouched by anything that doesn't set it. */
  vehicle?: string;
  /** A package's name (src/content/packages.ts). */
  package?: string;
  passengers?: number;
  /** The ride's date, YYYY-MM-DD (as an <input type="date"> gives it). */
  date?: string;
  /** Pickup time, HH:MM (24h, as an <input type="time"> gives it). */
  time?: string;
  /** Where to pick the group up (free text). */
  pickup?: string;
  /** The occasion's title (src/content/occasions.ts), or the visitor's own words. */
  eventType?: string;
  /** Anything else the visitor wants to tell us. */
  notes?: string;
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
