"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Phone, Instagram } from "lucide-react";
import { RevealGroup, RevealItem } from "@/components/ui";
import { CONTACT_PAGE_HREF, CONTACT_PHONE_NUMBERS } from "@/lib/contact";

export default function Footer() {
    const pathname = usePathname();
    const isHomePage = pathname === "/";
    const showCompactMobileFooter = !isHomePage;
    const footerPhoneText = CONTACT_PHONE_NUMBERS.map((phone) =>
        phone.value.replace(/^\+91/, "")
    ).join(" / ");
    const compactFooterLinks = [
        { label: "About Us", href: "/about" },
        { label: "Help Center", href: "/help" },
        { label: "Contact", href: "/contact" },
        { label: "Privacy", href: "/legal/privacy" },
        { label: "Terms", href: "/legal/terms" },
        { label: "Sitemap", href: "/sitemap" },
    ];

    return (
        <footer className="bg-cream-100 border-t border-clay/30 mt-20">
            {showCompactMobileFooter ? (
                <div className="md:hidden px-4 pb-6 pt-6">
                    <div className="mx-auto max-w-sm text-center">
                        <div className="grid grid-cols-3 gap-y-4 gap-x-2 items-center justify-items-center mb-6">
                            {compactFooterLinks.map((item) => (
                                <Link
                                    key={item.label}
                                    href={item.href}
                                    className="interactive-link text-[13px] font-inter text-dark-muted hover:text-terracotta whitespace-nowrap"
                                >
                                    {item.label}
                                </Link>
                            ))}
                        </div>
                        <p className="text-xs font-inter text-dark-muted">
                            &copy; {new Date().getFullYear()} Only Workshops Inc.
                        </p>
                    </div>
                </div>
            ) : null}

            <div className={showCompactMobileFooter ? "hidden md:block" : ""}>
                <RevealGroup className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16 grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-10">
                    <RevealItem className="col-span-2 sm:col-span-2 lg:col-span-1">
                        {/* Brand */}
                        <div>
                            <Link href="/" className="flex items-center gap-2.5 mb-4">
                                <div className="interactive-surface relative w-8 h-8 rounded-lg overflow-hidden">
                                    <Image
                                        src="/images/logo-black.jpeg"
                                        alt="Only Workshops"
                                        fill
                                        sizes="32px"
                                        className="object-cover"
                                    />
                                </div>
                                <span className="font-playfair text-lg font-bold text-dark">
                                    Only Workshops
                                </span>
                            </Link>
                            <p className="text-body-sm max-w-xs">
                                Discover creative workshops across the city and make your weekends
                                more meaningful.
                            </p>
                            <div className="mt-4 space-y-2">
                                <Link
                                    href={CONTACT_PAGE_HREF}
                                    className="interactive-link flex items-center gap-2 text-sm font-inter text-dark-muted hover:text-terracotta"
                                >
                                    <Phone className="w-4 h-4" />
                                    {footerPhoneText}
                                </Link>
                                <a
                                    href="https://www.instagram.com/only_workshops"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="interactive-link flex items-center gap-2 text-sm font-inter text-dark-muted hover:text-terracotta"
                                >
                                    <Instagram className="w-4 h-4" />
                                    @only_workshops
                                </a>
                            </div>
                        </div>
                    </RevealItem>

                    <RevealItem>
                        {/* Company */}
                        <div>
                            <h4 className="font-inter text-xs font-bold tracking-widest uppercase text-dark mb-5">
                                Company
                            </h4>
                            <ul className="space-y-3">
                                {[
                                    { label: "About Us", href: "/about" },
                                    { label: "Careers", href: "/careers" },
                                    { label: "Become a Host", href: "/become-a-host" },
                                    { label: "List your Space", href: "/list-your-space" },
                                    {
                                        label: "List Your Community",
                                        href: "/communities/new",
                                        target: "_blank",
                                    },
                                ].map((item) => (
                                    <li key={item.label}>
                                        <Link
                                            href={item.href}
                                            target={item.target}
                                            rel={
                                                item.target === "_blank"
                                                    ? "noopener noreferrer"
                                                    : undefined
                                            }
                                            className="interactive-link text-sm font-inter text-dark-muted hover:text-terracotta"
                                        >
                                            {item.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </RevealItem>

                    <RevealItem>
                        {/* Support */}
                        <div>
                            <h4 className="font-inter text-xs font-bold tracking-widest uppercase text-dark mb-5">
                                Support
                            </h4>
                            <ul className="space-y-3">
                                {[
                                    { label: "Help Center", href: "/help" },
                                    { label: "Cancellation Options", href: "/cancellations" },
                                    { label: "Safety", href: "/safety" },
                                    { label: "Contact Us", href: "/contact" },
                                ].map((item) => (
                                    <li key={item.label}>
                                        <Link
                                            href={item.href}
                                            className="interactive-link text-sm font-inter text-dark-muted hover:text-terracotta"
                                        >
                                            {item.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </RevealItem>
                </RevealGroup>

                {/* Bottom bar */}
                <div className="border-t border-clay/30">
                    <RevealGroup
                        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-5 flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-0"
                        stagger={0.05}
                    >
                        <RevealItem className="sm:w-1/3">
                            <p className="text-xs font-inter text-dark-muted text-center sm:text-left text-balance">
                                &copy; {new Date().getFullYear()} Only Workshops Inc. All rights
                                reserved.
                            </p>
                        </RevealItem>
                        <RevealItem className="sm:w-1/3">
                            <p className="text-xs font-inter font-medium text-dark-muted tracking-wide text-center">
                                Only Workshops <span className="text-terracotta px-1">|</span>{" "}
                                Experiential Learning
                            </p>
                        </RevealItem>
                        <RevealItem className="sm:w-1/3">
                            <div className="flex items-center justify-center sm:justify-end gap-6">
                                {[
                                    { label: "Privacy", href: "/legal/privacy" },
                                    { label: "Terms", href: "/legal/terms" },
                                    { label: "Sitemap", href: "/sitemap" },
                                ].map((item) => (
                                    <Link
                                        key={item.label}
                                        href={item.href}
                                        className="interactive-link text-xs font-inter text-dark-muted hover:text-terracotta"
                                    >
                                        {item.label}
                                    </Link>
                                ))}
                            </div>
                        </RevealItem>
                    </RevealGroup>
                </div>
            </div>
        </footer>
    );
}
