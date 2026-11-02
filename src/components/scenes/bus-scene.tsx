import { MeetTheBus } from "@/components/home/meet-the-bus";
import { SectionHeading } from "@/components/ui/section-heading";
import { Scene } from "@/components/world/scene";

/** The bus, up close: the photo with its hotspots and the feature list. */
export function BusScene() {
  return (
    <Scene id="bus" labelledBy="bus-title">
      <SectionHeading
        id="bus-title"
        eyebrow="The bus"
        title="Blacked out outside. Lit up inside."
        lede="Tap around the bus to see what's on board, from the LED ceiling to the sound system."
        className="mb-12 world:mb-6"
      />
      <MeetTheBus />
    </Scene>
  );
}
