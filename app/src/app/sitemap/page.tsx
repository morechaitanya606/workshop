import Link from "next/link";
import { ChevronRight } from "lucide-react";
import StaticPage from "@/components/StaticPage";

const links = [
    { href: "/", label: "Home" },
    { href: "/explore", label: "Explore" },
    { href: "/admin", label: "Admin" },
    { href: "/auth/login", label: "Login" },
    { href: "/auth/signup", label: "Signup" },
    { href: "/legal/terms", label: "Terms" },
    { href: "/legal/privacy", label: "Privacy" },
];

export default function SitemapPage() {
    return (
        <StaticPage title="Sitemap" description="Quick links to the main pages on Only Workshop.">
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
