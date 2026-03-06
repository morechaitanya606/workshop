"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, CalendarDays, User } from "lucide-react";

const navItems = [
    { href: "/", label: "Home", icon: Home },
    { href: "/explore", label: "Discover", icon: Search },
    { href: "/dashboard", label: "Bookings", icon: CalendarDays },
    { href: "/auth/login", label: "Profile", icon: User },
];

export default function MobileNav() {
    const pathname = usePathname();

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-gray-100 md:hidden safe-area-bottom">
            <div className="grid grid-cols-4 gap-1 px-2 py-2">
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
