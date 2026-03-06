"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { categories } from "@/lib/data";

interface CategoryFilterProps {
    onCategoryChange?: (category: string) => void;
    activeCategory?: string;
}

export default function CategoryFilter({
    onCategoryChange,
    activeCategory,
}: CategoryFilterProps) {
    const [localActive, setLocalActive] = useState("trending");
    const active = activeCategory ?? localActive;

    const handleClick = (id: string) => {
        if (!activeCategory) {
            setLocalActive(id);
        }
        onCategoryChange?.(id);
    };

    return (
        <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide py-2 px-1">
            {categories.map((cat) => (
                <motion.button
                    key={cat.id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleClick(cat.id)}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-inter font-medium whitespace-nowrap transition-all duration-300 ${active === cat.id ? "pill-active" : "pill-default"
                        }`}
                >
                    <span className="text-base">{cat.icon}</span>
                    {cat.label}
                </motion.button>
            ))}
        </div>
    );
}
