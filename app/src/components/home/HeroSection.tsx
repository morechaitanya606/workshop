"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import {
    fadeIn,
    fadeInUp,
    quickTransition,
    scaleIn,
    slowBounce,
    standardTransition,
    useMotionProps,
} from "@/lib/motion-presets";

export default function HeroSection({ source }: { source: "supabase" | "mock" | "error" }) {
    const heroRef = useRef<HTMLDivElement>(null);
    const shouldReduceMotion = Boolean(useReducedMotion());
    const { scrollYProgress } = useScroll({
        target: heroRef,
        offset: ["start start", "end start"],
    });
    const heroY = useTransform(scrollYProgress, [0, 1], [0, shouldReduceMotion ? 0 : 150]);
    const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, shouldReduceMotion ? 1 : 0]);
    const heroScale = useTransform(scrollYProgress, [0, 0.5], [1, shouldReduceMotion ? 1 : 1.1]);
    const heroTextOverlayOpacity = useTransform(
        scrollYProgress,
        [0, 0.45],
        [0, shouldReduceMotion ? 0 : 1]
    );

    const heroBadgeMotionProps = useMotionProps(shouldReduceMotion, scaleIn, quickTransition, {
        whileInView: false,
        delay: 0.2,
    });
    const heroHeadlineMotionProps = useMotionProps(
        shouldReduceMotion,
        fadeInUp,
        standardTransition,
        {
            whileInView: false,
            delay: 0.3,
        }
    );
    const heroBodyMotionProps = useMotionProps(shouldReduceMotion, fadeInUp, standardTransition, {
        whileInView: false,
        delay: 0.45,
    });
    const heroCtaMotionProps = useMotionProps(shouldReduceMotion, fadeInUp, standardTransition, {
        whileInView: false,
        delay: 0.7,
    });
    const scrollIndicatorMotionProps = useMotionProps(shouldReduceMotion, fadeIn, quickTransition, {
        whileInView: false,
        delay: 1.5,
    });

    return (
        <section
            ref={heroRef}
            className={`relative overflow-hidden ${
                source !== "supabase" ? "h-[82vh] sm:h-[90vh]" : "h-[90vh] sm:h-screen"
            }`}
        >
            <motion.div
                style={shouldReduceMotion ? undefined : { y: heroY, scale: heroScale }}
                className="absolute inset-0"
            >
                <Image
                    src="/images/background.webp"
                    alt="Creative workshops collage"
                    fill
                    priority
                    className="object-cover"
                    sizes="100vw"
                />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#fbe4db_0%,_#fefbea_45%,_#f5e48a_100%)] opacity-75 mix-blend-soft-light" />
                <div className="absolute inset-0 grain-overlay" />
                <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80" />
            </motion.div>
            <motion.div
                style={shouldReduceMotion ? undefined : { opacity: heroTextOverlayOpacity }}
                className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-cream/20 to-cream/80"
            />

            <motion.div
                style={shouldReduceMotion ? undefined : { opacity: heroOpacity }}
                className="relative z-10 h-full flex flex-col items-center justify-center text-center px-4"
            >
                <motion.div
                    {...heroBadgeMotionProps}
                    className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md border border-white/20 rounded-full px-5 py-2 mb-8 hover-lift"
                >
                    <Sparkles className="w-4 h-4 text-terracotta-300" />
                    <span className="text-sm font-inter font-medium text-white/90">
                        Creative experiences in Pune
                    </span>
                </motion.div>

                <div className="text-animate-reveal mb-6">
                    <motion.h1
                        {...heroHeadlineMotionProps}
                        className="heading-xl text-white max-w-4xl text-balance text-glow-soft"
                    >
                        A Better Weekend
                        <br />
                        <span className="text-terracotta-300">Awaits.</span>
                    </motion.h1>
                </div>

                <div className="overflow-hidden mb-10">
                    <motion.p
                        {...heroBodyMotionProps}
                        className="text-lg sm:text-xl font-inter text-white/80 max-w-xl"
                    >
                        Discover pottery, painting, cooking and more with handpicked hosts across
                        Pune.
                    </motion.p>
                </div>

                <motion.div
                    {...heroCtaMotionProps}
                    className="flex flex-col sm:flex-row items-center gap-4"
                >
                    <Link
                        href="/explore"
                        className="btn-primary btn-animated text-base !px-10 !py-4 shadow-lg shadow-terracotta/25"
                    >
                        Explore Workshops
                        <ArrowRight className="w-5 h-5" />
                    </Link>
                </motion.div>
            </motion.div>

            {!shouldReduceMotion && (
                <motion.div
                    {...scrollIndicatorMotionProps}
                    className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
                    aria-hidden="true"
                >
                    <motion.div
                        animate={{ y: [0, 8, 0] }}
                        transition={slowBounce}
                        className="w-6 h-10 rounded-full border-2 border-white/40 flex items-start justify-center p-2"
                    >
                        <motion.div className="w-1.5 h-1.5 bg-white rounded-full" />
                    </motion.div>
                </motion.div>
            )}
        </section>
    );
}
