import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
    const siteUrl = getAppUrl().replace(/\/$/, "");

    return {
        rules: [
            {
                userAgent: "*",
                allow: "/",
                disallow: [
                    "/admin",
                    "/api",
                    "/auth",
                    "/booking",
                    "/chatbot/embed",
                    "/communities/new",
                    "/communities/*/join",
                    "/dashboard",
                    "/host",
                    "/profile",
                ],
            },
        ],
        sitemap: `${siteUrl}/sitemap.xml`,
    };
}
