"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Search, Calendar, MapPin, ArrowRight } from "lucide-react";
import { categories } from "@/lib/data";
import { fadeInUp, standardTransition, useMotionProps } from "@/lib/motion-presets";

const OTHER_CATEGORY_VALUE = "__other__";

interface SearchBarProps {
    selectedCategoryId?: string;
}

export default function SearchBar({ selectedCategoryId = "trending" }: SearchBarProps) {
    const router = useRouter();
    const prefersReducedMotion = useReducedMotion();
    const [query, setQuery] = useState("");
    const [date, setDate] = useState("");
    const [city, setCity] = useState("");

    const selectedCategory = useMemo(() => {
        const matched = categories.find((item) => item.id === selectedCategoryId);
        if (matched) {
            return matched.id === "trending" ? "" : matched.label;
        }
        if (!selectedCategoryId || selectedCategoryId === OTHER_CATEGORY_VALUE) return "";
        return selectedCategoryId;
    }, [selectedCategoryId]);

    const handleSearch = () => {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (date) params.set("dateFrom", date);
        if (city) params.set("city", city);
        if (selectedCategory) params.set("category", selectedCategory);
        params.set("page", "1");
        router.push(`/explore?${params.toString()}`);
    };
    const searchMotionProps = useMotionProps(prefersReducedMotion, fadeInUp, standardTransition, {
        whileInView: false,
        delay: 0.4,
    });

    return (
        <motion.div {...searchMotionProps} className="w-full max-w-4xl mx-auto relative z-30">
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    handleSearch();
                }}
                className="bg-white rounded-2xl shadow-card p-2 sm:p-3 relative z-30"
            >
                <div className="grid grid-cols-1 sm:grid-cols-[1fr,1fr,1fr,auto] gap-2 sm:gap-0">
                    {/* What */}
                    <div className="flex items-center gap-3 px-4 py-3 sm:border-r border-gray-100">
                        <Search className="w-5 h-5 text-dark-muted flex-shrink-0" />
                        <div className="flex-1">
                            <label className="block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-0.5">
                                What
                            </label>
                            <input
                                type="text"
                                placeholder="Pottery, Jazz, Hiking..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        event.preventDefault();
                                        handleSearch();
                                    }
                                }}
                                className="w-full bg-transparent outline-none text-sm font-inter text-dark placeholder:text-dark-muted/60 focus-visible:outline-none"
                            />
                        </div>
                    </div>

                    {/* When */}
                    <div className="flex items-center gap-3 px-4 py-3 sm:border-r border-gray-100">
                        <Calendar className="w-5 h-5 text-dark-muted flex-shrink-0" />
                        <div className="flex-1">
                            <label className="block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-0.5">
                                When
                            </label>
                            <input
                                type="date"
                                placeholder="Pick a date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full bg-transparent outline-none text-sm font-inter text-dark placeholder:text-dark-muted/60 focus-visible:outline-none"
                            />
                        </div>
                    </div>

                    {/* Where */}
                    <div className="flex items-center gap-3 px-4 py-3">
                        <MapPin className="w-5 h-5 text-dark-muted flex-shrink-0" />
                        <div className="flex-1">
                            <label className="block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-0.5">
                                Where
                            </label>
                            <select
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                className="w-full bg-transparent outline-none text-sm font-inter text-dark appearance-none cursor-pointer focus-visible:outline-none"
                            >
                                <option value="">All Cities</option>
                                <option>City</option>
                                <option>Mumbai</option>
                                <option>Bangalore</option>
                                <option>Delhi</option>
                            </select>
                        </div>
                    </div>

                    {/* Search Button */}
                    <div className="flex items-center px-2">
                        <button
                            type="submit"
                            className="btn-primary w-full sm:w-auto !rounded-xl !px-6"
                        >
                            <span className="hidden sm:inline">Find Experiences</span>
                            <ArrowRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </form>
        </motion.div>
    );
}
