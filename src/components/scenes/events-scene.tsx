import { OccasionsRail } from "@/components/home/occasions-rail";
import { SampleTag } from "@/components/ui/sample-tag";
import { SectionHeading } from "@/components/ui/section-heading";
import { Scene } from "@/components/world/scene";
import { occasions, occasionsSample } from "@/content/occasions";

/**
 * The occasions, along the journey ("Plan this ride" opens the booking panel with the occasion filled in).
 *
 * Down the page: the heading over the rail (its own sideways scroller). Sideways
 * the heading (and the Sample tag) stand in their own column, centred beside
 * the occasions laid out flat as one row: the scene runs along the world.
 */
export function EventsScene() {
  return (
    <Scene id="events" labelledBy="events-title" wide panelClassName="overflow-hidden">
      <div className="world:grid world:grid-cols-[min(100vw-5rem,30rem)_auto] world:grid-rows-[1fr_auto_auto_1fr] world:gap-x-6 sm:world:gap-x-10 lg:world:gap-x-14">
        <SectionHeading
          id="events-title"
          eyebrow="Occasions"
          title="Whatever you're celebrating, we'll get you there loud."
          className="mb-4 world:col-start-1 world:row-start-2 world:mb-0"
        />
        <OccasionsRail occasions={occasions} className="world:col-start-2 world:row-span-full world:self-center" />
        {occasionsSample && (
          <SampleTag
            label="Sample event list · confirm before launch"
            className="mt-6 world:col-start-1 world:row-start-3 world:justify-self-start"
          />
        )}
      </div>
    </Scene>
  );
}
