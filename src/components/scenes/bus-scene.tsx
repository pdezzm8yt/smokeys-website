import { MeetTheBus } from "@/components/home/meet-the-bus";
import { SectionHeading } from "@/components/ui/section-heading";
import { Scene } from "@/components/world/scene";

/**
 * The bus, up close: the photo with its hotspots and the feature list. The
 * heading goes into MeetTheBus, which lays the three out: stacked down the
 * page; sideways, along the world (a scene wider than the screen). On wider
 * screens the photo is as tall as the screen allows, so there the panel fills
 * the screen's height.
 */
export function BusScene() {
  return (
    <Scene id="bus" labelledBy="bus-title" wide panelClassName="sm:[@media(min-aspect-ratio:4/5)]:world:h-full">
      <MeetTheBus
        heading={
          <SectionHeading
            id="bus-title"
            eyebrow="The bus"
            title="Blacked out outside. Lit up inside."
            lede="Tap around the bus to see what's on board, from the LED ceiling to the sound system."
            // Sideways on short phones, a smaller title (two lines, not three) so the photo fits under it.
            className="mb-12 world:mb-0 max-sm:world:[@media(max-height:46rem)]:gap-3 max-sm:world:[@media(max-height:46rem)]:[&_h2]:text-2xl sm:[@media(min-aspect-ratio:4/5)]:world:w-[24rem]"
          />
        }
      />
    </Scene>
  );
}
