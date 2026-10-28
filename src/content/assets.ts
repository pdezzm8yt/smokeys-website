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
    // TODO(owner): confirm these photos show Smokey's own bus and that you own (or licensed) them; then set
    // placeholder to false. Supply a 2400px+ exterior: this one is 560px wide.
    exterior: {
      src: busExterior,
      alt: "Black party bus, exterior",
      placeholder: true,
      launchNote: "Confirm it's Smokey's own bus (the plate and fleet number suggest a dealer or operator photo) and that you hold the rights; 2400px+ wide.",
    },
    interior: {
      src: busInterior,
      alt: "Party bus interior with LED ceiling strips, quilted lounge seating and floor lighting",
      placeholder: true,
      launchNote: "Confirm it's Smokey's own bus and that you hold the rights.",
    },
  },
  brand: {
    logo: { src: null, alt: "Smokey's", placeholder: true },
  },
} as const;
