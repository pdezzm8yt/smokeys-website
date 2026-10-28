import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BusStats } from "@/components/home/bus-stats";
import { FaqList } from "@/components/home/faq-list";
import { GalleryPreview } from "@/components/home/gallery-preview";
import { HowItWorks } from "@/components/home/how-it-works";
import { MeetTheBus } from "@/components/home/meet-the-bus";
import { OccasionsRail } from "@/components/home/occasions-rail";
import { PackagesGrid } from "@/components/home/packages-grid";
import { QuoteCta } from "@/components/home/quote-cta";
import { IntroSequence } from "@/components/intro/intro-sequence";
import { FilmLayer, IntroCopy } from "@/components/intro/intro-layers";
import { PeriodControl, PeriodStatus } from "@/components/sky/period-control";
import { SampleTag } from "@/components/ui/sample-tag";
import { SectionHeading } from "@/components/ui/section-heading";
import { busFacts } from "@/content/bus";
import { faqs, faqsSample } from "@/content/faq";
import { gallery } from "@/content/gallery";
import { occasions, occasionsSample } from "@/content/occasions";
import { packages } from "@/content/packages";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

/**
 * One section of the page: a glass panel floating over the living sky (the
 * sky shows around and, on large screens, softly through it). data-panel
 * keeps clicks on it from reaching the sky's sun and moon.
 */
function Panel({ id, labelledBy, className, children }: { id?: string; labelledBy: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 sm:pt-16 lg:px-8">
      <div data-panel className={cn("glass rounded-[1.75rem] px-5 py-12 sm:px-10 sm:py-16 lg:px-14", className)}>
        {children}
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <IntroSequence film={<FilmLayer />} copy={<IntroCopy />} exploreHref="#bus" />

      <main id="main" tabIndex={-1} className="outline-none">
        <BusStats facts={busFacts} />

        <Panel id="bus" labelledBy="bus-title">
          <SectionHeading
            id="bus-title"
            eyebrow="The bus"
            title="Blacked out outside. Lit up inside."
            lede="Tap around the bus to see what's on board, from the LED ceiling to the sound system."
            className="mb-12"
          />
          <MeetTheBus />
        </Panel>

        <Panel id="day-night" labelledBy="day-night-title">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:items-center">
            <SectionHeading
              id="day-night-title"
              eyebrow="Day or night"
              title="A sunlit cruise, or a night under the stars?"
              lede="Choose the feel of your ride and the whole site follows. It's saved for your quote; you'll pick the exact date and time when you request it."
            />
            <div className="flex flex-col gap-4">
              <PeriodControl variant="large" />
              <PeriodStatus />
            </div>
          </div>
        </Panel>

        <Panel id="events" labelledBy="events-title" className="overflow-hidden">
          <SectionHeading id="events-title" eyebrow="Occasions" title="Whatever you're celebrating, we'll get you there loud." className="mb-4" />
          <OccasionsRail occasions={occasions} />
          {occasionsSample && <SampleTag label="Sample event list · confirm before launch" className="mt-6" />}
        </Panel>

        <Panel id="packages" labelledBy="packages-title">
          <SectionHeading
            id="packages-title"
            eyebrow="Packages"
            title="Pick your pace."
            lede="Pricing depends on date, hours and route, so request a quote for an exact number."
            align="center"
            className="mb-16"
          />
          <PackagesGrid packages={packages} />
        </Panel>

        <Panel labelledBy="how-title">
          <div className="mx-auto max-w-5xl">
            <SectionHeading id="how-title" eyebrow="How booking works" title="Three steps to showtime." align="center" className="mb-16" />
            <HowItWorks />
          </div>
        </Panel>

        <Panel id="gallery" labelledBy="gallery-title">
          <SectionHeading id="gallery-title" eyebrow="Gallery" title="See it lit." className="mb-10" />
          <GalleryPreview items={gallery} />
        </Panel>

        <Panel id="faq" labelledBy="faq-title" className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
          <SectionHeading
            id="faq-title"
            eyebrow="FAQ"
            title="Good questions."
            lede="Don't see yours? Ask when you request a quote and we'll answer it personally."
          />
          <div>
            <FaqList faqs={faqs} />
            {faqsSample && <SampleTag label="Sample answers · confirm before launch" className="mt-6" />}
          </div>
        </Panel>

        <QuoteCta />
      </main>
    </>
  );
}
