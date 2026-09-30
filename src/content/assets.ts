import type { StaticImageData } from "next/image";
import busExterior from "@/assets/intro/bus-exterior.webp";
import busInterior from "@/assets/intro/bus-interior.jpg";

/**
 * Asset slots. Every visual on the site reads from here so media can be
 * swapped without touching components.
 *
 * `src: null` → the component renders its built-in illustrated placeholder.
 * `placeholder: true` → the UI labels it as a sample, never as the real bus.
 *
 * The intro's video clips are NOT here: see src/content/intro-video.ts.
 * The images in src/assets/intro are GENERATED from the owner's originals in
 * assets/intro-source by `node scripts/intro-assets/build.mjs` (the bus photos
 * below, and the stills the intro's placeholder clips are rendered from).
 */
export type AssetSlot = {
  src: StaticImageData | null;
  alt: string;
  placeholder: boolean;
  /** Anything a human must sort out before launch (rights, resolution…). */
  launchNote?: string;
};

export const assets = {
  bus: {
    exterior: { src: busExterior, alt: "Smokey's black party bus, exterior", placeholder: false },
    interior: {
      src: busInterior,
      alt: "Party bus interior with LED ceiling strips, leather lounge seating and floor lighting",
      placeholder: false,
    },
  },
  brand: {
    logo: { src: null, alt: "Smokey's", placeholder: true },
  },
} as const;
