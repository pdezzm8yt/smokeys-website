export type Package = {
  id: string;
  name: string;
  kicker: string;
  duration: string;
  features: string[];
  featured?: boolean;
  sample: boolean;
};

// TODO(owner): real package names, durations and inclusions. Pricing stays "request a quote".
export const packages: Package[] = [
  {
    id: "cruise",
    name: "The Cruise",
    kicker: "Point A to point B, done loud",
    duration: "3-hour minimum",
    features: ["Pickup & drop-off", "Full light show", "Bluetooth sound", "Ice & water"],
    sample: true,
  },
  {
    id: "night-out",
    name: "The Night Out",
    kicker: "Multiple stops, one crew",
    duration: "5 hours",
    features: ["Everything in The Cruise", "Unlimited stops on the route", "Custom playlist setup", "Red-carpet arrival"],
    featured: true,
    sample: true,
  },
  {
    id: "vip",
    name: "The VIP",
    kicker: "The whole night, handled",
    duration: "8 hours",
    features: ["Everything in The Night Out", "Themed lighting & decor", "Photo stop planning", "Priority date booking"],
    sample: true,
  },
];
