import { GalleryPreview } from "@/components/home/gallery-preview";
import { SectionHeading } from "@/components/ui/section-heading";
import { Scene } from "@/components/world/scene";
import { gallery } from "@/content/gallery";

/** Inside and out, in pictures (the lightbox opens over the world). */
export function GalleryScene() {
  return (
    <Scene id="gallery" labelledBy="gallery-title">
      <SectionHeading id="gallery-title" eyebrow="Gallery" title="See it lit." className="mb-10 world:mb-6" />
      <GalleryPreview items={gallery} />
    </Scene>
  );
}
