import type { Metadata } from "next";
import { IntroSequence } from "@/components/intro/intro-sequence";
import { FilmLayer, IntroCopy } from "@/components/intro/intro-layers";
import { SiteFooter } from "@/components/layout/site-footer";
import { AboutScene } from "@/components/scenes/about-scene";
import { BusScene } from "@/components/scenes/bus-scene";
import { ContactScene } from "@/components/scenes/contact-scene";
import { DayNightScene } from "@/components/scenes/day-night-scene";
import { EventsScene } from "@/components/scenes/events-scene";
import { FaqScene } from "@/components/scenes/faq-scene";
import { FeaturesScene } from "@/components/scenes/features-scene";
import { GalleryScene } from "@/components/scenes/gallery-scene";
import { HowScene } from "@/components/scenes/how-scene";
import { PackagesScene } from "@/components/scenes/packages-scene";
import { World } from "@/components/world/world";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

/**
 * The homepage is ONE continuous world, travelled sideways (a column on short
 * screens and without JS; src/components/world): the roadrunner runs into the
 * tunnel, the black party bus drives out, and the journey carries straight on
 * through every scene of the site (src/components/scenes). Everything to read
 * about Smokey's is here; only actions (book, call, message) open something,
 * over the world.
 */
export default function HomePage() {
  return (
    <World>
      <IntroSequence film={<FilmLayer />} copy={<IntroCopy />} />

      <main id="main" tabIndex={-1} className="outline-none world:flex world:h-full world:flex-none">
        <BusScene />
        <FeaturesScene />
        <GalleryScene />
        <DayNightScene />
        <PackagesScene />
        <EventsScene />
        <HowScene />
        <AboutScene />
        <FaqScene />
        <ContactScene />
      </main>

      <SiteFooter />
    </World>
  );
}
