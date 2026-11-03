import { HowItWorks } from "@/components/home/how-it-works";
import { SectionHeading } from "@/components/ui/section-heading";
import { Scene } from "@/components/world/scene";

/**
 * How booking works, in three steps. Sideways the panel is only as wide as the
 * three steps need. On phones the steps stay in a row along the road (too tall
 * stacked for the screen): the scene runs wider than the screen, the heading
 * sits over the first step, and the road line leads on to the next two.
 */
export function HowScene() {
  return (
    <Scene
      id="how"
      labelledBy="how-title"
      className="max-sm:world:w-max max-sm:world:min-w-screen"
      panelClassName="world:mx-auto world:w-[min(100%,64rem)] max-sm:world:w-max"
    >
      <div className="mx-auto max-w-5xl">
        <SectionHeading
          id="how-title"
          eyebrow="How booking works"
          title="Three steps to showtime."
          align="center"
          className="mb-16 world:mb-10 max-sm:world:mx-0 max-sm:world:mb-8 max-sm:world:w-[calc(100vw-4rem)] max-sm:world:items-start max-sm:world:text-start"
        />
        <HowItWorks />
      </div>
    </Scene>
  );
}
