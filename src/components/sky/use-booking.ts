"use client";

import { useSyncExternalStore } from "react";
import type { Period } from "@/content/sky";
import { getBooking, skyPeriod, subscribeBooking, updateBooking, type BookingPreferences } from "@/lib/booking-store";

const SERVER: BookingPreferences = {};

/**
 * The visitor's booking preferences, live. On the server and while hydrating
 * it reports nothing chosen (the server can't know this browser's choice or
 * its local time), then the real values: no hydration mismatch.
 */
export function useBooking() {
  const prefs = useSyncExternalStore(subscribeBooking, getBooking, () => SERVER);
  const hydrated = prefs !== SERVER;
  return {
    prefs,
    /** The sky being shown: the choice, or the local time of day (null until hydrated). */
    shown: hydrated ? skyPeriod(prefs) : null,
    /** The day/night preference the visitor actually chose (undefined until they do). */
    chosen: prefs.period,
    choose: (period: Period) => updateBooking({ period }),
  };
}
