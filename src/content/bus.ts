export type Fact = { value: number; suffix?: string; label: string; sample: boolean };

// TODO(owner): replace every sample value with the real bus specs.
export const busFacts: Fact[] = [
  { value: 30, suffix: "", label: "Passengers", sample: true },
  { value: 12, suffix: "", label: "Lighting zones", sample: true },
  { value: 2000, suffix: "W", label: "Sound system", sample: true },
  { value: 7, suffix: " days", label: "A week", sample: true },
];

export type Hotspot = {
  id: string;
  label: string;
  body: string;
  /** Position in % of the illustration box. */
  x: number;
  y: number;
};

// Positions are % of each photo (src/assets/intro/bus-exterior.webp, bus-interior.jpg).
// Copy only describes what the photos show. TODO(owner): add specs (capacity, sound system).
export const exteriorHotspots: Hotspot[] = [
  { id: "paint", label: "Gloss-black exterior", body: "Blacked-out paint and dark-tinted glass, bumper to bumper.", x: 24, y: 72 },
  { id: "glass", label: "Tinted windows", body: "Deep-tinted side windows keep the party inside private.", x: 22, y: 38 },
  { id: "entry", label: "Double glass doors", body: "A wide double-door entry for easy on and off, even in formalwear.", x: 41.5, y: 58 },
];

export const interiorHotspots: Hotspot[] = [
  { id: "ceiling", label: "LED ceiling strips", body: "Light strips run the full length of the cabin ceiling.", x: 30, y: 24 },
  { id: "seating", label: "Diamond-stitched lounge seating", body: "Leather lounge seating lines both sides, so the whole group faces each other.", x: 14, y: 72 },
  { id: "console", label: "Lit refreshment console", body: "Illuminated consoles with cup holders sit right between the seats.", x: 34, y: 63 },
  { id: "sound", label: "Ceiling speakers", body: "Speakers are built into the ceiling panels along the cabin.", x: 80, y: 26 },
  { id: "floor", label: "Floor lighting", body: "Color floor lighting runs the length of the aisle.", x: 36, y: 90 },
];
