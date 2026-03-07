import Link from "next/link";
import Image from "next/image";

export default function Footer() {
    return (
        <footer className="bg-cream-100 border-t border-clay/30 mt-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
                    {/* Brand */}
                    <div className="sm:col-span-2 lg:col-span-1">
                        <Link href="/" className="flex items-center gap-2.5 mb-4">
                            <div className="relative w-8 h-8 rounded-lg overflow-hidden">
                                <Image
                                    src="/images/logo-black.jpeg"
                                    alt="Only Workshop"
                                    fill
                                    className="object-cover"
                                />
                            </div>
                            <span className="font-playfair text-lg font-bold text-dark">
                                Only Workshop
                            </span>
                        </Link>
                        <p className="text-body-sm max-w-xs">
                            Curating the best weekend experiences so you can stop scrolling and
                            start doing.
                        </p>
                    </div>

                    {/* Company */}
                    <div>
                        <h4 className="font-inter text-xs font-bold tracking-widest uppercase text-dark mb-5">
                            Company
                        </h4>
                        <ul className="space-y-3">
                            {[
                                { label: "About Us", href: "/about" },
                                { label: "Careers", href: "/careers" },
                                { label: "Press", href: "/press" },
                                { label: "Blog", href: "/blog" },
                            ].map((item) => (
                                <li key={item.label}>
                                    <Link
                                        href={item.href}
                                        className="text-sm font-inter text-dark-muted hover:text-terracotta transition-colors duration-300"
                                    >
                                        {item.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

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
                                        className="text-sm font-inter text-dark-muted hover:text-terracotta transition-colors duration-300"
                                    >
                                        {item.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {/* Bottom bar */}
            <div className="border-t border-clay/30">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-0">
                    <p className="text-xs font-inter text-dark-muted sm:w-1/3 text-center sm:text-left text-balance">
                        &copy; {new Date().getFullYear()} Only Workshop Inc. All rights reserved.
                    </p>
                    <p className="text-xs font-inter font-medium text-dark-muted tracking-wide sm:w-1/3 text-center">
                        Only Workshop <span className="text-terracotta px-1">|</span> Experiential Learning
                    </p>
                    <div className="flex items-center justify-center sm:justify-end gap-6 sm:w-1/3">
                        {[
                            { label: "Privacy", href: "/legal/privacy" },
                            { label: "Terms", href: "/legal/terms" },
                            { label: "Sitemap", href: "/sitemap" },
                        ].map((item) => (
                            <Link
                                key={item.label}
                                href={item.href}
                                className="text-xs font-inter text-dark-muted hover:text-terracotta transition-colors"
                            >
                                {item.label}
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </footer>
    );
}
