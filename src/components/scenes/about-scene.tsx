import { SampleTag } from "@/components/ui/sample-tag";
import { SectionHeading } from "@/components/ui/section-heading";
import { Scene } from "@/components/world/scene";

/**
 * About Smokey's. The owner's own story isn't in yet: the copy says what goes
 * here (nothing invented), tagged until it arrives. Sideways the panel is only
 * as wide as its text (the sky showing either side).
 */
export function AboutScene() {
  return (
    <Scene id="about" labelledBy="about-title" panelClassName="world:mx-auto world:w-[min(100%,52rem)]">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <SectionHeading
          id="about-title"
          eyebrow="About Smokey's"
          title="One black party bus. Your whole crew on board."
          lede="Smokey's own story goes here: who's behind the wheel, how it started, and what makes a ride with us different."
          align="center"
        />
        <SampleTag label="About text coming from Smokey's" className="mt-8" />
      </div>
    </Scene>
  );
}
