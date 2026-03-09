"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { Sheet } from "@/components/ui/sheet";
import { categories } from "@/lib/data";
import type { Workshop } from "@/lib/data";
import { trackEvent } from "@/lib/analytics";
import {
    fadeIn,
    fadeInUp,
    quickTransition,
    standardTransition,
    useMotionProps,
} from "@/lib/motion-presets";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MobileNav from "@/components/MobileNav";
import ExploreToolbarSection from "@/components/explore/ExploreToolbarSection";
import ExploreResultsSection from "@/components/explore/ExploreResultsSection";

type SortOption = "date_asc" | "date_desc" | "price_asc" | "price_desc" | "rating_desc";

type FilterState = {
    q: string;
    category: string;
    city: string;
    dateFrom: string;
    dateTo: string;
    minPrice: string;
    maxPrice: string;
    sort: SortOption;
    page: number;
    pageSize: number;
};

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
    { value: "date_asc", label: "Date: Soonest" },
    { value: "date_desc", label: "Date: Latest" },
    { value: "price_asc", label: "Price: Low to High" },
    { value: "price_desc", label: "Price: High to Low" },
    { value: "rating_desc", label: "Top Rated" },
];

const CITY_OPTIONS = ["", "Pune", "Mumbai", "Bangalore", "Delhi", "Hyderabad"];
const PAGE_SIZE = 8;

function buildFilterParams(next: FilterState) {
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.category) params.set("category", next.category);
    if (next.city) params.set("city", next.city);
    if (next.dateFrom) params.set("dateFrom", next.dateFrom);
    if (next.dateTo) params.set("dateTo", next.dateTo);
    if (next.minPrice) params.set("minPrice", next.minPrice);
    if (next.maxPrice) params.set("maxPrice", next.maxPrice);
    params.set("sort", next.sort);
    params.set("page", String(next.page));
    params.set("pageSize", String(next.pageSize));
    return params;
}

export default function ExploreClient({
    workshops,
    total,
    source,
}: {
    workshops: Workshop[];
    total: number;
    source: "supabase" | "mock" | "error";
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    const prefersReducedMotion = Boolean(useReducedMotion());
    const lastPushedParamsRef = useRef<string | null>(null);

    const parsedQuery = useMemo(() => {
        const urlSort = searchParams.get("sort") as SortOption | null;
        return {
            q: searchParams.get("q") || "",
            category: searchParams.get("category") || "",
            city: searchParams.get("city") || "",
            dateFrom: searchParams.get("dateFrom") || "",
            dateTo: searchParams.get("dateTo") || "",
            minPrice: searchParams.get("minPrice") || "",
            maxPrice: searchParams.get("maxPrice") || "",
            sort: SORT_OPTIONS.some((item) => item.value === urlSort)
                ? (urlSort as SortOption)
                : "date_asc",
            page: Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10)),
            pageSize: Math.max(
                1,
                Number.parseInt(searchParams.get("pageSize") || String(PAGE_SIZE), 10)
            ),
        };
    }, [searchParams]);

    const [searchQuery, setSearchQuery] = useState(parsedQuery.q);
    const [showFilters, setShowFilters] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState(parsedQuery.category);
    const [selectedCity, setSelectedCity] = useState(parsedQuery.city);
    const [dateFrom, setDateFrom] = useState(parsedQuery.dateFrom);
    const [dateTo, setDateTo] = useState(parsedQuery.dateTo);
    const [minPrice, setMinPrice] = useState(parsedQuery.minPrice);
    const [maxPrice, setMaxPrice] = useState(parsedQuery.maxPrice);
    const [sort, setSort] = useState<SortOption>(parsedQuery.sort);
    const [isMobileViewport, setIsMobileViewport] = useState(false);

    const totalPages = Math.max(1, Math.ceil(total / parsedQuery.pageSize));

    useEffect(() => {
        setSearchQuery(parsedQuery.q);
        setSelectedCategory(parsedQuery.category);
        setSelectedCity(parsedQuery.city);
        setDateFrom(parsedQuery.dateFrom);
        setDateTo(parsedQuery.dateTo);
        setMinPrice(parsedQuery.minPrice);
        setMaxPrice(parsedQuery.maxPrice);
        setSort(parsedQuery.sort);
    }, [
        parsedQuery.category,
        parsedQuery.city,
        parsedQuery.dateFrom,
        parsedQuery.dateTo,
        parsedQuery.maxPrice,
        parsedQuery.minPrice,
        parsedQuery.q,
        parsedQuery.sort,
    ]);

    useEffect(() => {
        const updateViewport = () => {
            setIsMobileViewport(window.innerWidth < 640);
        };

        updateViewport();

        window.addEventListener("resize", updateViewport);
        return () => {
            window.removeEventListener("resize", updateViewport);
        };
    }, []);

    const activeFilterCount = [
        selectedCategory,
        selectedCity,
        dateFrom,
        dateTo,
        minPrice,
        maxPrice,
    ].filter(Boolean).length;

    const pushFilters = (
        overrides?: Partial<typeof parsedQuery>,
        options?: { scrollToTop?: boolean }
    ) => {
        const next: FilterState = {
            q: searchQuery.trim(),
            category: selectedCategory.trim(),
            city: selectedCity.trim(),
            dateFrom: dateFrom.trim(),
            dateTo: dateTo.trim(),
            minPrice: String(minPrice).trim(),
            maxPrice: String(maxPrice).trim(),
            sort,
            page: 1,
            pageSize: parsedQuery.pageSize || PAGE_SIZE,
            ...overrides,
        };

        const current: FilterState = {
            q: parsedQuery.q.trim(),
            category: parsedQuery.category.trim(),
            city: parsedQuery.city.trim(),
            dateFrom: parsedQuery.dateFrom.trim(),
            dateTo: parsedQuery.dateTo.trim(),
            minPrice: parsedQuery.minPrice.trim(),
            maxPrice: parsedQuery.maxPrice.trim(),
            sort: parsedQuery.sort,
            page: parsedQuery.page,
            pageSize: parsedQuery.pageSize || PAGE_SIZE,
        };

        const nextParamsString = buildFilterParams(next).toString();
        const currentParamsString = buildFilterParams(current).toString();

        if (
            nextParamsString === currentParamsString ||
            nextParamsString === lastPushedParamsRef.current
        ) {
            return;
        }
        lastPushedParamsRef.current = nextParamsString;

        if (options?.scrollToTop) {
            window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
        }

        startTransition(() => {
            trackEvent("search_filters_updated", {
                q: next.q || null,
                category: next.category || null,
                city: next.city || null,
                sort: next.sort,
                page: next.page,
            });
            router.push(`/explore?${nextParamsString}`);
        });
    };

    const clearFilters = () => {
        setSearchQuery("");
        setSelectedCategory("");
        setSelectedCity("");
        setDateFrom("");
        setDateTo("");
        setMinPrice("");
        setMaxPrice("");
        setSort("date_asc");
        trackEvent("search_filters_cleared", {
            pageSize: parsedQuery.pageSize || PAGE_SIZE,
        });
        startTransition(() => {
            router.push(`/explore?page=1&pageSize=${parsedQuery.pageSize || PAGE_SIZE}`);
        });
    };

    const categoryOptions = categories
        .filter((item) => item.id !== "trending")
        .map((item) => item.label);
    const cityCount = CITY_OPTIONS.filter(Boolean).length;
    const exploreStats = [
        { label: "Workshops", value: String(total) },
        { label: "Categories", value: String(categoryOptions.length) },
        { label: "Cities", value: String(cityCount) },
    ];
    const appliedFilterSummary = [
        parsedQuery.city,
        parsedQuery.category,
        parsedQuery.dateFrom,
        parsedQuery.dateTo,
    ].filter(Boolean);

    const handleCategoryChange = (value: string) => {
        setSelectedCategory(value);
        pushFilters({ category: value, page: 1 });
    };

    const handleCityChange = (value: string) => {
        setSelectedCity(value);
        pushFilters({ city: value, page: 1 });
    };

    const applyFilters = () => {
        pushFilters({ page: 1 });
        if (isMobileViewport) {
            setShowFilters(false);
        }
    };

    const resetFilters = () => {
        clearFilters();
        if (isMobileViewport) {
            setShowFilters(false);
        }
    };

    const gridKey = `${parsedQuery.q}-${parsedQuery.category}-${parsedQuery.city}-${parsedQuery.sort}-${parsedQuery.page}`;
    const headingMotionProps = useMotionProps(prefersReducedMotion, fadeInUp, standardTransition, {
        whileInView: false,
    });
    const filterBarMotionProps = useMotionProps(
        prefersReducedMotion,
        fadeInUp,
        standardTransition,
        { whileInView: false, delay: 0.1 }
    );
    const filterPanelMotionProps = useMotionProps(prefersReducedMotion, fadeInUp, quickTransition, {
        whileInView: false,
    });
    const gridMotionProps = useMotionProps(prefersReducedMotion, fadeIn, quickTransition, {
        whileInView: false,
    });
    const mockBannerMotionProps = useMotionProps(prefersReducedMotion, fadeIn, quickTransition, {
        whileInView: false,
    });

    const filterControls = (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <select
                value={selectedCategory}
                onChange={(event) => handleCategoryChange(event.target.value)}
                className="bg-cream-100 border border-gray-200 rounded-xl px-3 py-3 text-sm font-inter text-dark outline-none"
            >
                <option value="">All Categories</option>
                {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                        {category}
                    </option>
                ))}
            </select>

            <select
                value={selectedCity}
                onChange={(event) => handleCityChange(event.target.value)}
                className="bg-cream-100 border border-gray-200 rounded-xl px-3 py-3 text-sm font-inter text-dark outline-none"
            >
                {CITY_OPTIONS.map((city) => (
                    <option key={city || "all"} value={city}>
                        {city || "All Cities"}
                    </option>
                ))}
            </select>

            <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="bg-cream-100 border border-gray-200 rounded-xl px-3 py-3 text-sm font-inter text-dark outline-none"
            />

            <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="bg-cream-100 border border-gray-200 rounded-xl px-3 py-3 text-sm font-inter text-dark outline-none"
            />

            <input
                type="number"
                value={minPrice}
                onChange={(event) => setMinPrice(event.target.value)}
                placeholder="Min price"
                className="bg-cream-100 border border-gray-200 rounded-xl px-3 py-3 text-sm font-inter text-dark outline-none"
            />

            <input
                type="number"
                value={maxPrice}
                onChange={(event) => setMaxPrice(event.target.value)}
                placeholder="Max price"
                className="bg-cream-100 border border-gray-200 rounded-xl px-3 py-3 text-sm font-inter text-dark outline-none"
            />
        </div>
    );

    const filterActions = (
        <div className="flex gap-3 mt-4">
            <button
                type="button"
                onClick={applyFilters}
                className="btn-primary !py-2.5 !px-5 text-sm"
            >
                Apply Filters
            </button>
            <button
                type="button"
                onClick={resetFilters}
                className="btn-secondary !py-2.5 !px-5 text-sm"
            >
                Reset
            </button>
        </div>
    );

    const activeChips: Array<{ label: string; onRemove: () => void }> = [];
    if (selectedCategory) {
        activeChips.push({
            label: selectedCategory,
            onRemove: () => {
                setSelectedCategory("");
                pushFilters({ category: "", page: 1 });
            },
        });
    }
    if (selectedCity) {
        activeChips.push({
            label: selectedCity,
            onRemove: () => {
                setSelectedCity("");
                pushFilters({ city: "", page: 1 });
            },
        });
    }
    if (minPrice || maxPrice) {
        const priceLabel =
            minPrice && maxPrice
                ? `Rs${minPrice} - Rs${maxPrice}`
                : minPrice
                  ? `Min Rs${minPrice}`
                  : `Max Rs${maxPrice}`;
        activeChips.push({
            label: priceLabel,
            onRemove: () => {
                setMinPrice("");
                setMaxPrice("");
                pushFilters({ minPrice: "", maxPrice: "", page: 1 });
            },
        });
    }
    if (dateFrom || dateTo) {
        const dateLabel =
            dateFrom && dateTo
                ? `${dateFrom} -> ${dateTo}`
                : dateFrom
                  ? `From ${dateFrom}`
                  : `Until ${dateTo}`;
        activeChips.push({
            label: dateLabel,
            onRemove: () => {
                setDateFrom("");
                setDateTo("");
                pushFilters({ dateFrom: "", dateTo: "", page: 1 });
            },
        });
    }

    return (
        <main className="min-h-screen pb-20 md:pb-0">
            <Navbar />

            <div className="pt-24 sm:pt-28">
                <ExploreToolbarSection
                    headingMotionProps={headingMotionProps}
                    filterBarMotionProps={filterBarMotionProps}
                    filterPanelMotionProps={filterPanelMotionProps}
                    appliedFilterSummary={appliedFilterSummary}
                    exploreStats={exploreStats}
                    searchQuery={searchQuery}
                    onSearchQueryChange={setSearchQuery}
                    onSearchEnter={() => pushFilters({ page: 1 })}
                    onClearSearch={() => setSearchQuery("")}
                    showFilters={showFilters}
                    onToggleFilters={() => setShowFilters((prev) => !prev)}
                    activeFilterCount={activeFilterCount}
                    sort={sort}
                    sortOptions={SORT_OPTIONS}
                    onSortChange={(value) => {
                        setSort(value);
                        pushFilters({ sort: value, page: 1 });
                    }}
                    onSearch={() => pushFilters({ page: 1 })}
                    activeChips={activeChips}
                    filterControls={filterControls}
                    filterActions={filterActions}
                />

                <ExploreResultsSection
                    isPending={isPending}
                    total={total}
                    source={source}
                    mockBannerMotionProps={mockBannerMotionProps}
                    workshops={workshops}
                    clearFilters={clearFilters}
                    gridKey={gridKey}
                    gridMotionProps={gridMotionProps}
                    prefersReducedMotion={prefersReducedMotion}
                    totalPages={totalPages}
                    currentPage={parsedQuery.page}
                    onPrevious={() =>
                        pushFilters(
                            { page: Math.max(1, parsedQuery.page - 1) },
                            { scrollToTop: true }
                        )
                    }
                    onNext={() =>
                        pushFilters(
                            { page: Math.min(totalPages, parsedQuery.page + 1) },
                            { scrollToTop: true }
                        )
                    }
                />
            </div>

            <Sheet
                open={showFilters && isMobileViewport}
                onOpenChange={setShowFilters}
                title="Filter Workshops"
                side="bottom"
                overlayClassName="sm:hidden"
                className="sm:hidden"
            >
                {filterControls}
                {filterActions}
            </Sheet>

            <Footer />
            <MobileNav />
        </main>
    );
}
