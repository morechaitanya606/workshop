"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { Info } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MobileNav from "@/components/MobileNav";
import HeroSection from "@/components/home/HeroSection";
import WorkshopBrowseSection from "@/components/home/WorkshopBrowseSection";
import WorkshopGridSection from "@/components/home/WorkshopGridSection";
import PastEventHighlight from "@/components/home/PastEventHighlight";
import HowItWorksSection from "@/components/home/HowItWorksSection";
import SocialProofSection from "@/components/home/SocialProofSection";
import PartnersMarquee from "@/components/home/PartnersMarquee";
import CommunityGallerySection from "@/components/home/CommunityGallerySection";
import HostCtaSection from "@/components/home/HostCtaSection";
import ScrollReveal from "@/components/ui/ScrollReveal";
import { categories, mockWorkshops, PAST_EVENTS_CATEGORY_LABEL } from "@/lib/data";
import type { Workshop } from "@/lib/data";
import { toApiErrorMessage, updateWorkshopNotifications } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { getRecentlyViewed } from "@/lib/recently-viewed";

const OTHER_CATEGORY_VALUE = "__other__";

export default function HomePageClient({
    initialWorkshops,
    source,
}: {
    initialWorkshops: Workshop[];
    source: "supabase" | "mock" | "error";
}) {
    const router = useRouter();
    const shouldReduceMotion = Boolean(useReducedMotion());
    const { user, session } = useAuth();
    const [selectedCategory, setSelectedCategory] = useState("trending");
    const [notifyMessage, setNotifyMessage] = useState<string | null>(null);
    const [notifyMessageTone, setNotifyMessageTone] = useState<"success" | "error">("success");
    const [pastNotifyLoading, setPastNotifyLoading] = useState<"similar" | "creator" | null>(null);
    const [notifyState, setNotifyState] = useState<
        Record<string, { similar: boolean; creator: boolean }>
    >({});
    const [recentlyViewedWorkshops, setRecentlyViewedWorkshops] = useState<Workshop[]>([]);

    const allWorkshops = useMemo(() => {
        if (source === "mock") {
            return initialWorkshops.length > 0 ? initialWorkshops : mockWorkshops;
        }
        return initialWorkshops;
    }, [initialWorkshops, source]);

    const today = new Date().toISOString().slice(0, 10);
    const selectedCategoryLabel = useMemo(() => {
        const matched = categories.find((item) => item.id === selectedCategory);
        if (matched) {
            return matched.id === "trending" ? "" : matched.label;
        }
        if (!selectedCategory || selectedCategory === OTHER_CATEGORY_VALUE) return "";
        return selectedCategory;
    }, [selectedCategory]);

    const upcomingWorkshops = allWorkshops.filter((workshop) => workshop.date >= today);
    const pastWorkshops = allWorkshops.filter((workshop) => workshop.date < today);
    const isPastEventsCategory =
        selectedCategoryLabel.toLowerCase() === PAST_EVENTS_CATEGORY_LABEL.toLowerCase();
    const categoryWorkshops = isPastEventsCategory
        ? pastWorkshops
        : selectedCategoryLabel
          ? upcomingWorkshops.filter((workshop) => workshop.category === selectedCategoryLabel)
          : upcomingWorkshops;
    const trendingTitle = useMemo(() => {
        if (isPastEventsCategory) {
            return PAST_EVENTS_CATEGORY_LABEL;
        }
        const citySet = new Set(
            categoryWorkshops
                .map((workshop) => workshop.city?.trim())
                .filter((city): city is string => Boolean(city))
        );
        if (citySet.size === 1) {
            return `Trending in ${Array.from(citySet)[0]}`;
        }
        if (citySet.size > 1) {
            return "Trending Across Cities";
        }
        return "Trending Workshops";
    }, [categoryWorkshops, isPastEventsCategory]);

    const trendingWorkshops = categoryWorkshops;
    const newWorkshops = categoryWorkshops.slice(0, 4);
    const upcomingGridClassName =
        "grid grid-flow-col auto-cols-[minmax(240px,280px)] gap-4 sm:gap-6 overflow-x-auto pb-3 scrollbar-hide snap-x snap-mandatory";
    const pastWorkshop = allWorkshops
        .filter((workshop) => workshop.date < today)
        .sort((a, b) => b.date.localeCompare(a.date))
        .at(0);

    const handlePastNotify = async (mode: "similar" | "creator") => {
        if (!pastWorkshop) return;

        if (!user || !session?.access_token) {
            const redirectPath = encodeURIComponent("/");
            router.push(`/auth/login?redirect=${redirectPath}`);
            return;
        }

        setPastNotifyLoading(mode);
        try {
            const response = await updateWorkshopNotifications(
                pastWorkshop.id,
                session.access_token,
                mode
            );
            setNotifyState((prev) => ({
                ...prev,
                [pastWorkshop.id]: response.subscriptions,
            }));
            setNotifyMessageTone("success");

            if (response.message) {
                setNotifyMessage(response.message);
            } else if (mode === "similar") {
                setNotifyMessage(
                    `Notification enabled. We will notify you when similar ${pastWorkshop.category.toLowerCase()} events are published.`
                );
            } else {
                setNotifyMessage(
                    `Notification enabled. We will notify you when ${pastWorkshop.hostName} launches the next event.`
                );
            }
        } catch (error) {
            setNotifyMessageTone("error");
            setNotifyMessage(
                toApiErrorMessage(
                    error,
                    "Unable to save your notification preference right now. Please try again."
                )
            );
        } finally {
            setPastNotifyLoading(null);
        }
    };

    useEffect(() => {
        const viewedIds = getRecentlyViewed();
        if (viewedIds.length > 0) {
            // Find workshop objects from all available data, keeping the order of viewedIds
            const workshopMap = new Map(allWorkshops.map((w) => [w.id, w]));
            const viewedData = viewedIds
                .map((id) => workshopMap.get(id))
                .filter((w): w is Workshop => w !== undefined);
            setRecentlyViewedWorkshops(viewedData);
        }
    }, [allWorkshops]);

    useEffect(() => {
        if (!notifyMessage) return;
        const timer = window.setTimeout(() => {
            setNotifyMessage(null);
        }, 5000);
        return () => window.clearTimeout(timer);
    }, [notifyMessage]);

    return (
        <main className="min-h-screen pb-20 md:pb-0">
            <Navbar />

            {source === "mock" && (
                <div className="section-padding pt-24 sm:pt-28 pb-0">
                    <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-inter text-amber-900">
                        <Info className="h-4 w-4" />
                        Showing sample workshops - live data unavailable.
                    </div>
                </div>
            )}
            {source === "error" && (
                <div className="section-padding pt-24 sm:pt-28 pb-0">
                    <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-inter text-red-700">
                        <Info className="h-4 w-4 shrink-0" />
                        <span>
                            Unable to load live workshops right now. Please refresh or try again
                            soon.
                        </span>
                        <button
                            onClick={() => router.refresh()}
                            className="ml-auto underline font-medium hover:text-red-900 transition-colors"
                        >
                            Refresh
                        </button>
                    </div>
                </div>
            )}

            <HeroSection source={source} />
            <ScrollReveal>
                <HowItWorksSection />
            </ScrollReveal>

            <section className="section-padding mt-24 sm:mt-16">
                <div className="bg-white rounded-3xl shadow-card border border-clay/30 p-6 md:p-8">
                    <WorkshopGridSection
                        title="This weekend"
                        eyebrow="This weekend"
                        sectionClassName="mt-0"
                        gridClassName={upcomingGridClassName}
                        cardWrapperClassName="snap-start"
                        gridKeyPrefix="upcoming"
                        selectedCategory={selectedCategory}
                        shouldReduceMotion={shouldReduceMotion}
                        workshops={newWorkshops}
                        emptyTitle="No additional upcoming workshops"
                        emptyDescription="We could not find more upcoming events for this category. Try another category or browse all workshops."
                        selectedCategoryLabel={selectedCategoryLabel}
                        onTryAnotherCategory={() => setSelectedCategory("trending")}
                    />
                </div>
            </section>

            {recentlyViewedWorkshops.length > 0 && (
                <WorkshopGridSection
                    title="Recently Viewed"
                    eyebrow="Pick up where you left off"
                    sectionClassName="section-padding mt-24 sm:mt-16"
                    gridClassName="grid grid-flow-col auto-cols-[minmax(240px,280px)] gap-4 sm:gap-6 overflow-x-auto pb-3 scrollbar-hide snap-x snap-mandatory"
                    cardWrapperClassName="snap-start"
                    gridKeyPrefix="recent"
                    selectedCategory={""}
                    selectedCategoryLabel=""
                    onTryAnotherCategory={() => {}}
                    shouldReduceMotion={shouldReduceMotion}
                    workshops={recentlyViewedWorkshops}
                    emptyTitle=""
                    emptyDescription=""
                />
            )}

            <WorkshopGridSection
                title={trendingTitle}
                eyebrow="Trending"
                sectionClassName="section-padding mt-24 sm:mt-16"
                gridClassName="grid grid-flow-col auto-cols-[minmax(240px,280px)] gap-4 sm:gap-6 overflow-x-auto pb-3 scrollbar-hide snap-x snap-mandatory"
                cardWrapperClassName="snap-start"
                gridKeyPrefix="trending"
                selectedCategory={selectedCategory}
                shouldReduceMotion={shouldReduceMotion}
                workshops={trendingWorkshops}
                emptyTitle="No trending workshops yet"
                emptyDescription="We do not have trending items for this category right now. Try another category or browse all workshops."
                selectedCategoryLabel={selectedCategoryLabel}
                onTryAnotherCategory={() => setSelectedCategory("trending")}
            />

            {pastWorkshop && (
                <PastEventHighlight
                    pastWorkshop={pastWorkshop}
                    shouldReduceMotion={shouldReduceMotion}
                    notifyState={notifyState[pastWorkshop.id] || { similar: false, creator: false }}
                    pastNotifyLoading={pastNotifyLoading}
                    onNotify={(mode) => {
                        void handlePastNotify(mode);
                    }}
                    notifyMessage={notifyMessage}
                    notifyMessageTone={notifyMessageTone}
                />
            )}

            <ScrollReveal>
                <SocialProofSection shouldReduceMotion={shouldReduceMotion} />
            </ScrollReveal>
            <ScrollReveal>
                <PartnersMarquee shouldReduceMotion={shouldReduceMotion} />
            </ScrollReveal>
            <section className="section-padding mt-24 sm:mt-20">
                <ScrollReveal className="bg-white rounded-3xl shadow-card border border-clay/30 p-6 md:p-8">
                    <CommunityGallerySection
                        shouldReduceMotion={shouldReduceMotion}
                        sectionClassName="mt-0"
                    />
                </ScrollReveal>
            </section>
            <ScrollReveal>
                <HostCtaSection shouldReduceMotion={shouldReduceMotion} />
            </ScrollReveal>

            <Footer />
            <MobileNav />
        </main>
    );
}
