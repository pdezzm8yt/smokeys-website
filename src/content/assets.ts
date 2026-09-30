import type { StaticImageData } from "next/image";
import busExterior from "@/assets/intro/bus-exterior.webp";
import busInterior from "@/assets/intro/bus-interior.jpg";
import busMask from "@/assets/intro/bus-mask.png";
import cartoonRoadrunner from "@/assets/intro/roadrunner-cartoon.webp";
import realGround from "@/assets/intro/roadrunner-ground.webp";
import realPlate from "@/assets/intro/roadrunner-plate.webp";
import realRoadrunner from "@/assets/intro/roadrunner-real.webp";

/**
 * Asset slots. Every visual on the site reads from here so media can be
 * swapped without touching components.
 *
 * `src: null` → the component renders its built-in illustrated placeholder.
 * `placeholder: true` → the UI labels it as a sample, never as the real bus.
 *
 * The intro files in src/assets/intro are GENERATED from the owner's originals
 * in assets/intro-source by `node scripts/intro-assets/build.mjs`. Replace a
 * source file and re-run the script; never edit the generated files by hand.
 */
export type AssetSlot = {
  src: StaticImageData | null;
  alt: string;
  placeholder: boolean;
  /** Anything a human must sort out before launch (rights, resolution…). */
  launchNote?: string;
};

/** A point on an image, in % of its box (used for headlight flares, hotspots). */
export type ImagePoint = { x: number; y: number; size?: number };

export const assets = {
  intro: {
    /** Scene 1: owner's roadrunner photo, lifted from its background and mirrored to run left → right. */
    real: {
      src: realRoadrunner,
      alt: "A roadrunner sprinting across red desert dirt",
      placeholder: false,
      /** Subject-free, motion-blurred plates built from the same photo (loopable strips). */
      plate: realPlate,
      ground: realGround,
      launchNote: "Confirm you hold a commercial licence for this wildlife photo.",
    },
    /** Scene 2: owner-supplied cartoon roadrunner, white background removed. */
    cartoon: {
      src: cartoonRoadrunner,
      alt: "A cartoon roadrunner running at full speed",
      placeholder: false,
      launchNote:
        "Warner Bros. owns the Road Runner character. Get a licence before public launch, or set src to null to use Smokey's original mascot.",
    },
    /** Scene 3: owner's black party bus photo, street background removed. */
    bus: {
      src: busExterior,
      alt: "Smokey's black party bus",
      placeholder: false,
      /** Alpha-only silhouette (a few KB) used as the CSS mask for the paint sheen. */
      mask: busMask,
      /** Where the real lamps are on the cutout, so the flares land on them. */
      headlights: [
        { x: 73, y: 61, size: 1 },
        { x: 98.5, y: 62, size: 0.7 },
        { x: 74, y: 77, size: 0.45 },
      ] satisfies ImagePoint[],
      launchNote: "Source is 560px wide: supply a 2400px+ photo for a sharp reveal on large screens.",
    },
  },
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
