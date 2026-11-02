import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    // 85 is used for the bus photos (the exterior is a cutout, where compression artefacts would show on the edges).
    qualities: [75, 85],
  },
  async headers() {
    // Until launch (see src/lib/indexing.ts), every response also tells crawlers not to index it.
    const noindex = process.env.SITE_INDEXABLE === "true" && process.env.VERCEL_ENV !== "preview" ? [] : [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
    return [
      { source: "/:path*", headers: [...securityHeaders, ...noindex] },
      // The intro film's files are named after their content (scripts/intro-video/hash.mjs): a name never changes
      // meaning, so browsers keep it for good. Only hashed names match (a plain one keeps the default revalidation).
      // Last, so it wins if a rule above ever sets Cache-Control too.
      {
        source: "/video/intro/:file([\\w-]+\\.[0-9a-f]{10}\\.(?:mp4|webm|webp))",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
