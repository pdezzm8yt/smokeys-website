import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
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
    url: "/",
  },
  twitter: { card: "summary_large_image", title: `${site.name} Party Bus`, description: site.description },
  alternates: { canonical: "/" },
  formatDetection: { telephone: false },
  robots: siteIndexable ? undefined : { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0a10",
  colorScheme: "dark",
  viewportFit: "cover",
};

/**
 * Runs before first paint on the homepage. At the top, the intro's branded
 * loader shows (and the page holds still, so an early scroll can't run ahead
 * of the footage) until the footage is in memory, and the header stays out of
 * the way until the bus is revealed; a deep link (#bus…) starts with the header.
 * Failsafe: if the intro's JS hasn't taken over the loader within 12 s (it sets
 * data-intro-loading="js"), show the finished hero instead of a stuck loader.
 * Until JS takes over, Skip already works (finished hero, at the end of the
 * intro) and a restored scroll position (reload, back) is let go of.
 */
const introBootScript = `try{var d=document.documentElement;if(location.pathname==="/"){if(location.hash&&location.hash!=="#top"){d.dataset.introStage="bus"}else{d.dataset.introStage="real";d.dataset.introLoading="";d.dataset.scrollLock="";var js=function(){return d.dataset.introLoading==="js"||!d.hasAttribute("data-intro-loading")},free=function(){delete d.dataset.scrollLock;d.removeAttribute("data-intro-loading")},top=function(){return document.getElementById("top")},end=function(){var s=top();return s?s.offsetTop+s.offsetHeight-innerHeight:0};setTimeout(function(){if(d.dataset.introLoading===""){d.dataset.introFinal="";d.dataset.introFailed="";delete d.dataset.introStage;free()}},12000);document.addEventListener("click",function k(e){var t=e.target;if(js()){document.removeEventListener("click",k,true);return}if(t&&t.closest&&t.closest('[data-intro-hint="skip"]')){d.dataset.introFinal="";d.dataset.introStage="bus";free();scrollTo({top:end(),behavior:"instant"})}},true);addEventListener("scroll",function r(){if(js()){removeEventListener("scroll",r);return}if(scrollY>8){free();if(scrollY>=end()-8)d.dataset.introStage="bus"}},{passive:true})}}}catch(e){}`;

/** No JavaScript: no scroll story, just the finished hero (the bus, SMOKEY'S and the CTAs). */
const introNoScript = `.intro-scroll{height:100lvh}[data-scene="real"],[data-scene="cartoon"]{opacity:0;visibility:hidden}[data-scene="bus"],[data-bus-copy]{opacity:1;visibility:visible}[data-bus-shade]{opacity:0}[data-intro-hint],[data-clip]{display:none}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: introBootScript }} />
        <noscript>
          <style>{introNoScript}</style>
        </noscript>
      </head>
      <body className="bg-background text-foreground">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-5 focus:py-3 focus:font-semibold focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <Providers>
          <SiteHeader />
          {children}
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
