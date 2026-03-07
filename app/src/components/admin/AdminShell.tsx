"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
    LayoutDashboard,
    Calendar,
    BarChart3,
    MessageSquare,
    Settings,
    Plus,
    Loader2,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MobileNav from "@/components/MobileNav";
import { useAuth } from "@/lib/auth-context";

type AdminShellProps = {
    children: ReactNode;
};

const navItems = [
    { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/workshops", label: "Workshops", icon: Calendar },
    { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/admin/feedback", label: "Feedback", icon: MessageSquare },
    { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminShell({ children }: AdminShellProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, role, loading, roleLoading } = useAuth();

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
                <aside className="w-full lg:w-72 lg:min-h-[calc(100vh-80px)] lg:sticky lg:top-20 lg:border-r lg:border-gray-100 lg:bg-white">
                    <div className="mx-4 my-4 lg:m-0 rounded-2xl bg-[#f4f4f6] lg:rounded-none lg:bg-transparent p-6 lg:p-6">
                        <h2 className="font-playfair text-4xl lg:text-xl font-bold text-dark mb-6">
                            Admin Panel
                        </h2>
                        <nav className="space-y-2">
                            {navItems.map((item) => {
                                const isActive =
                                    pathname === item.href ||
                                    pathname.startsWith(`${item.href}/`);
                                const Icon = item.icon;

                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`w-full flex items-center gap-3.5 px-4 py-4 rounded-3xl text-2xl lg:text-base font-inter font-medium transition-colors ${
                                            isActive
                                                ? "bg-terracotta/10 text-terracotta"
                                                : "text-dark-muted hover:bg-white/80 lg:hover:bg-cream-100"
                                        }`}
                                    >
                                        <Icon className="w-7 h-7 lg:w-5 lg:h-5" />
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            })}
                        </nav>
                        <Link
                            href="/admin/workshops/new"
                            className="mt-8 w-full inline-flex items-center justify-center gap-2 rounded-full bg-terracotta px-6 py-4 text-xl lg:text-base font-inter font-semibold text-white transition-colors hover:bg-terracotta-600"
                        >
                            <Plus className="w-5 h-5" />
                            Create Workshop
                        </Link>
                    </div>
                </aside>

                <section className="flex-1 w-full p-4 sm:p-6 lg:p-10">
                    {children}
                </section>
            </div>

            <Footer />
            <MobileNav />
        </main>
    );
}
