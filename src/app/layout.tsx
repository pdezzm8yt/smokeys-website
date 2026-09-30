import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { site } from "@/content/site";
import { bodyFont, displayFont } from "@/lib/fonts";
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
};

export const viewport: Viewport = {
  themeColor: "#0b0a10",
  colorScheme: "dark",
  viewportFit: "cover",
};

/**
 * Runs before first paint: returning visitors (this tab session) and deep
 * links skip straight to the bus, and the header starts hidden for the intro.
 */
const introBootScript = `try{var d=document.documentElement;if(sessionStorage.getItem("smokeys:intro-seen")||location.hash){d.dataset.intro="seen"}else if(location.pathname==="/"){d.dataset.introStage="real"}}catch(e){}`;

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
