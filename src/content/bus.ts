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

export const exteriorHotspots: Hotspot[] = [
  { id: "paint", label: "Blackout exterior", body: "Gloss-black body and tinted glass. You see out; nobody sees in.", x: 34, y: 38 },
  { id: "underglow", label: "Underglow", body: "Color-matched LED underglow so the bus arrives before you do.", x: 55, y: 92 },
  { id: "entry", label: "Wide entry door", body: "Easy on-and-off for formalwear, heels and big groups.", x: 79, y: 58 },
];

export const interiorHotspots: Hotspot[] = [
  { id: "ceiling", label: "LED ceiling", body: "Programmable light show synced to the music.", x: 50, y: 14 },
  { id: "seating", label: "Wraparound lounge seating", body: "Perimeter leather seating keeps the whole group facing each other.", x: 22, y: 70 },
  { id: "sound", label: "Pro sound system", body: "Bluetooth or AUX: your playlist, club volume.", x: 82, y: 42 },
  { id: "bar", label: "Refreshment bar", body: "Ice, cups and water stocked. Bring your own drinks where legal (21+).", x: 60, y: 62 },
];
