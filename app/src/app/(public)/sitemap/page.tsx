import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import StaticPage from "@/components/StaticPage";
import { getAbsoluteUrl } from "@/lib/env";

const links = [
    { href: "/", label: "Home" },
    { href: "/explore", label: "Explore" },
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

export const metadata: Metadata = {
    title: "Sitemap | Only Workshops",
    description: "Quick links to the main public pages across Only Workshops.",
    alternates: {
        canonical: getAbsoluteUrl("/sitemap"),
    },
};

export default function SitemapPage() {
    return (
        <StaticPage title="Sitemap" description="Quick links to the main pages on Only Workshops.">
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {links.map((item) => (
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
        </StaticPage>
    );
}
