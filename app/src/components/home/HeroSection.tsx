"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

const HERO_MOBILE_QUERY = "(max-width: 640px)";

/**
 * Where the hero renditions are served from.
 *
 * Unset (the default) serves them from `public/videos`, which is where the four renditions
 * the homepage uses actually live -- Vercel's CDN includes 100GB/month on this plan, against
 * 5GB on Supabase's free tier that is shared with API, auth and database traffic.
 *
 * Setting NEXT_PUBLIC_MEDIA_BASE_URL moves them to an object store without touching this
 * file. Worth doing once traffic is real; see app/public/videos/README.md.
 *
 * Pick that origin deliberately: these clips are 4-8MB each, so on a metered store they
 * dominate the egress bill. Cloudflare R2 (already allow-listed in next.config.mjs and the
 * image proxy) charges nothing for egress and is the intended home.
 */
const MEDIA_BASE_URL = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL || "").replace(/\/+$/, "");

function heroVideoUrl(fileName: string) {
    return MEDIA_BASE_URL ? `${MEDIA_BASE_URL}/${fileName}` : `/videos/${fileName}`;
}

/**
 * Desktop shows all three clips at once as a pre-composited 1920x1080 triptych, so the
 * vertical footage keeps its full frame instead of being cropped to a narrow 16:9 band.
 * It is a single looping file — there is no sequence to advance on wide screens.
 */
const HERO_VIDEO_DESKTOP = heroVideoUrl("hero-triptych.mp4");

/**
 * A phone is too narrow for three panels, so it plays the portrait clips one at a time,
 * in order, looping back to the first.
 */
const HERO_MOBILE_CLIPS = [
    heroVideoUrl("hero-1-mobile.mp4"),
    heroVideoUrl("hero-2-mobile.mp4"),
    heroVideoUrl("hero-3-mobile.mp4"),
];

/**
 * How long to wait for a clip to actually start playing before giving up on it.
 *
 * A slow connection does not fire `error` - the request just hangs, so the poster stays up
 * while the browser keeps pulling megabytes the visitor will never see. Past this deadline
 * the element is unmounted, which aborts the download and leaves the poster as the final
 * state instead of a permanently "loading" hero.
 */
const HERO_PLAYBACK_DEADLINE_MS = 8000;

export default function HeroSection({
    source,
    heroImageUrl,
}: {
    source: "supabase" | "error";
    heroImageUrl?: string;
}) {
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

    const headlineWords = ["A", "Better", "Weekend"];
    const heroImageSrc = heroImageUrl?.trim() || "/images/background.webp";

    // Rendition is resolved after mount so the server render always emits the poster
    // image only. `readySrc`/`failedSrc` are tracked per-source so advancing to the next
    // clip (or switching crop on resize) re-runs the fade instead of flashing a
    // half-loaded frame.
    const [isMobileRendition, setIsMobileRendition] = useState<boolean | null>(null);
    const [clipIndex, setClipIndex] = useState(0);
    const [readySrc, setReadySrc] = useState<string | null>(null);
    const [failedSrcs, setFailedSrcs] = useState<ReadonlySet<string>>(() => new Set());

    useEffect(() => {
        if (shouldReduceMotion) {
            setIsMobileRendition(null);
            return;
        }

        const mediaQuery = window.matchMedia(HERO_MOBILE_QUERY);
        const applyRendition = () => setIsMobileRendition(mediaQuery.matches);

        applyRendition();
        mediaQuery.addEventListener("change", applyRendition);
        return () => mediaQuery.removeEventListener("change", applyRendition);
    }, [shouldReduceMotion]);

    const videoSrc =
        isMobileRendition === null
            ? null
            : isMobileRendition
              ? HERO_MOBILE_CLIPS[clipIndex]
              : HERO_VIDEO_DESKTOP;

    const advanceClip = useCallback(
        () => setClipIndex((index) => (index + 1) % HERO_MOBILE_CLIPS.length),
        []
    );

    const hasCurrentFailed = Boolean(videoSrc) && failedSrcs.has(videoSrc!);
    // Desktop is a single file, so one failure is already the end of the road there.
    const haveAllFailed = isMobileRendition
        ? HERO_MOBILE_CLIPS.every((src) => failedSrcs.has(src))
        : hasCurrentFailed;

    // Skip past a clip that could not load, but stop once every clip has failed so the
    // sequence cannot spin forever — the poster image is the fallback at that point.
    useEffect(() => {
        if (!hasCurrentFailed || haveAllFailed) return;
        advanceClip();
    }, [advanceClip, hasCurrentFailed, haveAllFailed]);

    // Treat "never started playing" the same as a load error. Without this a stalled
    // request keeps downloading a multi-megabyte clip on a connection too slow to ever
    // show it, which is the worst outcome for the visitor: no video AND wasted data.
    useEffect(() => {
        if (!videoSrc || readySrc === videoSrc || failedSrcs.has(videoSrc)) return;

        const timer = setTimeout(() => {
            setFailedSrcs((previous) => new Set(previous).add(videoSrc));
        }, HERO_PLAYBACK_DEADLINE_MS);

        return () => clearTimeout(timer);
    }, [videoSrc, readySrc, failedSrcs]);

    // Autoplay can be refused (data saver, low power mode) without firing `error`,
    // so the poster stays visible underneath until the video actually plays.
    const isVideoVisible = Boolean(videoSrc) && readySrc === videoSrc;
    const shouldRenderVideo = Boolean(videoSrc) && !hasCurrentFailed;

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
                    src={heroImageSrc}
                    alt="Creative workshops collage"
                    fill
                    priority
                    className="object-cover"
                    sizes="100vw"
                />
                {shouldRenderVideo && videoSrc && (
                    <video
                        key={videoSrc}
                        src={videoSrc}
                        poster={heroImageSrc}
                        autoPlay
                        muted
                        loop={!isMobileRendition}
                        playsInline
                        // Never "auto": that races the full file down before playback starts, which is
                        // exactly what stalls a hero on a slow mobile connection.
                        preload="metadata"
                        aria-hidden="true"
                        tabIndex={-1}
                        onPlaying={() => setReadySrc(videoSrc)}
                        onEnded={isMobileRendition ? advanceClip : undefined}
                        onError={() => setFailedSrcs((previous) => new Set(previous).add(videoSrc))}
                        className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-700 ease-out ${
                            isVideoVisible ? "opacity-100" : "opacity-0"
                        }`}
                    />
                )}
                <div className="absolute inset-0 hero-gradient-mesh" />
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
                        Creative experiences in the city
                    </span>
                </motion.div>

                <div className="mb-6">
                    <h1 className="heading-xl text-white max-w-4xl text-balance text-glow-soft">
                        {headlineWords.map((word, i) => (
                            <motion.span
                                key={word}
                                initial={shouldReduceMotion ? undefined : { opacity: 0, y: 20 }}
                                animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                                transition={
                                    shouldReduceMotion
                                        ? { duration: 0 }
                                        : {
                                              duration: 0.5,
                                              delay: 0.3 + i * 0.12,
                                              ease: [0.22, 1, 0.36, 1],
                                          }
                                }
                                className="inline-block mr-[0.3em]"
                            >
                                {word}
                            </motion.span>
                        ))}
                        <br />
                        <motion.span
                            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 20 }}
                            animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                            transition={
                                shouldReduceMotion
                                    ? { duration: 0 }
                                    : { duration: 0.5, delay: 0.66, ease: [0.22, 1, 0.36, 1] }
                            }
                            className="text-terracotta-300 inline-block"
                        >
                            Awaits.
                        </motion.span>
                    </h1>
                </div>

                <div className="overflow-hidden mb-10">
                    <motion.p
                        {...heroBodyMotionProps}
                        className="text-lg sm:text-xl font-inter text-white/80 max-w-xl"
                    >
                        Celebrate through experience. Connect through creativity.
                    </motion.p>
                </div>

                <motion.div
                    {...heroCtaMotionProps}
                    className="flex flex-col sm:flex-row items-center gap-4"
                >
                    <Link
                        href="/explore"
                        className="btn-primary btn-animated text-base !px-10 !py-4 shadow-lg shadow-terracotta/25 hover:shadow-xl hover:shadow-terracotta/40 hover:ring-4 hover:ring-terracotta/20"
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
