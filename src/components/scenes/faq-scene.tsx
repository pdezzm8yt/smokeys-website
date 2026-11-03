import { FaqList } from "@/components/home/faq-list";
import { SampleTag } from "@/components/ui/sample-tag";
import { SectionHeading } from "@/components/ui/section-heading";
import { Scene } from "@/components/world/scene";
import { faqs, faqsSample } from "@/content/faq";

/**
 * Questions and answers. Sideways the panel is only as wide as it needs; on
 * phones the heading and the questions are laid out along the world (too tall
 * stacked for the screen): the heading's column a little narrower than the
 * screen so the questions peek in, then the questions in two columns
 * (faq-list.tsx).
 */
export function FaqScene() {
  return (
    <Scene
      id="faq"
      labelledBy="faq-title"
      className="max-sm:world:w-max max-sm:world:min-w-screen"
      panelClassName="grid gap-12 lg:grid-cols-[1fr_1.4fr] world:mx-auto world:w-[min(100%,76rem)] world:gap-8 max-sm:world:w-max max-sm:world:grid-cols-[calc(100vw-6rem)_auto] max-sm:world:items-center max-sm:world:gap-6"
    >
      <SectionHeading
        id="faq-title"
        eyebrow="FAQ"
        title="Good questions."
        lede="Don't see yours? Ask when you send your booking and we'll answer it personally."
      />
      <FaqList faqs={faqs} note={faqsSample && <SampleTag label="Sample answers · confirm before launch" className="mt-6" />} />
    </Scene>
  );
}
