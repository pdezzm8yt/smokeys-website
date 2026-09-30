"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4 text-center">
      <div className="flex flex-col items-center gap-5" role="alert">
        <h1 className="font-display text-3xl font-bold">We hit a pothole.</h1>
        <p className="max-w-sm text-muted-foreground">Something went wrong loading this page. Try again, and if it keeps happening, give us a call.</p>
        <Button size="lg" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
