export type GalleryItem = {
  id: string;
  /** null → illustrated sample tile until real photos arrive. */
  src: string | null;
  alt: string;
  category: "exterior" | "interior" | "events";
  /** Visual seed for the sample tile. */
  hue: number;
  tall?: boolean;
};

// TODO(owner): replace with real photos (see src/content/assets.ts conventions).
export const gallery: GalleryItem[] = [
  { id: "g1", src: null, alt: "Sample: bus exterior at night", category: "exterior", hue: 70, tall: true },
  { id: "g2", src: null, alt: "Sample: LED ceiling light show", category: "interior", hue: 330 },
  { id: "g3", src: null, alt: "Sample: group arriving at an event", category: "events", hue: 295 },
  { id: "g4", src: null, alt: "Sample: lounge seating", category: "interior", hue: 205, tall: true },
  { id: "g5", src: null, alt: "Sample: underglow detail", category: "exterior", hue: 350 },
  { id: "g6", src: null, alt: "Sample: prom night departure", category: "events", hue: 40 },
];
