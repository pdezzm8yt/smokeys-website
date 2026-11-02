import { PeriodControl, PeriodStatus } from "@/components/sky/period-control";
import { SectionHeading } from "@/components/ui/section-heading";
import { Scene } from "@/components/world/scene";

/** Day ride or night ride: the whole world's sky follows the choice. */
export function DayNightScene() {
  return (
    <Scene id="day-night" labelledBy="day-night-title">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:items-center">
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
