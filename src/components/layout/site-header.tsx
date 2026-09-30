"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { nav, quoteHref, site } from "@/content/site";
import { Logo } from "./logo";

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Solid background once the user scrolls; only re-render when the threshold flips.
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setScrolled(window.scrollY > 24));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const openMenu = () => dialogRef.current?.showModal();
  const closeMenu = () => dialogRef.current?.close();

  return (
    <header
      data-site-header
      className={cn(
        "fixed inset-x-0 top-0 z-40 h-(--header-h) transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled ? "border-b border-white/8 bg-background/75 backdrop-blur-xl" : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-full max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        {/* The homepage's hero is the end of the intro film (the bus, SMOKEY'S, the CTAs), not its first frame. */}
        <a href="#intro-end" className="-m-2 rounded-lg p-2" aria-label={`${site.name} home`}>
          <Logo />
        </a>

        <nav aria-label="Main" className="ms-auto hidden lg:block">
          <ul className="flex items-center gap-1">
            {nav.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="relative rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground after:absolute after:inset-x-4 after:bottom-1 after:h-px after:origin-left after:scale-x-0 after:bg-primary after:transition-transform after:duration-300 hover:after:scale-x-100"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <a href={quoteHref} className={buttonClasses({ className: "ms-auto max-sm:h-10 max-sm:px-4 lg:ms-0" })}>
          Get a Quote
        </a>
        <button
          type="button"
          onClick={openMenu}
          aria-haspopup="dialog"
          className="-me-2 grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-white/8 lg:hidden"
        >
          <Menu aria-hidden="true" className="size-6" />
          <span className="sr-only">Open menu</span>
        </button>
      </div>

      {/* Native modal dialog: focus trap, Esc to close and inert background for free. */}
      <dialog
        ref={dialogRef}
        aria-label="Menu"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeMenu(); // backdrop click
        }}
        className={cn(
          "fixed inset-y-0 ms-auto me-0 h-dvh max-h-dvh w-[min(22rem,88vw)] bg-surface p-0 text-foreground shadow-2xl ring-1 ring-white/10",
          "translate-x-full opacity-0 transition-[translate,opacity,display,overlay] transition-discrete duration-300 ease-enter",
          "open:translate-x-0 open:opacity-100 starting:open:translate-x-full starting:open:opacity-0",
          "backdrop:bg-black/0 backdrop:backdrop-blur-none backdrop:transition-all backdrop:transition-discrete backdrop:duration-300",
          "open:backdrop:bg-black/60 open:backdrop:backdrop-blur-sm starting:open:backdrop:bg-black/0",
          "motion-reduce:transition-none",
        )}
      >
        <div className="flex h-full flex-col px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex h-12 items-center justify-between">
            <Logo />
            <button
              type="button"
              onClick={closeMenu}
              className="-me-2 grid size-11 place-items-center rounded-full transition-colors hover:bg-white/8"
            >
              <X aria-hidden="true" className="size-6" />
              <span className="sr-only">Close menu</span>
            </button>
          </div>
          <nav aria-label="Mobile" className="mt-8">
            <ul className="flex flex-col">
              {nav.map((item, i) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    onClick={closeMenu}
                    className="group flex items-center justify-between border-b border-white/8 py-4 font-display text-2xl font-bold transition-colors hover:text-primary"
                  >
                    {item.label}
                    <span aria-hidden="true" className="text-xs font-medium text-muted-foreground tabular-nums">
                      0{i + 1}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <a href={quoteHref} onClick={closeMenu} className={buttonClasses({ size: "lg", className: "mt-auto w-full" })}>
            Get a Quote
          </a>
          <a href={site.contact.phone.href} className="mt-4 text-center text-sm text-muted-foreground hover:text-foreground">
            or call {site.contact.phone.display}
          </a>
        </div>
      </dialog>
    </header>
  );
}
