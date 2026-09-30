/**
 * Asset slots. Every visual on the site reads from here so real brand
 * photos/video can be dropped in without touching components.
 *
 * `src: null` → the component renders its built-in illustrated placeholder.
 * `placeholder: true` → the UI labels it as a sample, never as the real bus.
 */
export type AssetSlot = {
  src: string | null;
  /** Optional video loop (muted, no audio). Poster = `src`. */
  video?: { webm?: string; mp4?: string } | null;
  alt: string;
  width: number;
  height: number;
  placeholder: boolean;
  credit?: string;
};

export const assets = {
  intro: {
    /** Scene 1: realistic roadrunner. Licensed photo or 4–6 s video loop, landscape. */
    realRoadrunner: {
      src: null,
      video: null,
      alt: "A roadrunner standing on a desert road at dusk",
      width: 2400,
      height: 1350,
      placeholder: true,
    },
    /** Scene 2: Smokey's original mascot. SVG or Lottie from the illustrator. */
    mascot: {
      src: null,
      alt: "Smokey, the Smokey's roadrunner mascot, wearing sunglasses",
      width: 480,
      height: 360,
      placeholder: true,
    },
  },
  bus: {
    /** Same tripod position, lights OFF and lights ON — powers the reveal. */
    heroLightsOff: {
      src: null,
      alt: "Smokey's black party bus at night",
      width: 3000,
      height: 1500,
      placeholder: true,
    },
    heroLightsOn: {
      src: null,
      alt: "Smokey's black party bus with its party lights on",
      width: 3000,
      height: 1500,
      placeholder: true,
    },
  },
  brand: {
    logo: { src: null, alt: "Smokey's", width: 240, height: 64, placeholder: true },
  },
} as const satisfies Record<string, Record<string, AssetSlot>>;
