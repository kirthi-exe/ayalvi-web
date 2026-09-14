import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/constants/site";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/ref/", "/waitlist/success"],
    },
    sitemap: new URL("/sitemap.xml", siteUrl).href,
  };
}
