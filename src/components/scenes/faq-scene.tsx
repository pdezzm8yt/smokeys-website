import { FaqList } from "@/components/home/faq-list";
import { SampleTag } from "@/components/ui/sample-tag";
import { SectionHeading } from "@/components/ui/section-heading";
import { Scene } from "@/components/world/scene";
import { faqs, faqsSample } from "@/content/faq";

/** Questions and answers. */
export function FaqScene() {
  return (
    <Scene id="faq" labelledBy="faq-title" panelClassName="grid gap-12 lg:grid-cols-[1fr_1.4fr] world:gap-8">
      <SectionHeading
        id="faq-title"
        eyebrow="FAQ"
        title="Good questions."
        lede="Don't see yours? Ask when you send your booking and we'll answer it personally."
      />
      <div>
        <FaqList faqs={faqs} />
        {faqsSample && <SampleTag label="Sample answers · confirm before launch" className="mt-6" />}
      </div>
    </Scene>
  );
}
