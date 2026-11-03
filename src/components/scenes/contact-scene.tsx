import { QuoteCta } from "@/components/home/quote-cta";
import { Scene } from "@/components/world/scene";

/**
 * The end of the journey: book, schedule, call, text or email. Wide on a
 * phone, sideways (QuoteCta lays it out along the world there); one screen
 * from `sm` up, where it fits as a single column.
 */
export function ContactScene() {
  return (
    <Scene
      id="contact"
      labelledBy="quote-title"
      wide
      className="sm:world:w-screen"
      panelClassName="sm:world:w-full sm:world:[@media(max-height:42rem)]:py-8"
    >
      <QuoteCta />
    </Scene>
  );
}
