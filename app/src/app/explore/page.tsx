"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Search, SlidersHorizontal, Heart, MapPin, X } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MobileNav from "@/components/MobileNav";
import WorkshopCard from "@/components/WorkshopCard";
import { mockWorkshops } from "@/lib/data";

export default function ExplorePage() {
    const [searchQuery, setSearchQuery] = useState("");
    const [showFilters, setShowFilters] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState("all");

    const categories = [
        "All",
        "Pottery",
        "Painting",
        "Food & Drink",
        "Music",
        "Arts & Crafts",
        "Wellness",
        "Photography",
    ];

    const filteredWorkshops = mockWorkshops.filter((w) => {
        const matchesSearch =
            searchQuery === "" ||
            w.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            w.category.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory =
            selectedCategory === "all" ||
            w.category.toLowerCase() === selectedCategory.toLowerCase();
        return matchesSearch && matchesCategory;
    });

    // Group workshops
    const recommended = filteredWorkshops.slice(0, 4);
    const happeningNow = filteredWorkshops.slice(2, 6);
    const newOnPlatform = filteredWorkshops.slice(4);

    return (
        <main className="min-h-screen pb-20 md:pb-0">
            <Navbar />

            <div className="pt-24 sm:pt-28">
                {/* Header */}
                <div className="section-padding">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <h1 className="heading-xl mb-2">Explore Workshops</h1>
                        <p className="text-body text-dark-muted">
                            Find your next creative adventure
                        </p>
                    </motion.div>

                    {/* Search + Filter Row */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="mt-8 flex gap-3"
                    >
                        <div className="flex-1 flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-soft border border-gray-100">
                            <Search className="w-5 h-5 text-dark-muted flex-shrink-0" />
                            <input
                                type="text"
                                placeholder="Search for workshops, artists, or locations..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="flex-1 bg-transparent outline-none text-sm font-inter text-dark placeholder:text-dark-muted/60"
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery("")}>
                                    <X className="w-4 h-4 text-dark-muted" />
                                </button>
                            )}
                        </div>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-inter font-medium transition-all duration-300 ${showFilters
                                    ? "bg-terracotta text-white border-terracotta"
                                    : "bg-white text-terracotta border-terracotta hover:bg-terracotta/5"
                                }`}
                        >
                            <SlidersHorizontal className="w-4 h-4" />
                            <span className="hidden sm:inline">Filter</span>
                        </button>
                    </motion.div>

                    {/* Category Chips */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="mt-5 flex gap-2 overflow-x-auto scrollbar-hide pb-2"
                    >
                        {categories.map((cat) => (
                            <button
                                key={cat}
                                onClick={() =>
                                    setSelectedCategory(cat === "All" ? "all" : cat)
                                }
                                className={`px-4 py-2 rounded-full text-sm font-inter font-medium whitespace-nowrap transition-all duration-300 ${(cat === "All" && selectedCategory === "all") ||
                                        cat.toLowerCase() === selectedCategory.toLowerCase()
                                        ? "bg-terracotta text-white"
                                        : "bg-white text-dark-secondary border border-gray-200 hover:border-terracotta"
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </motion.div>
                </div>

                {/* Recommended Section */}
                {recommended.length > 0 && (
                    <section className="section-padding mt-10">
                        <motion.h2
                            initial={{ opacity: 0, y: 15 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="heading-md mb-6"
                        >
                            Recommended for You
                        </motion.h2>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                            {recommended.map((w, i) => (
                                <WorkshopCard key={w.id} workshop={w} index={i} />
                            ))}
                        </div>
                    </section>
                )}

                {/* Happening This Weekend */}
                {happeningNow.length > 0 && (
                    <section className="section-padding mt-16">
                        <motion.h2
                            initial={{ opacity: 0, y: 15 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="heading-md mb-6"
                        >
                            Happening This Weekend
                        </motion.h2>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                            {happeningNow.map((w, i) => (
                                <WorkshopCard key={w.id + "-hw"} workshop={w} index={i} />
                            ))}
                        </div>
                    </section>
                )}

                {/* New on the Platform */}
                {newOnPlatform.length > 0 && (
                    <section className="section-padding mt-16">
                        <motion.h2
                            initial={{ opacity: 0, y: 15 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="heading-md mb-6"
                        >
                            New on the Platform
                        </motion.h2>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                            {newOnPlatform.map((w, i) => (
                                <WorkshopCard key={w.id + "-np"} workshop={w} index={i} />
                            ))}
                        </div>
                    </section>
                )}
            </div>

            <Footer />
            <MobileNav />
        </main>
    );
}
