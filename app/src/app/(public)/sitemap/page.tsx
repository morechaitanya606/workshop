import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import StaticPage from "@/components/StaticPage";
import { getAbsoluteUrl } from "@/lib/env";
import { SEO_CITIES, cityPagePath } from "@/lib/seo";
import { SEO_TOPICS, topicPagePath } from "@/lib/seo-topics";

type SitemapLink = { href: string; label: string };

const links: SitemapLink[] = [
    { href: "/", label: "Home" },
    { href: "/explore", label: "Explore" },
    { href: "/past-events", label: "Past Events" },
    { href: "/communities", label: "Communities" },
    { href: "/become-a-host", label: "Become a Host" },
    { href: "/list-your-space", label: "List Your Space" },
    { href: "/help", label: "Help Center" },
    { href: "/safety", label: "Safety" },
    { href: "/cancellations", label: "Cancellations" },
    { href: "/legal/terms", label: "Terms" },
    { href: "/legal/privacy", label: "Privacy" },
    { href: "/contact", label: "Contact" },
];

// One group per city page, listing its activity pages. The list is static: a topic page with
// nothing to show answers noindex but still passes links on, so linking it is harmless.
const cityGroups = SEO_CITIES.map((city) => ({
    title: `Workshops in ${city.name}`,
    links: [
        { href: cityPagePath(city), label: `All workshops in ${city.name}` },
        ...SEO_TOPICS.map((topic) => ({
            href: topicPagePath(city, topic),
            label: topic.linkLabel,
        })),
    ],
}));

export const metadata: Metadata = {
    title: "Sitemap | Only Workshops",
    description:
        "Quick links to the main public pages across Only Workshops, including workshops in Pune by activity.",
    alternates: {
        canonical: getAbsoluteUrl("/sitemap"),
    },
};

function LinkList({ items }: { items: SitemapLink[] }) {
    return (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {items.map((item) => (
                <li key={item.href}>
                    <Link
                        href={item.href}
                        className="inline-flex items-center gap-1.5 text-terracotta font-inter font-medium hover:underline hover:gap-2.5 transition-all duration-200"
                    >
                        <ChevronRight className="w-4 h-4" />
                        {item.label}
                    </Link>
                </li>
            ))}
        </ul>
    );
}

export default function SitemapPage() {
    return (
        <StaticPage title="Sitemap" description="Quick links to the main pages on Only Workshops.">
            <div>
                <h2 className="heading-sm mb-3">Pages</h2>
                <LinkList items={links} />
            </div>
            {cityGroups.map((group) => (
                <div key={group.title}>
                    <h2 className="heading-sm mb-3">{group.title}</h2>
                    <LinkList items={group.links} />
                </div>
            ))}
        </StaticPage>
    );
}
