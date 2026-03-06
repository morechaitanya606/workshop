"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    CalendarDays,
    Clock,
    MapPin,
    Calendar,
    Heart,
    Settings,
    LogOut,
    ChevronRight,
    Star,
    ExternalLink,
    Ticket,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import MobileNav from "@/components/MobileNav";
import { mockWorkshops } from "@/lib/data";
import { formatDate, formatCurrency } from "@/lib/utils";

const sidebarItems = [
    { id: "upcoming", label: "Upcoming Sessions", icon: CalendarDays },
    { id: "past", label: "Past Workshops", icon: Clock },
    { id: "saved", label: "Saved Inspiration", icon: Heart },
    { id: "settings", label: "Account Settings", icon: Settings },
];

export default function DashboardPage() {
    const [activeTab, setActiveTab] = useState("upcoming");
    const [filterType, setFilterType] = useState("all");

    const upcomingWorkshops = mockWorkshops.slice(0, 2);
    const pastWorkshops = mockWorkshops.slice(2, 5);
    const savedWorkshops = mockWorkshops.slice(5);

    return (
        <main className="min-h-screen pb-20 md:pb-0 bg-cream">
            <Navbar />

            <div className="pt-20 sm:pt-24">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 lg:grid-cols-[240px,1fr] gap-8">
                        {/* ═══ SIDEBAR ═══ */}
                        <motion.aside
                            initial={{ opacity: 0, x: -30 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.5 }}
                            className="hidden lg:block"
                        >
                            <div className="sticky top-28">
                                {/* User */}
                                <div className="text-center mb-8">
                                    <div className="relative w-20 h-20 mx-auto mb-3 rounded-full overflow-hidden ring-3 ring-terracotta/20">
                                        <Image
                                            src="/images/workshops/IMG-20260306-WA0006.jpg"
                                            alt="Alex Rivera"
                                            fill
                                            className="object-cover"
                                        />
                                    </div>
                                    <h3 className="font-playfair text-lg font-bold text-dark">
                                        Alex Rivera
                                    </h3>
                                    <p className="text-xs font-inter text-dark-muted mt-0.5">
                                        Member since 2023
                                    </p>
                                </div>

                                {/* Navigation */}
                                <nav className="space-y-1">
                                    {sidebarItems.map((item) => {
                                        const Icon = item.icon;
                                        const isActive = activeTab === item.id;
                                        return (
                                            <button
                                                key={item.id}
                                                onClick={() => setActiveTab(item.id)}
                                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-inter font-medium transition-all duration-300 ${isActive
                                                        ? "bg-terracotta/10 text-terracotta"
                                                        : "text-dark-muted hover:bg-clay/20 hover:text-dark"
                                                    }`}
                                            >
                                                <Icon className="w-5 h-5" />
                                                {item.label}
                                            </button>
                                        );
                                    })}
                                </nav>

                                <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-inter font-medium text-dark-muted hover:text-terracotta hover:bg-terracotta/5 transition-all duration-300 mt-8 border border-gray-200">
                                    <LogOut className="w-5 h-5" />
                                    LOG OUT
                                </button>
                            </div>
                        </motion.aside>

                        {/* ═══ MAIN CONTENT ═══ */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                        >
                            <div className="mb-8">
                                <p className="text-xs font-inter font-bold text-terracotta uppercase tracking-wider mb-1">
                                    My Studio
                                </p>
                                <h1 className="heading-lg">
                                    {activeTab === "upcoming" && "Your Upcoming Sessions"}
                                    {activeTab === "past" && "Past Workshops"}
                                    {activeTab === "saved" && "Saved Inspiration"}
                                    {activeTab === "settings" && "Account Settings"}
                                </h1>
                            </div>

                            {/* Mobile tabs */}
                            <div className="flex gap-2 mb-8 overflow-x-auto scrollbar-hide lg:hidden">
                                {sidebarItems.map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => setActiveTab(item.id)}
                                        className={`px-4 py-2 rounded-full text-sm font-inter font-medium whitespace-nowrap transition-all ${activeTab === item.id
                                                ? "bg-terracotta text-white"
                                                : "bg-white text-dark-secondary border border-gray-200"
                                            }`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>

                            {/* Filter Pills */}
                            {activeTab === "upcoming" && (
                                <div className="flex items-center gap-2 mb-8">
                                    {["all", "workshops", "online"].map((type) => (
                                        <button
                                            key={type}
                                            onClick={() => setFilterType(type)}
                                            className={`px-5 py-2 rounded-full text-sm font-inter font-medium capitalize transition-all duration-300 ${filterType === type
                                                    ? "bg-dark text-white"
                                                    : "bg-white text-dark-secondary border border-gray-200 hover:border-dark"
                                                }`}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* ─── Upcoming Sessions ─── */}
                            {activeTab === "upcoming" && (
                                <div className="space-y-6">
                                    {upcomingWorkshops.map((w, i) => (
                                        <motion.div
                                            key={w.id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.1 }}
                                            className="bg-white rounded-2xl shadow-soft overflow-hidden"
                                        >
                                            <div className="flex flex-col sm:flex-row">
                                                {/* Date column */}
                                                <div className="hidden sm:flex flex-col items-center justify-center px-6 py-4 border-r border-gray-100">
                                                    <span className="font-playfair text-3xl font-bold text-terracotta">
                                                        {new Date(w.date).getDate()}
                                                    </span>
                                                    <span className="text-xs font-inter font-bold uppercase text-terracotta">
                                                        {new Date(w.date).toLocaleString("default", {
                                                            month: "short",
                                                        })}
                                                    </span>
                                                </div>

                                                {/* Image */}
                                                <div className="relative w-full sm:w-56 h-48 sm:h-auto flex-shrink-0">
                                                    <Image
                                                        src={w.coverImage}
                                                        alt={w.title}
                                                        fill
                                                        className="object-cover"
                                                    />
                                                    <div className="sm:hidden absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg">
                                                        <span className="text-xs font-inter font-bold text-terracotta">
                                                            IN 3 DAYS
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 p-5 sm:p-6">
                                                    <span className="hidden sm:inline-block text-[10px] font-inter font-bold bg-terracotta/10 text-terracotta px-2.5 py-1 rounded-full uppercase tracking-wider mb-3">
                                                        In 3 Days
                                                    </span>
                                                    <h3 className="font-playfair text-xl font-bold text-dark mb-1">
                                                        {w.title}
                                                    </h3>
                                                    <p className="text-sm font-inter text-dark-muted mb-4">
                                                        with {w.hostName}
                                                    </p>

                                                    <div className="flex flex-wrap gap-3 mb-5">
                                                        <span className="inline-flex items-center gap-1.5 text-xs font-inter text-dark-secondary bg-cream-200/50 px-3 py-1.5 rounded-lg">
                                                            <Clock className="w-3.5 h-3.5 text-terracotta" />
                                                            {w.time} - {w.duration}
                                                        </span>
                                                        <span className="inline-flex items-center gap-1.5 text-xs font-inter text-dark-secondary bg-cream-200/50 px-3 py-1.5 rounded-lg">
                                                            <MapPin className="w-3.5 h-3.5 text-terracotta" />
                                                            {w.location}, {w.city}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center justify-between">
                                                        <button className="inline-flex items-center gap-1.5 text-sm font-inter text-dark-muted hover:text-terracotta transition-colors">
                                                            <Calendar className="w-4 h-4" />
                                                            Add to Calendar
                                                        </button>
                                                        <button className="btn-primary !py-2.5 !px-6 text-sm">
                                                            <Ticket className="w-4 h-4" />
                                                            View Ticket
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}

                            {/* ─── Past Workshops ─── */}
                            {activeTab === "past" && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    {pastWorkshops.map((w, i) => (
                                        <motion.div
                                            key={w.id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.1 }}
                                            className="bg-white rounded-2xl overflow-hidden shadow-soft"
                                        >
                                            <div className="relative aspect-[4/3]">
                                                <Image
                                                    src={w.coverImage}
                                                    alt={w.title}
                                                    fill
                                                    className="object-cover"
                                                    loading="lazy"
                                                />
                                            </div>
                                            <div className="p-4">
                                                <h4 className="font-playfair font-semibold text-dark text-sm leading-snug mb-2 line-clamp-2">
                                                    {w.title}
                                                </h4>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-inter text-dark-muted">
                                                        {formatDate(w.date)}
                                                    </span>
                                                    <button className="text-xs font-inter font-semibold text-terracotta bg-terracotta/10 px-3 py-1 rounded-full hover:bg-terracotta/20 transition-colors">
                                                        Review
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}

                            {/* ─── Saved Workshops ─── */}
                            {activeTab === "saved" && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    {savedWorkshops.map((w, i) => (
                                        <motion.div
                                            key={w.id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.1 }}
                                            className="bg-white rounded-2xl overflow-hidden shadow-soft group"
                                        >
                                            <div className="relative aspect-[4/3]">
                                                <Image
                                                    src={w.coverImage}
                                                    alt={w.title}
                                                    fill
                                                    className="object-cover"
                                                    loading="lazy"
                                                />
                                                <button className="absolute top-3 right-3 p-2 bg-white/90 rounded-full">
                                                    <Heart className="w-4 h-4 text-terracotta fill-terracotta" />
                                                </button>
                                            </div>
                                            <div className="p-4">
                                                <h4 className="font-playfair font-semibold text-dark text-sm leading-snug mb-1 line-clamp-2">
                                                    {w.title}
                                                </h4>
                                                <p className="text-sm font-inter font-bold text-terracotta">
                                                    {formatCurrency(w.price)}
                                                </p>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}

                            {/* ─── Settings ─── */}
                            {activeTab === "settings" && (
                                <div className="bg-white rounded-2xl shadow-soft p-6 max-w-2xl">
                                    <div className="space-y-6">
                                        <div>
                                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                                Full Name
                                            </label>
                                            <input
                                                type="text"
                                                defaultValue="Alex Rivera"
                                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                                Email
                                            </label>
                                            <input
                                                type="email"
                                                defaultValue="alex@example.com"
                                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                                City
                                            </label>
                                            <select className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors">
                                                <option>Pune</option>
                                                <option>Mumbai</option>
                                                <option>Bangalore</option>
                                            </select>
                                        </div>
                                        <button className="btn-primary !py-3">
                                            Save Changes
                                        </button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </div>
                </div>
            </div>

            <MobileNav />
        </main>
    );
}
