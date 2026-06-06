"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Menu, X, LogOut } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { CONTACT_PAGE_HREF } from "@/lib/contact";

const SUGGESTIONS = [
    "Pottery Workshop",
    "Coffee Brewing",
    "Resin Art",
    "Salsa Dancing",
    "Mixology",
    "Wine Tasting",
    "Jazz Event",
    "Baking Masterclass",
];

const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function MobileMenuPanel({ onClose, children }: { onClose: () => void; children: ReactNode }) {
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const panel = panelRef.current;
        if (!panel) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
                return;
            }

            if (e.key !== "Tab") return;

            const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };

        document.addEventListener("keydown", handleKeyDown);

        const firstFocusable = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        firstFocusable?.focus();

        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    return (
        <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed inset-0 z-40 bg-cream pt-24 px-6 md:hidden"
        >
            {children}
        </motion.div>
    );
}

function NavLink({
    href,
    pathname,
    isHomePage,
    isScrolled,
    children,
}: {
    href: string;
    pathname: string;
    isHomePage: boolean;
    isScrolled: boolean;
    children: ReactNode;
}) {
    const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
    const isHomeHeroNav = isHomePage && !isScrolled;

    return (
        <Link
            href={href}
            className={`relative inline-flex items-center rounded-full px-3 py-2 text-sm font-inter font-medium transition-all duration-300 ease-out ${
                isActive
                    ? "bg-white text-terracotta shadow-[0_12px_24px_-18px_rgba(0,0,0,0.45)]"
                    : isHomeHeroNav
                      ? "text-dark hover:-translate-y-0.5 hover:scale-[1.08] hover:bg-terracotta hover:text-white hover:shadow-[0_16px_32px_-18px_rgba(193,104,74,0.75)]"
                      : "text-dark-secondary hover:bg-terracotta/10 hover:text-terracotta hover:scale-[1.04]"
            }`}
        >
            {children}
            {isActive && (
                <motion.div
                    layoutId="navbar-indicator"
                    className="absolute bottom-1.5 left-3 right-3 h-0.5 rounded-full bg-terracotta"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
            )}
        </Link>
    );
}

export default function Navbar() {
    const router = useRouter();
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchContainerRef = useRef<HTMLDivElement | null>(null);
    const pathname = usePathname();
    const { user, role, roleLoading, loading, signOut } = useAuth();
    const isHomePage = pathname === "/";

    const filteredSuggestions = query
        ? SUGGESTIONS.filter((s) => s.toLowerCase().includes(query.toLowerCase()))
        : SUGGESTIONS;

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (!searchContainerRef.current) return;
            if (!searchContainerRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const userInitial =
        user?.user_metadata?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || "U";
    const userAvatar = user?.user_metadata?.avatar_url || "";

    return (
        <>
            <motion.header
                initial={{ y: -100 }}
                animate={{ y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className={`fixed top-0 left-0 right-0 z-[80] border-b border-black/5 transition-all duration-500 ${
                    isScrolled
                        ? "bg-cream/96 backdrop-blur-xl shadow-soft py-3"
                        : isHomePage
                          ? "bg-cream/88 backdrop-blur-lg shadow-[0_10px_30px_-22px_rgba(0,0,0,0.5)] py-4"
                          : "bg-cream/92 backdrop-blur-lg shadow-soft py-4"
                }`}
            >
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between">
                        <Link href="/" className="flex items-center gap-2.5 group">
                            <div className="relative w-9 h-9 rounded-lg overflow-hidden transition-transform duration-300 group-hover:scale-110">
                                <Image
                                    src="/images/logo-black.jpeg"
                                    alt="Only Workshops"
                                    fill
                                    sizes="36px"
                                    className="object-cover"
                                />
                            </div>
                            <span className="font-playfair text-xl text-dark hidden sm:block">
                                Only Workshops
                            </span>
                        </Link>

                        <div
                            ref={searchContainerRef}
                            className={`hidden md:flex items-center gap-2 rounded-full px-5 py-2.5 shadow-soft border border-gray-100 max-w-md flex-1 mx-8 transition-all duration-300 relative ${
                                isScrolled ? "bg-white" : "bg-white/95"
                            }`}
                        >
                            <Search className="w-4 h-4 text-dark-muted" />
                            <input
                                type="text"
                                placeholder="Search experiences..."
                                aria-label="Search workshops"
                                role="combobox"
                                aria-expanded={showSuggestions && filteredSuggestions.length > 0}
                                aria-controls="search-suggestions"
                                aria-autocomplete="list"
                                value={query}
                                onFocus={() => setShowSuggestions(true)}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && query.trim()) {
                                        router.push(
                                            `/explore?q=${encodeURIComponent(query.trim())}`
                                        );
                                    }
                                }}
                                className="flex-1 w-full bg-transparent outline-none text-sm font-inter text-dark placeholder:text-dark-muted"
                            />
                            {showSuggestions && filteredSuggestions.length > 0 && (
                                <div
                                    id="search-suggestions"
                                    role="listbox"
                                    className="absolute top-[100%] mt-2 left-0 w-full bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50 max-h-56 overflow-y-auto"
                                >
                                    <div className="px-4 py-1.5 text-xs font-semibold text-dark-muted uppercase tracking-wider mb-1">
                                        Suggestive Experiences
                                    </div>
                                    {filteredSuggestions.map((suggestion, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            role="option"
                                            aria-selected={false}
                                            className="w-full text-left px-4 py-2.5 text-sm font-medium text-dark hover:bg-cream-50 hover:text-terracotta transition-colors flex items-center gap-3"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => {
                                                setQuery(suggestion);
                                                setShowSuggestions(false);
                                                router.push(
                                                    `/explore?q=${encodeURIComponent(suggestion)}`
                                                );
                                            }}
                                        >
                                            <Search className="w-3.5 h-3.5 text-terracotta/50" />
                                            {suggestion}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <nav className="hidden md:flex items-center gap-4">
                            <NavLink
                                href="/explore"
                                pathname={pathname}
                                isHomePage={isHomePage}
                                isScrolled={isScrolled}
                            >
                                Explore
                            </NavLink>
                            <NavLink
                                href="/past-events"
                                pathname={pathname}
                                isHomePage={isHomePage}
                                isScrolled={isScrolled}
                            >
                                Past Events
                            </NavLink>
                            {user && !roleLoading && role === "admin" && (
                                <NavLink
                                    href="/admin/dashboard"
                                    pathname={pathname}
                                    isHomePage={isHomePage}
                                    isScrolled={isScrolled}
                                >
                                    Dashboard
                                </NavLink>
                            )}
                            {user && !roleLoading && role === "host" && (
                                <NavLink
                                    href="/host/dashboard"
                                    pathname={pathname}
                                    isHomePage={isHomePage}
                                    isScrolled={isScrolled}
                                >
                                    Host Panel
                                </NavLink>
                            )}
                            {!loading && !user && (
                                <>
                                    <NavLink
                                        href="/auth/login"
                                        pathname={pathname}
                                        isHomePage={isHomePage}
                                        isScrolled={isScrolled}
                                    >
                                        Log In
                                    </NavLink>
                                    <Link
                                        href="/auth/signup"
                                        className="btn-primary !py-2.5 !px-6 text-sm"
                                    >
                                        Sign Up
                                    </Link>
                                </>
                            )}
                            {user && (
                                <div className="flex items-center gap-3">
                                    <Link
                                        href="/profile"
                                        aria-label="Open profile"
                                        className={`w-9 h-9 rounded-full overflow-hidden flex items-center justify-center font-inter font-bold text-sm hover:opacity-90 transition-opacity ${
                                            userAvatar
                                                ? "bg-cream border border-clay/40"
                                                : "bg-terracotta text-white"
                                        }`}
                                    >
                                        {userAvatar ? (
                                            <Image
                                                src={userAvatar}
                                                alt="Profile avatar"
                                                width={36}
                                                height={36}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            userInitial
                                        )}
                                    </Link>
                                    <button
                                        onClick={signOut}
                                        aria-label="Sign out"
                                        className="text-sm font-inter font-medium text-dark-muted hover:text-terracotta transition-colors duration-300 flex items-center gap-1"
                                    >
                                        <LogOut className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </nav>

                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
                            className="md:hidden p-2 rounded-xl hover:bg-clay/30 transition-colors"
                        >
                            {isMobileMenuOpen ? (
                                <X className="w-6 h-6 text-dark" />
                            ) : (
                                <Menu className="w-6 h-6 text-dark" />
                            )}
                        </button>
                    </div>
                </div>
            </motion.header>

            <AnimatePresence>
                {isMobileMenuOpen && (
                    <MobileMenuPanel onClose={() => setIsMobileMenuOpen(false)}>
                        {user && (
                            <Link
                                href="/profile"
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="mb-6 flex items-center gap-3 rounded-2xl border border-clay/30 bg-white/80 px-4 py-3"
                            >
                                <div
                                    className={`h-12 w-12 rounded-full overflow-hidden flex items-center justify-center font-inter font-bold text-sm ${
                                        userAvatar
                                            ? "bg-cream border border-clay/40"
                                            : "bg-terracotta text-white"
                                    }`}
                                >
                                    {userAvatar ? (
                                        <Image
                                            src={userAvatar}
                                            alt="Profile avatar"
                                            width={48}
                                            height={48}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        userInitial
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-base font-playfair font-semibold text-dark truncate">
                                        {user.user_metadata?.full_name || "My Profile"}
                                    </p>
                                </div>
                            </Link>
                        )}
                        <nav className="flex flex-col gap-1">
                            {[
                                { href: "/", label: "Home" },
                                { href: "/explore", label: "Explore Workshops" },
                                { href: "/past-events", label: "Past Events" },
                                ...(user ? [{ href: "/profile", label: "Profile" }] : []),
                                ...(user && !roleLoading && role === "admin"
                                    ? [{ href: "/admin/dashboard", label: "Dashboard" }]
                                    : []),
                                ...(user && !roleLoading && role === "host"
                                    ? [{ href: "/host/dashboard", label: "Host Panel" }]
                                    : []),
                                { href: CONTACT_PAGE_HREF, label: "Contact Us" },
                            ].map((link, i) => (
                                <motion.div
                                    key={link.href}
                                    initial={{ opacity: 0, x: -30 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.1, duration: 0.4 }}
                                >
                                    <Link
                                        href={link.href}
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className="block py-4 text-2xl font-playfair font-semibold text-dark hover:text-terracotta transition-colors border-b border-clay/30"
                                    >
                                        {link.label}
                                    </Link>
                                </motion.div>
                            ))}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5, duration: 0.4 }}
                                className="flex gap-3 mt-8"
                            >
                                {user ? (
                                    <button
                                        onClick={() => {
                                            signOut();
                                            setIsMobileMenuOpen(false);
                                        }}
                                        className="btn-secondary flex-1 text-center"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        Sign Out
                                    </button>
                                ) : (
                                    <>
                                        <Link
                                            href="/auth/login"
                                            onClick={() => setIsMobileMenuOpen(false)}
                                            className="btn-secondary flex-1 text-center"
                                        >
                                            Log In
                                        </Link>
                                        <Link
                                            href="/auth/signup"
                                            onClick={() => setIsMobileMenuOpen(false)}
                                            className="btn-primary flex-1 text-center"
                                        >
                                            Sign Up
                                        </Link>
                                    </>
                                )}
                            </motion.div>
                        </nav>
                    </MobileMenuPanel>
                )}
            </AnimatePresence>
        </>
    );
}
