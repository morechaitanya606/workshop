import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
    const siteUrl = getAppUrl().replace(/\/$/, "");

    return {
        rules: [
            {
                userAgent: "*",
                allow: "/",
                disallow: ["/admin", "/dashboard", "/api"],
            },
        ],
        sitemap: `${siteUrl}/sitemap.xml`,
    };
}
