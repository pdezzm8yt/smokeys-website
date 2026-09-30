export type OccasionIcon =
  | "cake" | "party" | "moon" | "rings" | "crown" | "glass" | "music" | "trophy" | "users" | "sparkles";

export type Occasion = { slug: string; title: string; blurb: string; icon: OccasionIcon };

export const occasions: Occasion[] = [
  { slug: "birthdays", title: "Birthdays", blurb: "Turn the ride into the party. Door-to-door, no designated driver needed.", icon: "cake" },
  { slug: "prom", title: "Prom", blurb: "Arrive together, photos ready, with a parent-friendly itinerary.", icon: "crown" },
  { slug: "weddings", title: "Weddings", blurb: "Move the wedding party between ceremony, photos and reception in style.", icon: "rings" },
  { slug: "bachelor-bachelorette", title: "Bachelor & Bachelorette", blurb: "Bar-hop without the rideshare shuffle. One bus, one crew.", icon: "glass" },
  { slug: "nightlife", title: "Nightlife", blurb: "Club to club with the music already going between stops.", icon: "moon" },
  { slug: "concerts", title: "Concerts", blurb: "Pregame on the way, skip the parking lot on the way out.", icon: "music" },
  { slug: "sporting-events", title: "Sporting Events", blurb: "Tailgate energy from your driveway to the stadium gate.", icon: "trophy" },
  { slug: "parties", title: "Parties", blurb: "Holiday parties, reunions, graduations. If it's a celebration, we roll.", icon: "party" },
  { slug: "group-transportation", title: "Group Transportation", blurb: "Corporate outings, wine tours, airport runs for the whole group.", icon: "users" },
  { slug: "custom", title: "Custom Events", blurb: "Got something unusual in mind? Tell us and we'll plan the route.", icon: "sparkles" },
];
