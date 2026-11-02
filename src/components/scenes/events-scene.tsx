import { OccasionsRail } from "@/components/home/occasions-rail";
import { SampleTag } from "@/components/ui/sample-tag";
import { SectionHeading } from "@/components/ui/section-heading";
import { Scene } from "@/components/world/scene";
import { occasions, occasionsSample } from "@/content/occasions";

/** The occasions, along the journey ("Plan this ride" opens the booking panel with the occasion filled in). */
export function EventsScene() {
  return (
    <Scene id="events" labelledBy="events-title" panelClassName="overflow-hidden">
      <SectionHeading id="events-title" eyebrow="Occasions" title="Whatever you're celebrating, we'll get you there loud." className="mb-4" />
      <OccasionsRail occasions={occasions} />
      {occasionsSample && <SampleTag label="Sample event list · confirm before launch" className="mt-6" />}
    </Scene>
  );
}
