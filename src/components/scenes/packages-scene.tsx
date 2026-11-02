import { PackagesGrid } from "@/components/home/packages-grid";
import { SectionHeading } from "@/components/ui/section-heading";
import { Scene } from "@/components/world/scene";
import { packages } from "@/content/packages";

/** The packages, each a stop along the way ("Request pricing" opens the booking panel). */
export function PackagesScene() {
  return (
    <Scene id="packages" labelledBy="packages-title">
      <SectionHeading
        id="packages-title"
        eyebrow="Packages"
        title="Pick your pace."
        lede="Pricing depends on date, hours and route, so request a quote for an exact number."
        align="center"
        className="mb-16 world:mb-8"
      />
      <PackagesGrid packages={packages} />
    </Scene>
  );
}
