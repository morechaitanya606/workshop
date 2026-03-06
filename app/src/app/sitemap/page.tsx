import Link from "next/link";
import StaticPage from "@/components/StaticPage";

const links = [
    { href: "/", label: "Home" },
    { href: "/explore", label: "Explore" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/admin", label: "Admin" },
    { href: "/auth/login", label: "Login" },
    { href: "/auth/signup", label: "Signup" },
    { href: "/legal/terms", label: "Terms" },
    { href: "/legal/privacy", label: "Privacy" },
];

export default function SitemapPage() {
    return (
        <StaticPage
            title="Sitemap"
            description="Quick links to the main pages on OnlyWorkshop."
        >
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {links.map((item) => (
                    <li key={item.href}>
                        <Link
                            href={item.href}
                            className="text-terracotta font-inter font-medium hover:underline"
                        >
                            {item.label}
                        </Link>
                    </li>
                ))}
            </ul>
        </StaticPage>
    );
}
