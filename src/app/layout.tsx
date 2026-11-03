import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { noScriptBandCss } from "@/components/intro/intro-film";
import { ActionDrawer } from "@/components/actions/action-drawer";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/layout/site-header";
import { LivingSky } from "@/components/sky/living-sky";
import { site } from "@/content/site";
import { bodyFont, displayFont } from "@/lib/fonts";
import { siteIndexable } from "@/lib/indexing";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} Party Bus | Black Party Bus Rentals`, template: `%s | ${site.name} Party Bus` },
  description: site.description,
  openGraph: {
    type: "website",
    siteName: `${site.name} Party Bus`,
    title: `${site.name} Party Bus`,
    description: site.description,
  },
  // "summary" until there's a share image (opengraph-image); each page sets its own canonical and OG URL.
  twitter: { card: "summary", title: `${site.name} Party Bus`, description: site.description },
  formatDetection: { telephone: false },
  robots: siteIndexable ? undefined : { index: false, follow: false },
};

export const viewport: Viewport = {
  // The sky engine updates theme-color to the day or night sky as it changes.
  themeColor: "#040a26",
  colorScheme: "light dark",
  viewportFit: "cover",
};

/**
 * Runs before first paint on the homepage, which is one continuous world
 * (src/components/world): it runs sideways (html[data-axis="x"]) unless the
 * screen is too short for side-by-side scenes, where it's a column.
 * At the start of the world, the tunnel scene's branded loader shows (and the
 * world holds still, so an early swipe can't run ahead of the film) until its
 * JS takes over; a deep link (#bus…) or a restored position isn't held.
 * Failsafe: if the scene's JS hasn't taken over the loader within 12 s (it sets
 * data-intro-loading="js"), show the finished hero instead of a stuck loader.
 * Wrapped in a function: a classic script's top-level `var`s are window
 * properties, and some names are the browser's own (`var top=…` is silently
 * ignored: window.top can't be replaced).
 */
const introBootScript = `(function(){try{var d=document.documentElement;if(location.pathname==="/"){d.dataset.axis=matchMedia("(max-height: 30rem)").matches?"y":"x";if(!location.hash||location.hash==="#top"){d.dataset.introLoading="";d.dataset.scrollLock="";var js=function(){return d.dataset.introLoading==="js"||!d.hasAttribute("data-intro-loading")},free=function(){delete d.dataset.scrollLock;d.removeAttribute("data-intro-loading")},at=function(){var w=document.querySelector("[data-world]");return d.dataset.axis==="x"&&w?w.scrollLeft:scrollY};setTimeout(function(){if(d.dataset.introLoading===""){d.dataset.introFinal="";d.dataset.introFailed="";free()}},12000);addEventListener("scroll",function r(){if(js()){removeEventListener("scroll",r,true);return}if(at()>8)free()},{passive:true,capture:true})}}}catch(e){}})()`;

/**
 * Before first paint on every page: day or night sky (and the matching page
 * theme), from the visitor's day/night booking preference (src/lib/booking-store.ts,
 * BOOKING_KEY) or else the local time of day, so the wrong sky never flashes.
 * Without JS the night theme is the default.
 */
const skyBootScript = `(function(){try{var d=document.documentElement,p;try{p=JSON.parse(localStorage.getItem("smokeys:booking")||"{}").period}catch(e){}var h=new Date().getHours();d.dataset.sky=p==="day"||p==="night"?p:(h>=6&&h<19?"day":"night")}catch(e){}})()`;

/** No JavaScript: the world is a column, and the tunnel scene is just its finished hero (the bus, SMOKEY'S and the CTAs). */
const introNoScript = `.intro-scroll{height:100lvh}:is([data-still="rest"],[data-glow="rest"],[data-copy-scrim]){opacity:1}[data-bus-copy]{opacity:1;visibility:visible}:is([data-film],[data-caption],[data-intro-hint],[data-fx]){display:none}${noScriptBandCss()}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: skyBootScript }} />
        <script dangerouslySetInnerHTML={{ __html: introBootScript }} />
        <noscript>
          <style>{introNoScript}</style>
        </noscript>
      </head>
      {/* No background on body: the page's colour is html's, painted under the fixed sky (a body background would cover it). */}
      <body className="text-foreground">
        <LivingSky />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-5 focus:py-3 focus:font-semibold focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <Providers>
          <SiteHeader />
          {children}
          {/* Book, quote, schedule, message: opened over the page by any [data-action] link. */}
          <ActionDrawer />
        </Providers>
      </body>
    </html>
  );
}
