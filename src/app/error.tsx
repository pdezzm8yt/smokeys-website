"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/layout/site-footer";
import { setAxis } from "@/components/world/world-axis";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // An error on the homepage can leave its world's state on <html> (the boot script sets it before any React
  // runs): this page is an ordinary column, so it must scroll and lay out as one.
  useEffect(() => {
    setAxis(null);
    const html = document.documentElement;
    for (const name of ["data-scroll-lock", "data-intro-loading", "data-intro-pending", "data-intro-final", "data-intro-failed", "data-world-ready"]) html.removeAttribute(name);
  }, []);

  return (
    <>
      <main id="main" className="grid min-h-dvh place-items-center px-4 text-center">
        <div data-panel className="glass flex flex-col items-center gap-5 rounded-[1.75rem] px-8 py-12 sm:px-14" role="alert">
          <h1 className="font-display text-3xl font-bold">We hit a pothole.</h1>
          <p className="max-w-sm text-muted-foreground">Something went wrong loading this page. Try again, and if it keeps happening, give us a call.</p>
          <Button size="lg" onClick={reset}>
            Try again
          </Button>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
