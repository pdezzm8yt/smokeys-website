import type { MetadataRoute } from "next";
import { site } from "@/content/site";
import { siteIndexable } from "@/lib/indexing";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: siteIndexable ? { userAgent: "*", allow: "/" } : { userAgent: "*", disallow: "/" },
    sitemap: `${site.url}/sitemap.xml`,
  };
}
