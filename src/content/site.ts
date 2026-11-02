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
 * Primary navigation. Homepage sections for now ("/#…", so they also work
 * from any other route, like the 404 page); each will switch to its own route
 * (/party-bus, /packages, …) when that page is built.
 */
/**
 * The scenes of the homepage's world, in travel order (each glides there, so
 * "/#…" works from any page). Home is where the bus comes out of the tunnel.
 */
export const nav = [
  { label: "Home", href: "/#intro-end" },
  { label: "Bus", href: "/#bus" },
  { label: "Features", href: "/#features" },
  { label: "Gallery", href: "/#gallery" },
  { label: "Packages", href: "/#packages" },
  { label: "Events", href: "/#events" },
  { label: "About", href: "/#about" },
  { label: "Contact", href: "/#contact" },
] as const;

/** Where booking and quote links go without JavaScript (with it, they open the booking panel: data-action). */
export const quoteHref = "/#contact";
