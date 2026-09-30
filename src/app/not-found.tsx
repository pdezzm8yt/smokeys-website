import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4 text-center">
      <div className="flex flex-col items-center gap-5">
        <p className="font-display text-7xl font-black text-primary text-glow-amber">404</p>
        <h1 className="font-display text-3xl font-bold">Wrong turn.</h1>
        <p className="max-w-sm text-muted-foreground">This stop isn&apos;t on the route. Let&apos;s get you back on the bus.</p>
        <ButtonLink href="/" size="lg">
          Back to Smokey&apos;s
        </ButtonLink>
      </div>
    </main>
  );
}
