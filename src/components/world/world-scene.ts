"use client";

import { useSyncExternalStore } from "react";
import { currentAxis, subscribeAxis, type Axis } from "./world-axis";

/** The scene in view in the world (its id), for the header's nav to show where the visitor is. */
let scene: string | null = null;
const listeners = new Set<() => void>();

export function setScene(id: string | null) {
  if (id === scene) return;
  scene = id;
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** The id of the scene in view (null on the server, before the world starts, or on other pages). */
export function useWorldScene() {
  return useSyncExternalStore(subscribe, () => scene, () => null);
}

/** Which way the world runs (the server, and the first render, say "y": only effects should depend on it). */
export function useWorldAxis(): Axis {
  return useSyncExternalStore(subscribeAxis, currentAxis, () => "y");
}
