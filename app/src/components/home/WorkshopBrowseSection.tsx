"use client";

import CategoryFilter from "@/components/CategoryFilter";
import SearchBar from "@/components/SearchBar";

export default function WorkshopBrowseSection({
    selectedCategory,
    selectedCategoryLabel,
    onCategoryChange,
}: {
    selectedCategory: string;
    selectedCategoryLabel: string;
    onCategoryChange: (category: string) => void;
}) {
    return (
        <>
            <section className="relative -mt-12 z-20 section-padding">
                <SearchBar selectedCategoryId={selectedCategory} />
            </section>

            <section className="section-padding mt-10">
                <CategoryFilter
                    activeCategory={selectedCategory}
                    onCategoryChange={onCategoryChange}
                />
                {selectedCategoryLabel && (
                    <p className="mt-4 text-sm font-inter text-dark-muted">
                        Showing category:{" "}
                        <span className="font-semibold">{selectedCategoryLabel}</span>
                    </p>
                )}
            </section>
        </>
    );
}
