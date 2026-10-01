"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Menu, X, LogOut } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { CONTACT_PAGE_HREF } from "@/lib/contact";
import { useModalA11y } from "@/lib/use-modal-a11y";
import { nextNavScrollState, type NavScrollState } from "@/lib/nav-scroll";

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

function MobileMenuPanel({ onClose, children }: { onClose: () => void; children: ReactNode }) {
    const panelRef = useRef<HTMLDivElement>(null);

    // Focus moves in once on mount (not on every re-render), Tab is trapped, Escape closes, the page
    // behind stops scrolling while the menu is open, and focus returns to the menu button on close.
    useModalA11y({ open: true, containerRef: panelRef, onClose });

    return (
        <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            tabIndex={-1}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed inset-0 z-40 overflow-y-auto bg-cream pt-24 px-6 outline-none md:hidden"
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
            className={`relative inline-flex min-h-0 items-center rounded-full px-3 py-1.5 text-sm font-inter font-medium transition-all duration-300 ease-out ${
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
    const [isHidden, setIsHidden] = useState(false);
    const navScrollRef = useRef<NavScrollState>({ hidden: false, lastY: 0 });
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

    // Hide while scrolling down, show on scroll up (see nav-scroll.ts). Browsers already fire
    // scroll at most once per frame, so the position is read directly rather than deferred to
    // requestAnimationFrame, which drops updates whenever frames stall.
    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20);
            navScrollRef.current = nextNavScrollState(navScrollRef.current, window.scrollY);
            setIsHidden(navScrollRef.current.hidden);
        };

        handleScroll();
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // A new page starts with the bar visible.
    useEffect(() => {
        navScrollRef.current = { ...navScrollRef.current, hidden: false };
        setIsHidden(false);
    }, [pathname]);

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

    const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), []);
    // Never hide what the visitor is using: the open menu or the search suggestions.
    const isHeaderHidden = isHidden && !isMobileMenuOpen && !showSuggestions;

    const userInitial =
        user?.user_metadata?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || "U";
    const userAvatar = user?.user_metadata?.avatar_url || "";

    return (
        <>
            <motion.header
                // Same unit both ways: animating between "%" and px makes framer-motion convert
                // units and apply the reveal late.
                initial={{ y: "-100%" }}
                animate={{ y: isHeaderHidden ? "-100%" : "0%" }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                // A keyboard user tabbing into a hidden bar gets it back.
                onFocusCapture={() => {
                    navScrollRef.current = { ...navScrollRef.current, hidden: false };
                    setIsHidden(false);
                }}
                // No transition on transform: framer-motion drives it, and a CSS transition on
                // top would lag every frame.
                className={`fixed top-0 left-0 right-0 z-[80] border-b border-black/5 transition-[background-color,box-shadow,padding] duration-300 ${
                    isScrolled
                        ? "bg-cream/96 backdrop-blur-xl shadow-soft py-1.5"
                        : isHomePage
                          ? "bg-cream/88 backdrop-blur-lg shadow-[0_10px_30px_-22px_rgba(0,0,0,0.5)] py-2"
                          : "bg-cream/92 backdrop-blur-lg shadow-soft py-2"
                }`}
            >
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between">
                        <Link href="/" className="flex items-center gap-2.5 group">
                            <div className="relative w-8 h-8 rounded-lg overflow-hidden transition-transform duration-300 group-hover:scale-110">
                                <Image
                                    src="/images/logo-black.webp"
                                    alt="Only Workshops"
                                    fill
                                    sizes="32px"
                                    className="object-cover"
                                />
                            </div>
                            <span className="font-playfair text-lg text-dark hidden sm:block">
                                Only Workshops
                            </span>
                        </Link>

                        <div
                            ref={searchContainerRef}
                            className={`hidden md:flex items-center gap-2 rounded-full px-4 py-1.5 shadow-soft border border-gray-100 max-w-md flex-1 mx-6 transition-all duration-300 relative ${
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
                                className="flex-1 w-full min-h-0 bg-transparent outline-none text-sm font-inter text-dark placeholder:text-dark-muted"
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
                                        className="btn-primary min-h-0 !py-2 !px-5 text-sm"
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
                                        className={`w-8 h-8 min-h-0 rounded-full overflow-hidden flex items-center justify-center font-inter font-bold text-sm hover:opacity-90 transition-opacity ${
                                            userAvatar
                                                ? "bg-cream border border-clay/40"
                                                : "bg-terracotta text-white"
                                        }`}
                                    >
                                        {userAvatar ? (
                                            <Image
                                                src={userAvatar}
                                                alt="Profile avatar"
                                                width={32}
                                                height={32}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            userInitial
                                        )}
                                    </Link>
                                    <button
                                        onClick={signOut}
                                        aria-label="Sign out"
                                        className="min-h-0 text-sm font-inter font-medium text-dark-muted hover:text-terracotta transition-colors duration-300 flex items-center gap-1"
                                    >
                                        <LogOut className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </nav>

                        <button
                            type="button"
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
                            aria-expanded={isMobileMenuOpen}
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
                    <MobileMenuPanel onClose={closeMobileMenu}>
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
