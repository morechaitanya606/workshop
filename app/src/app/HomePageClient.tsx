"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { ArrowRight, BellRing, ChevronRight, Sparkles, Users, Trophy, Handshake, Star, Mail, Phone } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MobileNav from "@/components/MobileNav";
import WorkshopCard from "@/components/WorkshopCard";
import CategoryFilter from "@/components/CategoryFilter";
import SearchBar from "@/components/SearchBar";
import { mockWorkshops, socialMetrics, galleryImages } from "@/lib/data";
import type { Workshop } from "@/lib/data";
import { useAuth } from "@/lib/auth-context";
import { formatDate } from "@/lib/utils";

// ─── Animated Counter ────────────────────────────────────────────
function AnimatedCounter({ value, suffix = "" }: { value: number; suffix?: string }) {
    const [count, setCount] = useState(0);
    const ref = useRef<HTMLDivElement>(null);
    const isInView = useInView(ref, { once: true, margin: "-100px" });

    useEffect(() => {
        if (!isInView) return;
        let start = 0;
        const duration = 2000;
        const increment = value / (duration / 16);
        const timer = setInterval(() => {
            start += increment;
            if (start >= value) {
                setCount(value);
                clearInterval(timer);
            } else {
                setCount(Math.floor(start));
            }
        }, 16);
        return () => clearInterval(timer);
    }, [isInView, value]);

    return (
        <div ref={ref} className="font-playfair text-4xl sm:text-5xl lg:text-6xl font-bold text-dark">
            {count.toLocaleString()}{suffix}
        </div>
    );
}

// ─── Section Header ──────────────────────────────────────────────
function SectionHeader({
    title,
    action,
    href = "#",
}: {
    title: string;
    action?: string;
    href?: string;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-end justify-between mb-8"
        >
            <h2 className="heading-lg">{title}</h2>
            {action && (
                <Link
                    href={href}
                    className="hidden sm:flex items-center gap-1 text-sm font-inter font-semibold text-terracotta hover:gap-2 transition-all duration-300"
                >
                    {action}
                    <ArrowRight className="w-4 h-4" />
                </Link>
            )}
        </motion.div>
    );
}

// ─── Main Homepage Client ───────────────────────────────────────────────
export default function HomePageClient({ initialWorkshops }: { initialWorkshops: Workshop[] }) {
    const router = useRouter();
    const { user } = useAuth();
    const heroRef = useRef<HTMLDivElement>(null);
    const [selectedCategory, setSelectedCategory] = useState("trending");
    const [notifyMessage, setNotifyMessage] = useState<string | null>(null);
    const [notifyState, setNotifyState] = useState<Record<string, { similar: boolean; creator: boolean }>>({});

    const { scrollYProgress } = useScroll({
        target: heroRef,
        offset: ["start start", "end start"],
    });
    const heroY = useTransform(scrollYProgress, [0, 1], [0, 150]);
    const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
    const heroScale = useTransform(scrollYProgress, [0, 0.5], [1, 1.1]);

    const allWorkshops = initialWorkshops.length > 0 ? initialWorkshops : mockWorkshops;
    const today = new Date().toISOString().slice(0, 10);
    const upcomingWorkshops = allWorkshops.filter((w) => w.date >= today);
    const trendingWorkshops = upcomingWorkshops.slice(0, 4);
    const newWorkshops = upcomingWorkshops.slice(4, 8);
    const pastWorkshop = allWorkshops
        .filter((workshop) => workshop.date < today)
        .sort((a, b) => b.date.localeCompare(a.date))
        .at(0);

    const handlePastNotify = (mode: "similar" | "creator") => {
        if (!pastWorkshop) return;

        if (!user) {
            const redirectPath = encodeURIComponent("/");
            router.push(`/auth/login?redirect=${redirectPath}`);
            return;
        }

        setNotifyState((prev) => ({
            ...prev,
            [pastWorkshop.id]: {
                similar: mode === "similar" ? true : prev[pastWorkshop.id]?.similar || false,
                creator: mode === "creator" ? true : prev[pastWorkshop.id]?.creator || false,
            },
        }));

        if (mode === "similar") {
            setNotifyMessage(
                `Notification enabled. We will notify you when similar ${pastWorkshop.category.toLowerCase()} events are published.`
            );
            return;
        }

        setNotifyMessage(
            `Notification enabled. We will notify you when ${pastWorkshop.hostName} launches the next event.`
        );
    };

    return (
        <main className="min-h-screen pb-20 md:pb-0">
            <Navbar />

            {/* ═════════ HERO SECTION ═════════ */}
            <section ref={heroRef} className="relative h-[90vh] sm:h-screen overflow-hidden">
                {/* Parallax Background */}
                <motion.div style={{ y: heroY, scale: heroScale }} className="absolute inset-0">
                    <Image
                        src="/images/background.webp"
                        alt="Creative workshops collage"
                        fill
                        priority
                        className="object-cover"
                        sizes="100vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80" />
                </motion.div>

                {/* Hero Content */}
                <motion.div
                    style={{ opacity: heroOpacity }}
                    className="relative z-10 h-full flex flex-col items-center justify-center text-center px-4"
                >
                    {/* Sparkle badge */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md border border-white/20 rounded-full px-5 py-2 mb-8"
                    >
                        <Sparkles className="w-4 h-4 text-terracotta-300" />
                        <span className="text-sm font-inter font-medium text-white/90">
                            Creative experiences in your city
                        </span>
                    </motion.div>

                    {/* Headline with text reveal */}
                    <div className="overflow-hidden mb-6">
                        <motion.h1
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            className="heading-xl text-white max-w-4xl text-balance"
                        >
                            A Better Weekend
                            <br />
                            <span className="text-terracotta-300">
                                Awaits
                            </span>
                        </motion.h1>
                    </div>

                    <div className="overflow-hidden mb-10">
                        <motion.p
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            transition={{ duration: 0.7, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
                            className="text-lg sm:text-xl font-inter text-white/80 max-w-xl"
                        >
                            Discover creative workshops and experiences happening in your city.
                        </motion.p>
                    </div>

                    {/* CTAs */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.7 }}
                        className="flex flex-col sm:flex-row items-center gap-4"
                    >
                        <Link href="/explore" className="btn-primary text-base !px-10 !py-4 shadow-lg shadow-terracotta/25">
                            Explore Workshops
                            <ArrowRight className="w-5 h-5" />
                        </Link>
                    </motion.div>
                </motion.div>

                {/* Scroll Indicator */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.5 }}
                    className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
                >
                    <motion.div
                        animate={{ y: [0, 8, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        className="w-6 h-10 rounded-full border-2 border-white/40 flex items-start justify-center p-2"
                    >
                        <motion.div className="w-1.5 h-1.5 bg-white rounded-full" />
                    </motion.div>
                </motion.div>
            </section>

            {/* ═════════ SEARCH BAR SECTION ═════════ */}
            <section className="relative -mt-12 z-20 section-padding">
                <SearchBar selectedCategoryId={selectedCategory} />
            </section>

            {/* ═════════ CATEGORY FILTERS ═════════ */}
            <section className="section-padding mt-10">
                <CategoryFilter
                    activeCategory={selectedCategory}
                    onCategoryChange={setSelectedCategory}
                />
            </section>

            {/* ═════════ TRENDING WORKSHOPS ═════════ */}
            <section className="section-padding mt-14">
                <SectionHeader title="Trending in Pune" action="View all" href="/explore" />
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                    {trendingWorkshops.map((w, i) => (
                        <WorkshopCard key={w.id} workshop={w} index={i} />
                    ))}
                </div>
            </section>

            {/* ═════════ UPCOMING WORKSHOPS ═════════ */}
            <section className="section-padding mt-20">
                <SectionHeader title="Upcoming Workshops" action="View all" href="/explore" />
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                    {newWorkshops.map((w, i) => (
                        <WorkshopCard key={w.id} workshop={w} index={i} />
                    ))}
                </div>
            </section>

            {/* ═════════ PAST EVENT HIGHLIGHT ═════════ */}
            {pastWorkshop && (
                <section className="section-padding mt-20">
                    <SectionHeader title="Past Event Highlight" action="View details" href={`/workshop/${pastWorkshop.id}`} />
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-50px" }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        className="bg-white border border-gray-100 rounded-3xl shadow-soft overflow-hidden"
                    >
                        <div className="grid grid-cols-1 lg:grid-cols-[360px,1fr]">
                            <div className="relative min-h-[260px] lg:min-h-full">
                                <Image
                                    src={pastWorkshop.coverImage}
                                    alt={pastWorkshop.title}
                                    fill
                                    className="object-cover"
                                    sizes="(max-width: 1024px) 100vw, 360px"
                                />
                            </div>
                            <div className="p-6 sm:p-8">
                                <div className="inline-flex items-center gap-2 bg-terracotta/10 text-terracotta text-xs font-inter font-bold uppercase tracking-wider px-3 py-1.5 rounded-full mb-4">
                                    Past Event
                                </div>
                                <h3 className="font-playfair text-2xl font-bold text-dark mb-2">
                                    {pastWorkshop.title}
                                </h3>
                                <p className="text-sm font-inter text-dark-muted mb-4">
                                    {formatDate(pastWorkshop.date)} &bull; {pastWorkshop.time} &bull; {pastWorkshop.location}, {pastWorkshop.city}
                                </p>

                                <div className="bg-cream-100 rounded-2xl p-4 sm:p-5 border border-clay/40 mb-5">
                                    <p className="text-[11px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                        Attendee Feedback
                                    </p>
                                    <p className="text-sm sm:text-base font-inter text-dark-secondary leading-relaxed">
                                        &ldquo;{pastWorkshop.feedbackHighlight || `Rated ${pastWorkshop.rating}/5 from ${pastWorkshop.reviewCount} reviews.`}&rdquo;
                                    </p>
                                    <p className="text-xs font-inter text-dark-muted mt-2">
                                        {pastWorkshop.feedbackAuthor || `${pastWorkshop.reviewCount} verified reviews`}
                                    </p>
                                </div>

                                <div className="flex flex-wrap gap-3">
                                    <button
                                        onClick={() => handlePastNotify("similar")}
                                        className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-inter font-semibold transition-colors ${notifyState[pastWorkshop.id]?.similar
                                            ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                                            : "bg-terracotta text-white hover:bg-terracotta-600"
                                            }`}
                                    >
                                        <BellRing className="w-4 h-4" />
                                        {notifyState[pastWorkshop.id]?.similar
                                            ? "Similar Event Alerts On"
                                            : "Notify Similar Event"}
                                    </button>
                                    <button
                                        onClick={() => handlePastNotify("creator")}
                                        className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-inter font-semibold transition-colors ${notifyState[pastWorkshop.id]?.creator
                                            ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                                            : "bg-white text-dark-secondary border border-gray-200 hover:border-terracotta hover:text-terracotta"
                                            }`}
                                    >
                                        <BellRing className="w-4 h-4" />
                                        {notifyState[pastWorkshop.id]?.creator
                                            ? "Creator Alerts On"
                                            : "Notify Creator Next Event"}
                                    </button>
                                    <Link
                                        href={`/workshop/${pastWorkshop.id}`}
                                        className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-inter font-semibold bg-white text-dark-secondary border border-gray-200 hover:border-terracotta hover:text-terracotta transition-colors"
                                    >
                                        View Event Page
                                        <ChevronRight className="w-4 h-4" />
                                    </Link>
                                </div>

                                {notifyMessage && (
                                    <p className="mt-4 text-xs font-inter text-emerald-700">
                                        {notifyMessage}
                                    </p>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </section>
            )}

            {/* ═════════ SOCIAL PROOF ═════════ */}
            <section className="section-padding mt-24">
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8 }}
                    className="relative bg-dark rounded-3xl p-10 sm:p-16 overflow-hidden"
                >
                    {/* Background texture */}
                    <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
                        <div className="absolute inset-0" style={{
                            backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
                            backgroundSize: '30px 30px',
                        }} />
                    </div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="relative z-10 text-center mb-12"
                    >
                        <h2 className="heading-lg text-white mb-4">
                            Join Our Creative Community
                        </h2>
                        <p className="text-body text-white/60 max-w-lg mx-auto mb-8">
                            Thousands of people have discovered their creative spark through our workshops.
                        </p>
                        <a
                            href="https://chat.whatsapp.com/Cwk12c9wUJy6AnRhg3dUMc"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white font-inter font-semibold px-6 py-3 rounded-full transition-colors shadow-lg shadow-[#25D366]/20"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                            </svg>
                            Join WhatsApp Community
                        </a>
                    </motion.div>

                    <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-12">
                        {socialMetrics.map((metric, i) => (
                            <motion.div
                                key={metric.label}
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.15, duration: 0.6 }}
                                className="text-center"
                            >
                                <div className="text-terracotta-300 mb-3 flex justify-center">
                                    {[Users, Trophy, Handshake, Star][i] &&
                                        (() => {
                                            const Icon = [Users, Trophy, Handshake, Star][i];
                                            return <Icon className="w-7 h-7" />;
                                        })()}
                                </div>
                                <AnimatedCounter value={metric.value} suffix={metric.suffix} />
                                <p className="text-sm font-inter text-white/50 mt-2">
                                    {metric.label}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </section>

            {/* ═════════ OUR PARTNERS (MARQUEE) ═════════ */}
            <section className="section-padding overflow-hidden mt-16 mb-4">
                <div className="max-w-7xl mx-auto mb-10 text-center px-4">
                    <h3 className="font-playfair text-3xl font-bold text-dark mb-4">
                        Our Cafe Partners
                    </h3>
                    <p className="text-body text-dark-muted max-w-2xl mx-auto">
                        We host our experiences at the finest cafes across the city.
                    </p>
                </div>

                <div className="flex w-full relative">
                    <motion.div
                        animate={{ x: ["-50%", "0%"] }}
                        transition={{ repeat: Infinity, ease: "linear", duration: 40 }}
                        className="flex gap-6 items-center whitespace-nowrap min-w-max pr-6"
                    >
                        {[
                            { name: "Starbucks", img: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=200&h=200" },
                            { name: "Cafe Peter", img: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=200&h=200" },
                            { name: "Blue Tokai", img: "https://images.unsplash.com/photo-1507133750073-1f1f2bc88eb1?auto=format&fit=crop&q=80&w=200&h=200" },
                            { name: "Nook Cafe", img: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&q=80&w=200&h=200" },
                            { name: "Boka Cafe", img: "https://images.unsplash.com/photo-1600093463592-8e36ae95ef56?auto=format&fit=crop&q=80&w=200&h=200" },
                            { name: "Third Space Cafe", img: "https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&q=80&w=200&h=200" },
                            { name: "Third Place Cafe", img: "https://images.unsplash.com/photo-1453614512568-c4024d13c247?auto=format&fit=crop&q=80&w=200&h=200" },
                            { name: "Raaha Cafe", img: "https://images.unsplash.com/photo-1525610553991-2bede1a236e2?auto=format&fit=crop&q=80&w=200&h=200" },

                            { name: "Starbucks", img: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=200&h=200" },
                            { name: "Cafe Peter", img: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=200&h=200" },
                            { name: "Blue Tokai", img: "https://images.unsplash.com/photo-1507133750073-1f1f2bc88eb1?auto=format&fit=crop&q=80&w=200&h=200" },
                            { name: "Nook Cafe", img: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&q=80&w=200&h=200" },
                            { name: "Boka Cafe", img: "https://images.unsplash.com/photo-1600093463592-8e36ae95ef56?auto=format&fit=crop&q=80&w=200&h=200" },
                            { name: "Third Space Cafe", img: "https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&q=80&w=200&h=200" },
                            { name: "Third Place Cafe", img: "https://images.unsplash.com/photo-1453614512568-c4024d13c247?auto=format&fit=crop&q=80&w=200&h=200" },
                            { name: "Raaha Cafe", img: "https://images.unsplash.com/photo-1525610553991-2bede1a236e2?auto=format&fit=crop&q=80&w=200&h=200" }
                        ].map((partner, i) => (
                            <div key={i} className="flex items-center gap-4 bg-white px-6 py-4 rounded-2xl shadow-sm border border-clay/30 min-w-[240px]">
                                <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-cream border border-clay/50">
                                    <img src={partner.img} alt={partner.name} className="w-full h-full object-cover" />
                                </div>
                                <span className="font-playfair font-bold text-lg text-dark">{partner.name}</span>
                            </div>
                        ))}
                    </motion.div>
                </div>
            </section>

            {/* ═════════ COMMUNITY GALLERY ═════════ */}
            <section className="section-padding mt-24">
                <SectionHeader title="From Our Community" />
                <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 sm:gap-4">
                    {galleryImages.map((img, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, scale: 0.9 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true, margin: "-30px" }}
                            transition={{ duration: 0.5, delay: i * 0.05 }}
                            className="relative mb-3 sm:mb-4 rounded-xl overflow-hidden group break-inside-avoid"
                        >
                            <Image
                                src={img}
                                alt={`Community workshop ${i + 1}`}
                                width={400}
                                height={i % 3 === 0 ? 500 : i % 3 === 1 ? 350 : 400}
                                className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-105"
                                loading="lazy"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-500" />
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* ═════════ WANT TO HOST SECTION ═════════ */}
            <section className="section-padding mt-24">
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8 }}
                    className="relative bg-gradient-to-br from-terracotta to-terracotta-700 rounded-3xl p-10 sm:p-16 text-center overflow-hidden"
                >
                    {/* Decorative circles */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />

                    <div className="relative z-10">
                        <h2 className="heading-lg text-white mb-4">
                            Want to Host a Workshop?
                        </h2>
                        <p className="text-lg font-inter text-white/80 max-w-lg mx-auto mb-8">
                            Are you a creative professional? Get in touch with our team and we will help you set up your workshop.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
                            <a
                                href="mailto:hello@onlyworkshop.com"
                                className="inline-flex items-center gap-2.5 bg-white text-terracotta font-inter font-semibold px-8 py-4 rounded-full hover:shadow-lg hover:scale-[1.02] transition-all duration-300"
                            >
                                <Mail className="w-5 h-5" />
                                hello@onlyworkshop.com
                            </a>
                            <a
                                href="tel:+919876543210"
                                className="inline-flex items-center gap-2.5 bg-white/15 backdrop-blur-sm text-white border-2 border-white/30 font-inter font-semibold px-8 py-4 rounded-full hover:border-white/60 hover:bg-white/25 transition-all duration-300"
                            >
                                <Phone className="w-5 h-5" />
                                +91 98765 43210
                            </a>
                        </div>
                    </div>
                </motion.div>
            </section>

            <Footer />
            <MobileNav />
        </main >
    );
}
