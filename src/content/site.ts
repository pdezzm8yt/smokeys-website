/**
 * Site-wide facts. Anything marked `sample: true` is a stand-in that the
 * owner must confirm before launch — the UI shows a "Sample" tag next to it.
 */
export const site = {
  name: "Smokey's",
  legalName: "Smokey's Party Bus", // TODO(owner): confirm legal/business name
  tagline: "Roadrunner fast. Party-bus loud.",
  description:
    "Smokey's is a black party bus built for birthdays, prom, weddings, nights out and every event worth arriving loud. Request a quote in minutes.",
  url: "https://smokeys.example", // TODO(owner): production domain
  contact: {
    // 555-01xx numbers are reserved for fiction — replace before launch.
    phone: { display: "(555) 010-0199", href: "tel:+15550100199", sample: true },
    email: { display: "bookings@smokeys.example", href: "mailto:bookings@smokeys.example", sample: true },
    serviceArea: { display: "Your city & surrounding areas", sample: true },
  },
  social: [] as { label: string; href: string }[], // TODO(owner): Instagram, TikTok, Facebook
} as const;

/**
 * Primary navigation. Anchors point at homepage sections for now; each will
 * switch to its own route (/party-bus, /packages, …) when that page is built.
 */
export const nav = [
  { label: "The Bus", href: "#bus" },
  { label: "Events", href: "#events" },
  { label: "Packages", href: "#packages" },
  { label: "Gallery", href: "#gallery" },
  { label: "FAQ", href: "#faq" },
] as const;

export const quoteHref = "#quote";
