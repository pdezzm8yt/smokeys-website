import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4 text-center">
      <div data-panel className="glass flex flex-col items-center gap-5 rounded-[1.75rem] px-8 py-12 sm:px-14">
        <p className="font-display text-7xl font-black text-gold">404</p>
        <h1 className="font-display text-3xl font-bold">Wrong turn.</h1>
        <p className="max-w-sm text-muted-foreground">This stop isn&apos;t on the route. Let&apos;s get you back on the bus.</p>
        <ButtonLink href="/" size="lg">
          Back to Smokey&apos;s
        </ButtonLink>
      </div>
    </main>
  );
}
