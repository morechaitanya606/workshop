"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { categories } from "@/lib/data";

const OTHER_CATEGORY_VALUE = "__other__";

interface CategoryFilterProps {
    onCategoryChange?: (category: string) => void;
    activeCategory?: string;
}

export default function CategoryFilter({ onCategoryChange, activeCategory }: CategoryFilterProps) {
    const [localActive, setLocalActive] = useState("trending");
    const [customCategory, setCustomCategory] = useState("");
    const active = activeCategory ?? localActive;
    const isCustomActive = Boolean(active) && !categories.some((cat) => cat.id === active);
    const activeId = isCustomActive ? OTHER_CATEGORY_VALUE : active;
    const filterCategories = [
        ...categories,
        { id: OTHER_CATEGORY_VALUE, label: "Other", icon: "+" },
    ];

    const handleClick = (id: string) => {
        if (!activeCategory) {
            setLocalActive(id);
        }
        if (id === OTHER_CATEGORY_VALUE) {
            const nextValue = customCategory.trim();
            onCategoryChange?.(nextValue || OTHER_CATEGORY_VALUE);
            return;
        }
        setCustomCategory("");
        onCategoryChange?.(id);
    };

    const handleCustomCategoryChange = (value: string) => {
        setCustomCategory(value);
        if (!activeCategory) {
            setLocalActive(OTHER_CATEGORY_VALUE);
        }
        const nextValue = value.trim();
        onCategoryChange?.(nextValue || OTHER_CATEGORY_VALUE);
    };

    useEffect(() => {
        if (!activeCategory) return;
        if (!activeCategory || activeCategory === OTHER_CATEGORY_VALUE) return;
        const isKnown = categories.some((cat) => cat.id === activeCategory);
        setCustomCategory(isKnown ? "" : activeCategory);
    }, [activeCategory]);

    return (
        <div>
            <div className="flex items-center gap-3 overflow-x-auto px-1 pt-2 pb-3 scrollbar-subtle">
                {filterCategories.map((cat) => (
                    <motion.button
                        key={cat.id}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleClick(cat.id)}
                        aria-pressed={activeId === cat.id}
                        className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-inter font-medium whitespace-nowrap transition-all duration-300 ${
                            activeId === cat.id ? "pill-active" : "pill-default"
                        }`}
                    >
                        {cat.icon ? <span className="text-base">{cat.icon}</span> : null}
                        {cat.label}
                    </motion.button>
                ))}
            </div>
            {activeId === OTHER_CATEGORY_VALUE && (
                <div className="mt-3 max-w-xs">
                    <input
                        value={customCategory}
                        onChange={(event) => handleCustomCategoryChange(event.target.value)}
                        placeholder="Type a custom category"
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-inter text-dark outline-none"
                    />
                </div>
            )}
        </div>
    );
}
