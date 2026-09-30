import { stagger, type AnimationSequence } from "motion/react";
import { ease } from "@/lib/motion";

/**
 * The intro's choreography as Motion sequences. Each segment targets a
 * `data-*` hook rendered by the scene components:
 *
 *   [data-scene]        real | cartoon | bus   whole scene layers
 *   [data-camera]       real | cartoon         background layers (whip / push-in)
 *   [data-subject]      real | cartoon | bus   the anchored images
 *   [data-speedlines]   real | cartoon         streak overlays
 *   [data-caption]      cartoon
 *   [data-dust]         dust-cloud container (animates the --p progress var)
 *   [data-fx]           flash | haze           full-screen overlays
 *   [data-bus-flare] [data-bus-pool] [data-bus-sweep] [data-bus-copy]
 *
 * Times are in seconds from the start of each transition; `at` places a step.
 */

export type TimelineOptions = {
  /** prefers-reduced-motion: crossfades only. */
  reduce: boolean;
  /** Phones / coarse pointers / Save-Data: skip live blur filters. */
  lite: boolean;
};

const scene = (name: string) => `[data-scene="${name}"]`;
const camera = (name: string) => `[data-camera="${name}"]`;
const subject = (name: string) => `[data-subject="${name}"]`;
const speedlines = (name: string) => `[data-speedlines="${name}"]`;

const BUS_FLARES = "[data-bus-flare]";
const BUS_POOL = "[data-bus-pool]";
const BUS_SWEEP = "[data-bus-sweep]";
const BUS_COPY = "[data-bus-copy]";
const DUST = "[data-dust]";
const FLASH = '[data-fx="flash"]';
const HAZE = '[data-fx="haze"]';
const CAPTION = '[data-caption="cartoon"]';

const blur = (lite: boolean, from: number, to: number) =>
  lite ? {} : { filter: [`blur(${from}px)`, `blur(${to}px)`] };

/** Click → the real roadrunner hits top speed and bursts into the cartoon desert. */
export function toCartoon({ reduce, lite }: TimelineOptions): AnimationSequence {
  if (reduce) {
    return [
      [scene("real"), { opacity: 0 }, { duration: 0.45 }],
      [scene("cartoon"), { opacity: 1 }, { duration: 0.45, at: "<" }],
      [CAPTION, { opacity: 1 }, { duration: 0.3 }],
    ];
  }
  return [
    // 1. Accelerate: lean into the run while the world streams harder.
    [subject("real"), { x: ["0vw", "3vw"] }, { duration: 0.3, ease: ease.standard }],
    [speedlines("real"), { opacity: [0.35, 1] }, { duration: 0.3, at: 0 }],
    [camera("real"), { x: ["0vw", "-6vw"], scale: [1, 1.06], ...blur(lite, 0, 8) }, { duration: 0.45, at: 0.15, ease: ease.exit }],
    [subject("real"), { scale: [1, 1.12], ...blur(lite, 0, 2) }, { duration: 0.3, at: 0.3, ease: ease.exit }],
    // 2. A speed burst hides the swap.
    [FLASH, { opacity: [0, 0.9, 0] }, { duration: 0.5, at: 0.4 }],
    [scene("real"), { opacity: 0 }, { duration: 0.1, at: 0.58 }],
    [scene("cartoon"), { opacity: [0, 1] }, { duration: 0.1, at: 0.56 }],
    // 3. Land in the cartoon desert: camera settles, cartoon pops in on the same anchor.
    // x stays within the scale overhang ((1.08 - 1) / 2 = 4vw) so no edge is ever exposed.
    [camera("cartoon"), { x: ["4vw", "0vw"], scale: [1.08, 1] }, { duration: 0.7, at: 0.58, ease: ease.enter }],
    [subject("cartoon"), { scale: [1.25, 0.95, 1], x: ["3vw", "0vw"] }, { duration: 0.55, at: 0.6, ease: "easeOut" }],
    [speedlines("cartoon"), { opacity: [0, 1] }, { duration: 0.3, at: 0.7 }],
    [CAPTION, { opacity: [0, 1], y: [16, 0] }, { duration: 0.4, at: 1.0, ease: ease.enter }],
  ];
}

/** Hide the reveal's moving parts before the bus scene becomes visible. */
export function primeBus({ reduce }: TimelineOptions): AnimationSequence {
  return [
    [`${BUS_FLARES}, ${BUS_POOL}, ${BUS_COPY}, ${BUS_SWEEP}`, { opacity: 0 }, { duration: 0 }],
    ...(reduce ? [] : ([[subject("bus"), { scale: 1.06, filter: "brightness(0.35)" }, { duration: 0, at: 0 }]] as AnimationSequence)),
  ];
}

/** The dust storm: cartoon plants its feet, dust explodes, clears on the bus. */
export function toBus({ reduce }: TimelineOptions): AnimationSequence {
  if (reduce) {
    return [
      [CAPTION, { opacity: 0 }, { duration: 0.2 }],
      [scene("cartoon"), { opacity: 0 }, { duration: 0.5 }],
      [scene("bus"), { opacity: 1 }, { duration: 0.5, at: "<" }],
      [`${BUS_POOL}, ${BUS_COPY}`, { opacity: 1 }, { duration: 0.4 }],
      [BUS_FLARES, { opacity: 0.8 }, { duration: 0.4, at: "<" }],
    ];
  }
  return [
    [CAPTION, { opacity: 0 }, { duration: 0.15 }],
    // Plant the feet...
    [subject("cartoon"), { x: "-2vw", rotate: -4 }, { duration: 0.18, at: 0, ease: "easeOut" }],
    // ...and the dust explodes out of the anchor.
    [DUST, { opacity: [0, 1] }, { duration: 0.15, at: 0.12 }],
    [DUST, { "--p": [0, 1] }, { duration: 0.8, at: 0.12, ease: [0.1, 0.9, 0.3, 1] }],
    [subject("cartoon"), { scale: 0.8, opacity: 0 }, { duration: 0.35, at: 0.32 }],
    [HAZE, { opacity: [0, 0.96] }, { duration: 0.45, at: 0.32 }],
    // Swap scenes under full cover.
    [scene("cartoon"), { opacity: 0 }, { duration: 0.05, at: 0.8 }],
    [scene("bus"), { opacity: 1 }, { duration: 0.05, at: 0.8 }],
    // Dust clears and the bus emerges where the roadrunner stood.
    [HAZE, { opacity: 0 }, { duration: 0.7, at: 1.0, ease: ease.standard }],
    [DUST, { "--p": 1.9 }, { duration: 1.1, at: 1.0, ease: "easeOut" }],
    [DUST, { opacity: 0 }, { duration: 0.9, at: 1.1 }],
    [subject("bus"), { scale: [1.06, 1], filter: ["brightness(0.35)", "brightness(1)"] }, { duration: 1.1, at: 0.95, ease: ease.enter }],
    // Premium beats: lamps flare, the ground lights up, a sheen runs along the paint.
    [BUS_FLARES, { opacity: [0, 1, 0.8], scale: [0.2, 1.3, 1] }, { duration: 0.7, at: 1.55, delay: stagger(0.08) }],
    [BUS_POOL, { opacity: [0, 1] }, { duration: 0.8, at: 1.6 }],
    [BUS_SWEEP, { opacity: [0, 1] }, { duration: 0.15, at: 1.75 }],
    [BUS_SWEEP, { x: ["-100%", "170%"] }, { duration: 1.0, at: 1.75, ease: ease.standard }],
    [BUS_SWEEP, { opacity: 0 }, { duration: 0.2, at: 2.6 }],
    [BUS_COPY, { opacity: [0, 1], y: [24, 0] }, { duration: 0.55, at: 1.95, delay: stagger(0.09), ease: ease.enter }],
  ];
}

/** The finished bus scene (Skip, deep links, returning visitors). */
export function finalState(duration: number): AnimationSequence {
  return [
    [scene("real"), { opacity: 0 }, { duration }],
    [scene("cartoon"), { opacity: 0 }, { duration, at: 0 }],
    [scene("bus"), { opacity: 1 }, { duration, at: 0 }],
    [`${FLASH}, ${HAZE}, ${DUST}, ${BUS_SWEEP}`, { opacity: 0 }, { duration, at: 0 }],
    [subject("bus"), { scale: 1, filter: "brightness(1)" }, { duration, at: 0 }],
    [BUS_FLARES, { opacity: 0.8, scale: 1 }, { duration, at: 0 }],
    [`${BUS_POOL}, ${BUS_COPY}`, { opacity: 1, y: 0 }, { duration, at: 0 }],
  ];
}

/** Back to the very first frame (Replay). */
export function initialState(): AnimationSequence {
  const now = { duration: 0, at: 0 };
  return [
    [scene("real"), { opacity: 1 }, now],
    [`${scene("cartoon")}, ${scene("bus")}`, { opacity: 0 }, now],
    // filter "none" (not blur(0px)) so no idle filter layer is left on the full-screen camera.
    [`${camera("real")}, ${camera("cartoon")}`, { x: "0vw", scale: 1, filter: "none" }, now],
    [subject("real"), { x: "0vw", scale: 1, filter: "none" }, now],
    [subject("cartoon"), { x: "0vw", scale: 1, rotate: 0, opacity: 1 }, now],
    [speedlines("real"), { opacity: 0.35 }, now],
    [`${speedlines("cartoon")}, ${CAPTION}, ${FLASH}, ${HAZE}, ${DUST}`, { opacity: 0 }, now],
    [DUST, { "--p": 0 }, now],
  ];
}
