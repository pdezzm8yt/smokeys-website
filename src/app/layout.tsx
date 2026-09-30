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
 * Runs before first paint: returning visitors (this tab session) and deep
 * links skip straight to the bus, and the header starts hidden for the intro.
 * A tap on the intro before React has hydrated (slow networks) is remembered
 * in data-intro-queued, so it still starts the shot once everything is ready.
 * Failsafe: if the intro's JS hasn't taken over the loader within 12 s (it sets
 * data-intro-loading="js"), show the finished reveal instead of a stuck loader.
 */
const introBootScript = `try{var d=document.documentElement;if(sessionStorage.getItem("smokeys:intro-seen")||location.hash){d.dataset.intro="seen"}else if(location.pathname==="/"){d.dataset.introStage="real";d.dataset.introLoading="";d.dataset.introArmed="idle";setTimeout(function(){if(d.dataset.introLoading===""){d.dataset.intro="seen";delete d.dataset.introStage;d.removeAttribute("data-intro-loading")}},12000);document.addEventListener("click",function q(e){var t=e.target;if(t&&t.closest&&t.closest("#top")&&!t.closest("a,button")){d.dataset.introQueued="";document.removeEventListener("click",q,true)}},true)}}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: introBootScript }} />
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
