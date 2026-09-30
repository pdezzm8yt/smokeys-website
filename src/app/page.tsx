import { BusStats } from "@/components/home/bus-stats";
import { FaqList } from "@/components/home/faq-list";
import { GalleryPreview } from "@/components/home/gallery-preview";
import { HowItWorks } from "@/components/home/how-it-works";
import { MeetTheBus } from "@/components/home/meet-the-bus";
import { OccasionsRail } from "@/components/home/occasions-rail";
import { PackagesGrid } from "@/components/home/packages-grid";
import { QuoteCta } from "@/components/home/quote-cta";
import { IntroSequence } from "@/components/intro/intro-sequence";
import { SceneBus, SceneCartoon, SceneReal } from "@/components/intro/scenes";
import { SectionHeading } from "@/components/ui/section-heading";
import { busFacts } from "@/content/bus";
import { faqs } from "@/content/faq";
import { gallery } from "@/content/gallery";
import { occasions } from "@/content/occasions";
import { packages } from "@/content/packages";

export default function HomePage() {
  return (
    <>
      <IntroSequence real={<SceneReal />} cartoon={<SceneCartoon />} bus={<SceneBus />} exploreHref="#bus" />

      <main id="main" tabIndex={-1} className="outline-none">
        <BusStats facts={busFacts} />

        <section id="bus" aria-labelledby="bus-title" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <SectionHeading
            id="bus-title"
            eyebrow="The bus"
            title="Blacked out outside. Lit up inside."
            lede="Tap around the bus to see what's on board, from the LED ceiling to the sound system."
            className="mb-12"
          />
          <MeetTheBus />
        </section>

        <section id="events" aria-labelledby="events-title" className="relative overflow-hidden border-y border-white/6 bg-surface/40 py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              id="events-title"
              eyebrow="Occasions"
              title="Whatever you're celebrating, we'll get you there loud."
              className="mb-4"
            />
            <OccasionsRail occasions={occasions} />
          </div>
        </section>

        <section id="packages" aria-labelledby="packages-title" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <SectionHeading
            id="packages-title"
            eyebrow="Packages"
            title="Pick your pace."
            lede="Every package includes a professional driver, the full light show and the sound system. Pricing depends on date and route, so request a quote for an exact number."
            align="center"
            className="mb-16"
          />
          <PackagesGrid packages={packages} />
        </section>

        <section aria-labelledby="how-title" className="border-y border-white/6 bg-surface/40 px-4 py-24 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <SectionHeading id="how-title" eyebrow="How booking works" title="Three steps to showtime." align="center" className="mb-16" />
            <HowItWorks />
          </div>
        </section>

        <section id="gallery" aria-labelledby="gallery-title" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <SectionHeading id="gallery-title" eyebrow="Gallery" title="See it lit." className="mb-10" />
          <GalleryPreview items={gallery} />
        </section>

        <section id="faq" aria-labelledby="faq-title" className="mx-auto grid max-w-7xl gap-12 px-4 pb-24 sm:px-6 sm:pb-32 lg:grid-cols-[1fr_1.4fr] lg:px-8">
          <SectionHeading
            id="faq-title"
            eyebrow="FAQ"
            title="Good questions."
            lede="Don't see yours? Ask when you request a quote and we'll answer it personally."
          />
          <FaqList faqs={faqs} />
        </section>

        <QuoteCta />
      </main>
    </>
  );
}
