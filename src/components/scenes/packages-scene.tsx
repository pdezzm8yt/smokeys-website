import { PackagesGrid } from "@/components/home/packages-grid";
import { SampleTag } from "@/components/ui/sample-tag";
import { SectionHeading } from "@/components/ui/section-heading";
import { Scene } from "@/components/world/scene";
import { packages } from "@/content/packages";

/**
 * The packages, each a stop along the way ("Request pricing" opens the booking panel).
 *
 * Down the page: the centred heading over the cards. Sideways the heading (and
 * the Sample tag) stand in their own column, centred beside the row of cards:
 * from xl the whole comparison fits one screen (the cards share what's left);
 * narrower, the scene runs along the world, one phone-wide column per card, so
 * the visitor swipes from the heading through the packages.
 */
export function PackagesScene() {
  return (
    <Scene id="packages" labelledBy="packages-title" wide className="xl:world:w-screen" panelClassName="xl:world:w-full">
      <div className="world:grid world:grid-cols-[min(100vw-5rem,22rem)_auto] world:grid-rows-[1fr_auto_auto_1fr] world:gap-x-6 sm:world:gap-x-10 xl:world:grid-cols-[minmax(17.5rem,1fr)_minmax(0,3fr)]">
        <SectionHeading
          id="packages-title"
          eyebrow="Packages"
          title="Pick your pace."
          lede="Pricing depends on date, hours and route, so request a quote for an exact number."
          align="center"
          className="mb-16 world:col-start-1 world:row-start-2 world:mx-0 world:mb-0 world:items-start world:text-left"
        />
        <PackagesGrid packages={packages} className="world:col-start-2 world:row-span-full world:self-center" />
        {packages.some((p) => p.sample) && (
          <div className="mt-8 flex justify-center world:col-start-1 world:row-start-3 world:mt-6 world:justify-start">
            <SampleTag label="Sample packages · final lineup coming" />
          </div>
        )}
      </div>
    </Scene>
  );
}
