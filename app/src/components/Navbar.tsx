"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Menu, X, LogOut } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

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

export default function Navbar() {
    const router = useRouter();
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchContainerRef = useRef<HTMLDivElement | null>(null);
    const pathname = usePathname();
    const { user, role, roleLoading, loading, signOut } = useAuth();

    const NavLink = ({ href, children }: { href: string; children: React.ReactNode }) => {
        const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
        return (
            <Link
                href={href}
                className={`relative text-sm font-inter font-medium transition-colors duration-300 py-1 ${
                    isActive ? "text-terracotta" : "text-dark-secondary hover:text-terracotta"
                }`}
            >
                {children}
                {isActive && (
                    <motion.div
                        layoutId="navbar-indicator"
                        className="absolute -bottom-1 left-0 right-0 h-0.5 bg-terracotta rounded-full"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                )}
            </Link>
        );
    };

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
                className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
                    isScrolled
                        ? "bg-cream/95 backdrop-blur-xl shadow-soft py-3"
                        : "bg-transparent py-5"
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
                                <div className="absolute top-[100%] mt-2 left-0 w-full bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50 max-h-56 overflow-y-auto">
                                    <div className="px-4 py-1.5 text-xs font-semibold text-dark-muted uppercase tracking-wider mb-1">
                                        Suggestive Experiences
                                    </div>
                                    {filteredSuggestions.map((suggestion, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
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

                        <nav className="hidden md:flex items-center gap-6">
                            <NavLink href="/explore">Explore</NavLink>
                            <NavLink href="/past-events">Past Events</NavLink>
                            {user && !roleLoading && role === "admin" && (
                                <NavLink href="/admin/dashboard">Dashboard</NavLink>
                            )}
                            {user && !roleLoading && role === "host" && (
                                <NavLink href="/host/dashboard">Host Panel</NavLink>
                            )}
                            {!loading && !user && (
                                <>
                                    <NavLink href="/auth/login">Log In</NavLink>
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
                                <X
                                    className={`w-6 h-6 ${isScrolled ? "text-dark" : "text-white"}`}
                                />
                            ) : (
                                <Menu
                                    className={`w-6 h-6 ${isScrolled ? "text-dark" : "text-white"}`}
                                />
                            )}
                        </button>
                    </div>
                </div>
            </motion.header>

            <AnimatePresence>
                {isMobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="fixed inset-0 z-40 bg-cream pt-24 px-6 md:hidden"
                    >
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
                                { href: "mailto:hello@onlyworkshop.com", label: "Contact Us" },
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
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
