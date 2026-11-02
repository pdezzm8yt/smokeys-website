import { HowItWorks } from "@/components/home/how-it-works";
import { SectionHeading } from "@/components/ui/section-heading";
import { Scene } from "@/components/world/scene";

/** How booking works, in three steps. */
export function HowScene() {
  return (
    <Scene id="how" labelledBy="how-title">
      <div className="mx-auto max-w-5xl">
        <SectionHeading id="how-title" eyebrow="How booking works" title="Three steps to showtime." align="center" className="mb-16 world:mb-10" />
        <HowItWorks />
      </div>
    </Scene>
  );
}
