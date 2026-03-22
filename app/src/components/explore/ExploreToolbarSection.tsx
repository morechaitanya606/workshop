"use client";

import type { ComponentProps, ReactNode } from "react";
import { motion } from "framer-motion";
import { Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import CategoryFilter from "@/components/CategoryFilter";

type SortOption = "date_asc" | "date_desc" | "price_asc" | "price_desc" | "rating_desc";

type MotionDivProps = ComponentProps<typeof motion.div>;

export default function ExploreToolbarSection({
    headingMotionProps,
    filterBarMotionProps,
    filterPanelMotionProps,
    appliedFilterSummary,
    exploreStats,
    searchQuery,
    onSearchQueryChange,
    onSearchEnter,
    onClearSearch,
    showFilters,
    onToggleFilters,
    activeFilterCount,
    sort,
    sortOptions,
    onSortChange,
    onSearch,
    activeChips,
    filterControls,
    filterActions,
    categorySelection,
    onCategoryChange,
}: {
    headingMotionProps: MotionDivProps;
    filterBarMotionProps: MotionDivProps;
    filterPanelMotionProps: MotionDivProps;
    appliedFilterSummary: string[];
    exploreStats: Array<{ label: string; value: string }>;
    searchQuery: string;
    onSearchQueryChange: (value: string) => void;
    onSearchEnter: () => void;
    onClearSearch: () => void;
    showFilters: boolean;
    onToggleFilters: () => void;
    activeFilterCount: number;
    sort: SortOption;
    sortOptions: Array<{ value: SortOption; label: string }>;
    onSortChange: (value: SortOption) => void;
    onSearch: () => void;
    activeChips: Array<{ label: string; onRemove: () => void }>;
    filterControls: ReactNode;
    filterActions: ReactNode;
    categorySelection: string;
    onCategoryChange: (category: string) => void;
}) {
    return (
        <div className="section-padding">
            <motion.div
                {...headingMotionProps}
                className="rounded-3xl border border-clay/50 bg-gradient-to-br from-white via-cream-50 to-cream-100 p-6 sm:p-8"
            >
                <div className="inline-flex items-center gap-2 rounded-full border border-terracotta/20 bg-terracotta/10 px-3 py-1 text-xs font-inter font-semibold uppercase tracking-wider text-terracotta">
                    <Sparkles className="h-3.5 w-3.5" />
                    Browse Creative Experiences
                </div>
                <h1 className="heading-xl mt-4 mb-2">Explore Workshops</h1>
                <p className="text-body text-dark-muted">
                    Find your next creative adventure across categories and cities.
                </p>
                {appliedFilterSummary.length > 0 && (
                    <p className="mt-3 text-xs font-inter text-dark-muted">
                        Using filters: {appliedFilterSummary.join(" | ")}
                    </p>
                )}
                <div className="mt-6 grid grid-cols-3 gap-3">
                    {exploreStats.map((stat) => (
                        <div
                            key={stat.label}
                            className="rounded-2xl border border-gray-200 bg-white/85 px-4 py-3 text-center"
                        >
                            <p className="font-playfair text-xl font-bold text-dark">
                                {stat.value}
                            </p>
                            <p className="text-[11px] font-inter font-semibold uppercase tracking-wider text-dark-muted">
                                {stat.label}
                            </p>
                        </div>
                    ))}
                </div>
            </motion.div>

            <motion.div {...filterBarMotionProps} className="mt-8 relative z-20">
                <CategoryFilter
                    activeCategory={categorySelection}
                    onCategoryChange={onCategoryChange}
                />
            </motion.div>

            <motion.div {...filterBarMotionProps} className="mt-6 flex flex-col lg:flex-row gap-3">
                <div className="flex-1 flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-soft border border-gray-100">
                    <Search className="w-5 h-5 text-dark-muted flex-shrink-0" />
                    <input
                        type="text"
                        placeholder="Search workshops, artists, or locations..."
                        value={searchQuery}
                        onChange={(event) => onSearchQueryChange(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                onSearchEnter();
                            }
                        }}
                        className="flex-1 bg-transparent outline-none text-sm font-inter text-dark placeholder:text-dark-muted/60"
                    />
                    {searchQuery && (
                        <button type="button" onClick={onClearSearch} aria-label="Clear search">
                            <X className="w-4 h-4 text-dark-muted" />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onToggleFilters}
                        aria-expanded={showFilters}
                        aria-controls="explore-filters-panel"
                        className={`flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-inter font-medium transition-all duration-300 ${
                            showFilters
                                ? "bg-terracotta text-white border-terracotta"
                                : "bg-white text-dark border-gray-200 hover:border-terracotta/40 hover:text-terracotta"
                        }`}
                    >
                        <SlidersHorizontal className="w-4 h-4" />
                        <span>Filters</span>
                        {activeFilterCount > 0 && (
                            <span className="text-xs font-semibold">({activeFilterCount})</span>
                        )}
                    </button>

                    <select
                        value={sort}
                        onChange={(event) => onSortChange(event.target.value as SortOption)}
                        className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-sm font-inter text-dark outline-none"
                    >
                        {sortOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>

                    <button
                        type="button"
                        onClick={onSearch}
                        className="btn-primary !py-3 !px-6 text-sm"
                    >
                        Search
                    </button>
                </div>
            </motion.div>

            {activeChips.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full bg-cream-100 px-3 py-1.5 text-xs font-inter font-semibold text-dark-muted">
                        Active filters ({activeFilterCount})
                    </span>
                    {activeChips.map((chip) => (
                        <span
                            key={chip.label}
                            className="inline-flex items-center gap-1.5 bg-terracotta/10 text-terracotta text-xs font-inter font-semibold px-3 py-1.5 rounded-full"
                        >
                            {chip.label}
                            <button
                                type="button"
                                onClick={chip.onRemove}
                                aria-label={`Remove ${chip.label} filter`}
                                className="hover:text-terracotta-700"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {showFilters && (
                <motion.div
                    {...filterPanelMotionProps}
                    id="explore-filters-panel"
                    className="mt-4 hidden sm:block bg-white rounded-2xl border border-gray-100 shadow-soft p-4 sm:p-5"
                >
                    {filterControls}
                    {filterActions}
                </motion.div>
            )}
        </div>
    );
}
