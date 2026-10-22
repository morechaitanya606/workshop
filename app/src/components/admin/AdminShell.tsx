"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
    LayoutDashboard,
    Calendar,
    BarChart3,
    MessageSquare,
    HelpCircle,
    Settings,
    Plus,
    Loader2,
    Users,
    Banknote,
    Images,
    ChevronDown,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/lib/auth-context";
import { fadeIn, quickTransition, useMotionProps } from "@/lib/motion-presets";

type AdminShellProps = {
    children: ReactNode;
};

const navItems = [
    { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/applications", label: "Applications", icon: Users },
    { href: "/admin/payouts", label: "Payouts", icon: Banknote },
    { href: "/admin/workshops", label: "Workshops", icon: Calendar },
    { href: "/admin/community-photos", label: "Photos", icon: Images },
    { href: "/admin/faqs", label: "FAQs", icon: HelpCircle },
    { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/admin/support", label: "Support", icon: MessageSquare },
    { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminShell({ children }: AdminShellProps) {
    const pathname = usePathname();
    const router = useRouter();
    const prefersReducedMotion = useReducedMotion();
    const { user, role, loading, roleLoading } = useAuth();
    const [menuOpen, setMenuOpen] = useState(false);
    const activeItem = navItems.find(
        (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
    );

    // A tap on a section navigates; close the menu once the page changes.
    useEffect(() => {
        setMenuOpen(false);
    }, [pathname]);
    const sectionMotionProps = useMotionProps(prefersReducedMotion, fadeIn, quickTransition, {
        whileInView: false,
    });

    useEffect(() => {
        if (!loading && !user) {
            const redirectPath = encodeURIComponent(pathname || "/admin/dashboard");
            router.replace(`/auth/login?redirect=${redirectPath}`);
        }
    }, [loading, user, pathname, router]);

    if (loading || roleLoading || !user) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-cream">
                <Loader2 className="w-8 h-8 animate-spin text-terracotta" />
            </main>
        );
    }

    if (role !== "admin") {
        return (
            <main className="min-h-screen flex items-center justify-center bg-cream px-6 text-center">
                <div>
                    <h1 className="heading-md mb-2">Admin access required</h1>
                    <p className="text-body text-dark-muted mb-6">
                        Your account is not allowed to access this area.
                    </p>
                    <button className="btn-primary" onClick={() => router.replace("/")}>
                        Go Home
                    </button>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-cream pb-20 md:pb-0">
            <Navbar />

            <div className="pt-20 lg:flex">
                {/* Phones and tablets: one slim bar. The section button opens a grid of every
                    admin section (nothing hidden off-screen); the page below keeps its own
                    heading, so the title is not shown twice. */}
                <div className="px-4 pt-4 sm:px-6 lg:hidden">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setMenuOpen((open) => !open)}
                            aria-expanded={menuOpen}
                            aria-controls="admin-section-menu"
                            className="inline-flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-clay/40 bg-white px-3.5 py-2.5 text-left shadow-sm"
                        >
                            {activeItem && (
                                <activeItem.icon
                                    className="h-4 w-4 shrink-0 text-terracotta"
                                    aria-hidden="true"
                                />
                            )}
                            <span className="min-w-0 flex-1">
                                <span className="block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted">
                                    Admin
                                </span>
                                <span className="block truncate text-sm font-inter font-semibold text-dark">
                                    {activeItem?.label ?? "Menu"}
                                </span>
                            </span>
                            <ChevronDown
                                className={`h-4 w-4 shrink-0 text-dark-muted transition-transform ${
                                    menuOpen ? "rotate-180" : ""
                                }`}
                                aria-hidden="true"
                            />
                        </button>
                        <Link
                            href="/admin/workshops/new"
                            aria-label="Create workshop"
                            className="inline-flex h-[52px] shrink-0 items-center gap-1.5 rounded-2xl bg-terracotta px-4 text-sm font-inter font-semibold text-white shadow-sm hover:bg-terracotta-600"
                        >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            New
                        </Link>
                    </div>

                    {menuOpen && (
                        <nav
                            id="admin-section-menu"
                            aria-label="Admin sections"
                            className="mt-2 grid grid-cols-3 gap-2 rounded-2xl border border-clay/30 bg-white p-2 shadow-soft"
                        >
                            {navItems.map((item) => {
                                const isActive = item === activeItem;
                                const Icon = item.icon;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        aria-current={isActive ? "page" : undefined}
                                        onClick={() => setMenuOpen(false)}
                                        className={`flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-center text-xs font-inter font-medium transition-colors ${
                                            isActive
                                                ? "bg-dark text-white"
                                                : "bg-cream-50 text-dark-secondary hover:bg-cream-100"
                                        }`}
                                    >
                                        <Icon
                                            className={`h-5 w-5 ${isActive ? "text-terracotta-300" : "text-terracotta"}`}
                                            aria-hidden="true"
                                        />
                                        {item.label}
                                    </Link>
                                );
                            })}
                        </nav>
                    )}
                </div>

                <aside className="hidden lg:block lg:w-80 lg:min-h-[calc(100vh-80px)] lg:sticky lg:top-20">
                    <div className="mx-4 my-4 rounded-3xl border border-gray-200 bg-[#f4f4f6] p-5 sm:p-6 lg:m-5">
                        <h2 className="font-playfair text-4xl sm:text-5xl lg:text-4xl font-bold text-dark mb-6">
                            Admin Panel
                        </h2>
                        <nav className="flex items-center gap-3 overflow-x-auto scrollbar-hide pb-1 lg:flex-col lg:items-stretch lg:gap-2 lg:overflow-visible lg:pb-0">
                            {navItems.map((item) => {
                                const isActive =
                                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                                const Icon = item.icon;

                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        aria-current={isActive ? "page" : undefined}
                                        className={`group inline-flex items-center gap-3.5 px-5 py-3 rounded-2xl text-base lg:text-[1.1rem] font-inter font-medium whitespace-nowrap border transition-all duration-300 ${
                                            isActive
                                                ? "bg-dark text-white border-dark shadow-[0_10px_24px_-12px_rgba(0,0,0,0.8)]"
                                                : "bg-[#f8f5ed] text-dark-muted border-transparent hover:bg-white hover:text-dark"
                                        }`}
                                    >
                                        <Icon
                                            className={`w-5 h-5 ${
                                                isActive
                                                    ? "text-terracotta-300"
                                                    : "text-dark/55 group-hover:text-terracotta"
                                            }`}
                                        />
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            })}
                        </nav>
                        <Link
                            href="/admin/workshops/new"
                            className="btn-primary mt-8 w-full !py-3.5 text-base"
                        >
                            <Plus className="w-5 h-5" />
                            Create Workshop
                        </Link>
                    </div>
                </aside>

                <motion.section
                    {...sectionMotionProps}
                    className="flex-1 w-full p-4 sm:p-6 lg:p-10"
                >
                    {children}
                </motion.section>
            </div>
        </main>
    );
}
