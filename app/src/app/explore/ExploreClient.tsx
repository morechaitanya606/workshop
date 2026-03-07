"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Search, SlidersHorizontal, X, Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MobileNav from "@/components/MobileNav";
import WorkshopCard from "@/components/WorkshopCard";
import { categories } from "@/lib/data";
import type { Workshop } from "@/lib/data";

type SortOption =
    | "date_asc"
    | "date_desc"
    | "price_asc"
    | "price_desc"
    | "rating_desc";

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
    { value: "date_asc", label: "Date: Soonest" },
    { value: "date_desc", label: "Date: Latest" },
    { value: "price_asc", label: "Price: Low to High" },
    { value: "price_desc", label: "Price: High to Low" },
    { value: "rating_desc", label: "Top Rated" },
];

const CITY_OPTIONS = ["", "Pune", "Mumbai", "Bangalore", "Delhi", "Hyderabad"];
const PAGE_SIZE = 8;

export default function ExploreClient({
    workshops,
    total,
    source,
}: {
    workshops: Workshop[];
    total: number;
    source: "supabase" | "mock";
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

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

    const totalPages = Math.max(1, Math.ceil(total / parsedQuery.pageSize));

    const pushFilters = (overrides?: Partial<typeof parsedQuery>) => {
        const next = {
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

        startTransition(() => {
            router.push(`/explore?${params.toString()}`);
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
        startTransition(() => {
            router.push(`/explore?page=1&pageSize=${parsedQuery.pageSize || PAGE_SIZE}`);
        });
    };

    const categoryOptions = categories
        .filter((item) => item.id !== "trending")
        .map((item) => item.label);

    return (
        <main className="min-h-screen pb-20 md:pb-0">
            <Navbar />

            <div className="pt-24 sm:pt-28">
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

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="mt-8 flex flex-col lg:flex-row gap-3"
                    >
                        <div className="flex-1 flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-soft border border-gray-100">
                            <Search className="w-5 h-5 text-dark-muted flex-shrink-0" />
                            <input
                                type="text"
                                placeholder="Search workshops, artists, or locations..."
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        pushFilters({ page: 1 });
                                    }
                                }}
                                className="flex-1 bg-transparent outline-none text-sm font-inter text-dark placeholder:text-dark-muted/60"
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery("")}>
                                    <X className="w-4 h-4 text-dark-muted" />
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setShowFilters((prev) => !prev)}
                                className={`flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-inter font-medium transition-all duration-300 ${showFilters
                                        ? "bg-terracotta text-white border-terracotta"
                                        : "bg-white text-terracotta border-terracotta hover:bg-terracotta/5"
                                    }`}
                            >
                                <SlidersHorizontal className="w-4 h-4" />
                                <span>Filters</span>
                            </button>

                            <select
                                value={sort}
                                onChange={(event) => {
                                    const value = event.target.value as SortOption;
                                    setSort(value);
                                    pushFilters({ sort: value, page: 1 });
                                }}
                                className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-sm font-inter text-dark outline-none"
                            >
                                {SORT_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>

                            <button
                                onClick={() => pushFilters({ page: 1 })}
                                className="btn-primary !py-3 !px-6 text-sm"
                            >
                                Search
                            </button>
                        </div>
                    </motion.div>

                    {showFilters && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-soft p-4 sm:p-5"
                        >
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                <select
                                    value={selectedCategory}
                                    onChange={(event) => setSelectedCategory(event.target.value)}
                                    className="bg-cream-100 border border-gray-200 rounded-xl px-3 py-3 text-sm font-inter text-dark outline-none"
                                >
                                    <option value="">All Categories</option>
                                    {categoryOptions.map((category) => (
                                        <option key={category} value={category}>{category}</option>
                                    ))}
                                </select>

                                <select
                                    value={selectedCity}
                                    onChange={(event) => setSelectedCity(event.target.value)}
                                    className="bg-cream-100 border border-gray-200 rounded-xl px-3 py-3 text-sm font-inter text-dark outline-none"
                                >
                                    {CITY_OPTIONS.map((city) => (
                                        <option key={city || "all"} value={city}>{city || "All Cities"}</option>
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

                            <div className="flex gap-3 mt-4">
                                <button onClick={() => pushFilters({ page: 1 })} className="btn-primary !py-2.5 !px-5 text-sm">Apply Filters</button>
                                <button onClick={clearFilters} className="btn-secondary !py-2.5 !px-5 text-sm">Reset</button>
                            </div>
                        </motion.div>
                    )}
                </div>

                <section className="section-padding mt-8">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-5">
                        <p className="text-sm font-inter text-dark-muted flex items-center gap-2">
                            {isPending && <Loader2 className="w-4 h-4 animate-spin text-terracotta" />}
                            {isPending ? "Updating..." : `${total} workshop${total === 1 ? "" : "s"} found`}
                        </p>
                    </div>

                    {!isPending && workshops.length === 0 && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-8 text-center">
                            <h2 className="heading-sm mb-2">No workshops match your filters</h2>
                            <p className="text-body text-dark-muted mb-6">Try broadening your search or resetting filters.</p>
                            <button onClick={clearFilters} className="btn-primary">Reset Filters</button>
                        </div>
                    )}

                    <div className={`grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 ${isPending ? "opacity-50" : ""}`}>
                        {workshops.map((workshop, index) => (
                            <WorkshopCard key={`${workshop.id}-${index}`} workshop={workshop} index={index} />
                        ))}
                    </div>

                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-3 mt-10">
                            <button
                                onClick={() => pushFilters({ page: Math.max(1, parsedQuery.page - 1) })}
                                disabled={parsedQuery.page <= 1 || isPending}
                                className="btn-secondary !py-2 !px-4 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Previous
                            </button>
                            <span className="text-sm font-inter text-dark-muted">Page {parsedQuery.page} of {totalPages}</span>
                            <button
                                onClick={() => pushFilters({ page: Math.min(totalPages, parsedQuery.page + 1) })}
                                disabled={parsedQuery.page >= totalPages || isPending}
                                className="btn-secondary !py-2 !px-4 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </section>
            </div>

            <Footer />
            <MobileNav />
        </main>
    );
}
