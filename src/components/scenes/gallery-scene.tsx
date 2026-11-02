import { GalleryPreview } from "@/components/home/gallery-preview";
import { SectionHeading } from "@/components/ui/section-heading";
import { Scene } from "@/components/world/scene";
import { gallery } from "@/content/gallery";

/**
 * Inside and out, in pictures (the lightbox opens over the world). Sideways
 * the panel fills the screen's height: the heading and the filter make a
 * column of their own, and the photos run on along the world beside them in
 * two rows (as wide as they need: fewer photos, a narrower scene). The panel
 * never scrolls sideways: while a filter's tiles glide into place it has
 * already narrowed, and they're clipped at its edge, never given a scrollbar.
 */
export function GalleryScene() {
  return (
    <Scene id="gallery" labelledBy="gallery-title" wide panelClassName="world:h-full world:overflow-x-hidden">
      <GalleryPreview
        items={gallery}
        heading={<SectionHeading id="gallery-title" eyebrow="Gallery" title="See it lit." className="mb-10 world:mb-6" />}
      />
    </Scene>
  );
}
