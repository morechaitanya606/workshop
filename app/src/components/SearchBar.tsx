"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Search, Calendar, MapPin, ArrowRight } from "lucide-react";
import { categories } from "@/lib/data";

interface SearchBarProps {
    selectedCategoryId?: string;
}

export default function SearchBar({ selectedCategoryId = "trending" }: SearchBarProps) {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [date, setDate] = useState("");
    const [city, setCity] = useState("Pune");

    const selectedCategory = useMemo(() => {
        const matched = categories.find((item) => item.id === selectedCategoryId);
        if (!matched || matched.id === "trending") return "";
        return matched.label;
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

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-4xl mx-auto"
        >
            <div className="bg-white rounded-2xl shadow-card p-2 sm:p-3">
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
                                className="w-full bg-transparent outline-none text-sm font-inter text-dark placeholder:text-dark-muted/60"
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
                                className="w-full bg-transparent outline-none text-sm font-inter text-dark placeholder:text-dark-muted/60"
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
                                className="w-full bg-transparent outline-none text-sm font-inter text-dark appearance-none cursor-pointer"
                            >
                                <option>Pune</option>
                                <option>Mumbai</option>
                                <option>Bangalore</option>
                                <option>Delhi</option>
                            </select>
                        </div>
                    </div>

                    {/* Search Button */}
                    <div className="flex items-center px-2">
                        <button
                            onClick={handleSearch}
                            className="btn-primary w-full sm:w-auto !rounded-xl !px-6"
                        >
                            <span className="hidden sm:inline">Find Fun</span>
                            <ArrowRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
