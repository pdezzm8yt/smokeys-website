import { Instrument_Sans, Unbounded } from "next/font/google";

export const displayFont = Unbounded({
  subsets: ["latin"],
  weight: ["500", "700", "900"],
  variable: "--font-display-face",
  display: "swap",
});

export const bodyFont = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
