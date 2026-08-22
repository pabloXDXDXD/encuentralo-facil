import type { MetadataRoute } from "next";
import { listBarrios, listProductSlugs } from "@/lib/repo";

// Regenerated hourly; falls back to static routes if the DB is unreachable.
export const revalidate = 3600;

function base(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${base()}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${base()}/como-funciona`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const [barrios, slugs] = await Promise.all([listBarrios(), listProductSlugs()]);
    for (const b of barrios) {
      entries.push({
        url: `${base()}/barrio/${encodeURIComponent(b)}`,
        lastModified: now,
        changeFrequency: "hourly",
        priority: 0.8,
      });
    }
    for (const slug of slugs) {
      entries.push({
        url: `${base()}/producto/${slug}`,
        lastModified: now,
        changeFrequency: "hourly",
        priority: 0.8,
      });
    }
  } catch {
    /* DB unreachable at build time -> static routes only */
  }

  return entries;
}
