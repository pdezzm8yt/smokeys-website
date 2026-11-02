import { QuoteCta } from "@/components/home/quote-cta";
import { Scene } from "@/components/world/scene";

/** The end of the journey: book, schedule, call, text or email. */
export function ContactScene() {
  return (
    <Scene id="contact" labelledBy="quote-title">
      <QuoteCta />
    </Scene>
  );
}
