/**
 * Search-engine indexing is OFF until launch. Set SITE_INDEXABLE=true in the
 * Vercel *production* environment once content, images and licences are
 * final. Preview deployments are never indexable.
 */
export const siteIndexable = process.env.SITE_INDEXABLE === "true" && process.env.VERCEL_ENV !== "preview";
