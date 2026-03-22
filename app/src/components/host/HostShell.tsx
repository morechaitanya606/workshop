"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
    LayoutDashboard,
    Calendar,
    Wallet,
    Settings,
    Plus,
    Loader2,
    Headphones,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import MobileNav from "@/components/MobileNav";
import { useAuth } from "@/lib/auth-context";
import { fadeIn, quickTransition, useMotionProps } from "@/lib/motion-presets";

type HostShellProps = {
    children: ReactNode;
};

const navItems = [
    { href: "/host/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/host/workshops", label: "My Workshops", icon: Calendar },
    { href: "/host/earnings", label: "Earnings", icon: Wallet },
    { href: "/host/support", label: "Support", icon: Headphones },
    { href: "/host/settings", label: "Settings", icon: Settings },
];

export default function HostShell({ children }: HostShellProps) {
    const pathname = usePathname();
    const router = useRouter();
    const prefersReducedMotion = useReducedMotion();
    const { user, role, loading, roleLoading } = useAuth();
    const sectionMotionProps = useMotionProps(prefersReducedMotion, fadeIn, quickTransition, {
        whileInView: false,
    });

    useEffect(() => {
        if (!loading && !user) {
            const redirectPath = encodeURIComponent(pathname || "/host/dashboard");
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

    if (role !== "host" && role !== "admin") {
        return (
            <main className="min-h-screen flex items-center justify-center bg-cream px-6 text-center">
                <div>
                    <h1 className="heading-md mb-2">Host access required</h1>
                    <p className="text-body text-dark-muted mb-6">
                        Your account does not have host privileges. Apply to become a host to access
                        this area.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link href="/become-a-host" className="btn-primary">
                            Become a Host
                        </Link>
                        <button className="btn-secondary" onClick={() => router.replace("/")}>
                            Go Home
                        </button>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-cream pb-20 md:pb-0">
            <Navbar />

            <div className="pt-20 lg:flex">
                <aside className="w-full lg:w-80 lg:min-h-[calc(100vh-80px)] lg:sticky lg:top-20">
                    <div className="mx-4 my-4 rounded-3xl border border-gray-200 bg-[#f4f4f6] p-5 sm:p-6 lg:m-5">
                        <h2 className="font-playfair text-4xl sm:text-5xl lg:text-4xl font-bold text-dark mb-6">
                            Host Panel
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
                            href="/host/workshops/new"
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

            <MobileNav />
        </main>
    );
}
