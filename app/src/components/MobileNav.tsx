"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, CalendarDays, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function MobileNav() {
    const pathname = usePathname();
    const { user, role, roleLoading } = useAuth();
    const navItems = [
        { href: "/", label: "Home", icon: Home },
        { href: "/explore", label: "Discover", icon: Search },
        ...(user && !roleLoading && role === "admin"
            ? [{ href: "/admin/dashboard", label: "Dashboard", icon: CalendarDays }]
            : []),
        { href: user ? "/profile" : "/auth/login", label: "Profile", icon: User },
    ];

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-gray-100 md:hidden safe-area-bottom">
            <div
                className="grid gap-1 px-2 py-2"
                style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
            >
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex flex-col items-center gap-1 py-1.5 rounded-xl transition-colors duration-200 ${isActive ? "text-terracotta" : "text-dark-muted"
                                }`}
                        >
                            <Icon
                                className={`w-5 h-5 ${isActive ? "stroke-[2.5px]" : "stroke-[1.5px]"}`}
                            />
                            <span className="text-[10px] font-inter font-medium">
                                {item.label}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
