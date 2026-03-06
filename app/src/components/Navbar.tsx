"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Menu, X, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function Navbar() {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const { user, loading, signOut } = useAuth();

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const userInitial = user?.user_metadata?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || "U";

    return (
        <>
            <motion.header
                initial={{ y: -100 }}
                animate={{ y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${isScrolled
                    ? "bg-cream/95 backdrop-blur-xl shadow-soft py-3"
                    : "bg-transparent py-5"
                    }`}
            >
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between">
                        {/* Logo */}
                        <Link href="/" className="flex items-center gap-2.5 group">
                            <div className="relative w-9 h-9 rounded-lg overflow-hidden transition-transform duration-300 group-hover:scale-110">
                                <Image
                                    src="/images/logo-black.jpeg"
                                    alt="OnlyWorkshop"
                                    fill
                                    className="object-cover"
                                />
                            </div>
                            <span className="font-playfair text-xl font-bold text-dark hidden sm:block">
                                OnlyWorkshop
                            </span>
                        </Link>

                        {/* Desktop Search */}
                        <div
                            className={`hidden md:flex items-center gap-2 bg-white rounded-full px-5 py-2.5 shadow-soft border border-gray-100 max-w-md flex-1 mx-8 transition-all duration-300 ${isScrolled ? "opacity-100" : "opacity-0 pointer-events-none"
                                }`}
                        >
                            <Search className="w-4 h-4 text-dark-muted" />
                            <input
                                type="text"
                                placeholder="Search experiences..."
                                className="flex-1 bg-transparent outline-none text-sm font-inter text-dark placeholder:text-dark-muted"
                            />
                        </div>

                        {/* Desktop Nav */}
                        <nav className="hidden md:flex items-center gap-6">
                            <Link
                                href="/explore"
                                className="text-sm font-inter font-medium text-dark-secondary hover:text-terracotta transition-colors duration-300"
                            >
                                Explore
                            </Link>
                            {user && (
                                <Link
                                    href="/dashboard"
                                    className="text-sm font-inter font-medium text-dark-secondary hover:text-terracotta transition-colors duration-300"
                                >
                                    Dashboard
                                </Link>
                            )}
                            {!loading && !user && (
                                <>
                                    <Link
                                        href="/auth/login"
                                        className="text-sm font-inter font-medium text-dark-secondary hover:text-terracotta transition-colors duration-300"
                                    >
                                        Log In
                                    </Link>
                                    <Link href="/auth/signup" className="btn-primary !py-2.5 !px-6 text-sm">
                                        Sign Up
                                    </Link>
                                </>
                            )}
                            {user && (
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-terracotta rounded-full flex items-center justify-center text-white font-inter font-bold text-sm">
                                        {userInitial}
                                    </div>
                                    <button
                                        onClick={signOut}
                                        className="text-sm font-inter font-medium text-dark-muted hover:text-terracotta transition-colors duration-300 flex items-center gap-1"
                                    >
                                        <LogOut className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </nav>

                        {/* Mobile Menu Button */}
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
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

            {/* Mobile Menu */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="fixed inset-0 z-40 bg-cream pt-24 px-6 md:hidden"
                    >
                        <nav className="flex flex-col gap-1">
                            {[
                                { href: "/", label: "Home" },
                                { href: "/explore", label: "Explore Workshops" },
                                ...(user ? [{ href: "/dashboard", label: "My Bookings" }] : []),
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
                                        onClick={() => { signOut(); setIsMobileMenuOpen(false); }}
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
