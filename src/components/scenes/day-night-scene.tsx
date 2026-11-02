import { PeriodControl, PeriodStatus } from "@/components/sky/period-control";
import { SectionHeading } from "@/components/ui/section-heading";
import { Scene } from "@/components/world/scene";

/**
 * Day ride or night ride: the whole world's sky follows the choice. Sideways
 * the panel is only as wide as it needs; on phones (too tall stacked for the
 * screen) the heading and the picker sit side by side along the world, the
 * heading's column a little narrower than the screen so the picker peeks in
 * from the edge.
 */
export function DayNightScene() {
  return (
    <Scene
      id="day-night"
      labelledBy="day-night-title"
      className="max-sm:world:w-max max-sm:world:min-w-screen"
      panelClassName="world:mx-auto world:w-[min(100%,72rem)] max-sm:world:w-max"
    >
      <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:items-center max-sm:world:grid-cols-[calc(100vw-6rem)_calc(100vw-4rem)] max-sm:world:items-center max-sm:world:gap-6">
        <SectionHeading
          id="day-night-title"
          eyebrow="Day or night"
          title="A sunlit cruise, or a night under the stars?"
          lede="Choose the feel of your ride and the whole world follows. It's saved for your booking; you'll pick the exact date and time when you send it."
        />
        <div className="flex flex-col gap-4">
          <PeriodControl variant="large" />
          <PeriodStatus announce />
        </div>
      </div>
    </Scene>
  );
}
