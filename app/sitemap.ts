import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/constants/site";
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/privacy", "/terms", "/community-guidelines", "/contact"].map(
    (path) => ({ url: new URL(path, siteUrl).href }),
  );
}
