import { BusStats } from "@/components/home/bus-stats";
import { SectionHeading } from "@/components/ui/section-heading";
import { Scene } from "@/components/world/scene";
import { busFacts } from "@/content/bus";

/**
 * The bus at a glance. Sideways it's a compact stop along the way: a panel
 * only as wide as its four numbers need, the sky showing either side.
 */
export function FeaturesScene() {
  return (
    <Scene id="features" labelledBy="features-title" panelClassName="world:mx-auto world:w-[min(100%,60rem)]">
      <SectionHeading id="features-title" eyebrow="Features" title="Smokey's at a glance." align="center" className="mb-10 world:mb-8" />
      <BusStats facts={busFacts} />
    </Scene>
  );
}
