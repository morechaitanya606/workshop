"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { ArrowRight, ChevronRight, Sparkles, Users, Trophy, Handshake, Star, Mail, Phone } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MobileNav from "@/components/MobileNav";
import WorkshopCard from "@/components/WorkshopCard";
import CategoryFilter from "@/components/CategoryFilter";
import SearchBar from "@/components/SearchBar";
import { mockWorkshops, socialMetrics, galleryImages } from "@/lib/data";

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

// ─── Main Homepage ───────────────────────────────────────────────
export default function HomePage() {
    const heroRef = useRef<HTMLDivElement>(null);
    const [selectedCategory, setSelectedCategory] = useState("trending");
    const { scrollYProgress } = useScroll({
        target: heroRef,
        offset: ["start start", "end start"],
    });
    const heroY = useTransform(scrollYProgress, [0, 1], [0, 150]);
    const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
    const heroScale = useTransform(scrollYProgress, [0, 0.5], [1, 1.1]);

    const trendingWorkshops = mockWorkshops.slice(0, 4);
    const newWorkshops = mockWorkshops.slice(4, 8);

    return (
        <main className="min-h-screen pb-20 md:pb-0">
            <Navbar />

            {/* ═════════ HERO SECTION ═════════ */}
            <section ref={heroRef} className="relative h-[90vh] sm:h-screen overflow-hidden">
                {/* Parallax Background */}
                <motion.div style={{ y: heroY, scale: heroScale }} className="absolute inset-0">
                    <Image
                        src="/images/background.png"
                        alt="Creative workshops collage"
                        fill
                        priority
                        className="object-cover"
                        sizes="100vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/60" />
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
                            <span className="text-gradient bg-gradient-to-r from-terracotta-300 to-clay">
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

            {/* ═════════ NEW & NOTEWORTHY ═════════ */}
            <section className="section-padding mt-20">
                <SectionHeader title="New & Noteworthy" action="View all" href="/explore" />
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                    {newWorkshops.map((w, i) => (
                        <WorkshopCard key={w.id} workshop={w} index={i} />
                    ))}
                </div>
            </section>

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
                    <div className="absolute inset-0 opacity-[0.03]">
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
                        className="text-center mb-12"
                    >
                        <h2 className="heading-lg text-white mb-4">
                            Join Our Creative Community
                        </h2>
                        <p className="text-body text-white/60 max-w-lg mx-auto">
                            Thousands of people have discovered their creative spark through our workshops.
                        </p>
                    </motion.div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-12">
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
        </main>
    );
}
