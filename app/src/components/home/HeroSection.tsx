"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { isImageDownloadTooSlowForVideo } from "@/lib/hero-video-bandwidth";
import { heroVideoUrl } from "@/lib/media";
import { fadeIn, quickTransition, useMotionProps } from "@/lib/motion-presets";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import HeroVideoPanel from "./HeroVideoPanel";

const HERO_MOBILE_QUERY = "(max-width: 640px)";

/**
 * The renditions are committed under public/videos and served from Vercel's CDN; `@/lib/media`
 * resolves the origin (and how to move it to R2 later). Keep the file names here in step with
 * the exceptions in .gitignore and .vercelignore, or a deploy ships without them.
 *
 * All five are 720x1280 portrait clips (see public/videos/README.md).
 */
const CLIP_1 = heroVideoUrl("hero-1-mobile.mp4");
const CLIP_2 = heroVideoUrl("hero-2-mobile.mp4");
const CLIP_3 = heroVideoUrl("hero-3-mobile.mp4");
const CLIP_4 = heroVideoUrl("hero-4-mobile.mp4");
const CLIP_5 = heroVideoUrl("hero-5-mobile.mp4");

/**
 * Desktop is three portrait panels side by side, so the vertical footage keeps its full frame
 * instead of being cropped to a narrow 16:9 band. The side panels each loop their own clip;
 * the middle plays its clips one after another and loops back to the first. The arrays are
 * module constants so the panels see the same list on every render.
 */
const HERO_LEFT_CLIPS = [CLIP_4];
const HERO_MIDDLE_CLIPS = [CLIP_1, CLIP_2, CLIP_3];
const HERO_RIGHT_CLIPS = [CLIP_5];

/**
 * A phone is too narrow for three panels, so it plays all the clips one at a time, in order,
 * looping back to the first. Each clip is fetched only when its turn comes.
 */
const HERO_MOBILE_CLIPS = [CLIP_1, CLIP_2, CLIP_3, CLIP_4, CLIP_5];

/** Scroll-linked parallax only where it is cheap: a mouse/trackpad on a wide screen. */
const HERO_PARALLAX_QUERY = "(pointer: fine) and (min-width: 768px)";

type NetworkInformationLike = { saveData?: boolean; effectiveType?: string };

function getNetworkInformation() {
    return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

/** Data saver on, or a 2G/3G connection: the poster image is the better hero there. */
function prefersNoHeroVideo() {
    const connection = getNetworkInformation();
    if (!connection) return false;
    return (
        connection.saveData === true ||
        ["slow-2g", "2g", "3g"].includes(connection.effectiveType ?? "")
    );
}

export default function HeroSection({
    source,
    heroImageUrl,
}: {
    source: "supabase" | "error";
    heroImageUrl?: string;
}) {
    const heroRef = useRef<HTMLDivElement>(null);
    // Hydration-safe: false on the server and on the first client render, then the real value.
    const shouldReduceMotion = usePrefersReducedMotion();
    const { scrollYProgress } = useScroll({
        target: heroRef,
        offset: ["start start", "end start"],
    });
    // No scale: re-scaling the video layer on every scroll frame was the costliest part. On
    // phones the parallax styles are not bound (see HERO_PARALLAX_QUERY), so a touch scroll only
    // updates these values; nothing is restyled or repainted.
    const heroY = useTransform(scrollYProgress, [0, 1], [0, shouldReduceMotion ? 0 : 150]);
    const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, shouldReduceMotion ? 1 : 0]);
    const heroTextOverlayOpacity = useTransform(
        scrollYProgress,
        [0, 0.45],
        [0, shouldReduceMotion ? 0 : 1]
    );

    const scrollIndicatorMotionProps = useMotionProps(shouldReduceMotion, fadeIn, quickTransition, {
        whileInView: false,
        delay: 1.5,
    });

    const headlineWords = ["A", "Better", "Weekend"];
    const heroImageSrc = heroImageUrl?.trim() || "/images/background.webp";

    // Rendition is resolved after mount so the server render always emits the poster
    // image only. Each video panel tracks its own clips (HeroVideoPanel), so switching between
    // the phone player and the three desktop panels on resize starts them afresh.
    const [isMobileRendition, setIsMobileRendition] = useState<boolean | null>(null);
    const [isHeroInView, setIsHeroInView] = useState(true);
    const [isParallaxEnabled, setIsParallaxEnabled] = useState(false);
    // Set once a playing clip keeps rebuffering; the poster image stays for the rest of the visit.
    const [hasVideoStalledOut, setHasVideoStalledOut] = useState(false);

    useEffect(() => {
        // Read the preference directly here: `shouldReduceMotion` starts false for hydration, and
        // keying this effect on it would briefly mount (then abort) a video for those visitors.
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || prefersNoHeroVideo()) {
            setIsMobileRendition(null);
            return;
        }

        const mediaQuery = window.matchMedia(HERO_MOBILE_QUERY);
        const applyRendition = () => setIsMobileRendition(mediaQuery.matches);
        // Start the video only once the page itself has loaded, so megabytes of clip do not
        // compete with the photos and scripts the visitor is waiting for.
        const start = () => {
            // No navigator.connection (iOS Safari, Firefox): judge the link by how fast the hero
            // image came down, which by `load` it has. Unmeasured or fast enough, nothing changes.
            if (
                !getNetworkInformation() &&
                isImageDownloadTooSlowForVideo(heroRef.current?.querySelector("img"))
            ) {
                return;
            }
            applyRendition();
            mediaQuery.addEventListener("change", applyRendition);
        };

        if (document.readyState === "complete") {
            start();
        } else {
            window.addEventListener("load", start, { once: true });
        }

        return () => {
            window.removeEventListener("load", start);
            mediaQuery.removeEventListener("change", applyRendition);
        };
    }, []);

    useEffect(() => {
        const mediaQuery = window.matchMedia(HERO_PARALLAX_QUERY);
        const apply = () => setIsParallaxEnabled(mediaQuery.matches);

        apply();
        mediaQuery.addEventListener("change", apply);
        return () => mediaQuery.removeEventListener("change", apply);
    }, []);

    // Unmount the video once the hero is scrolled away: that stops the download and the decoding
    // instead of letting a clip nobody sees take bandwidth from the photos being scrolled to.
    useEffect(() => {
        const node = heroRef.current;
        if (!node || typeof IntersectionObserver === "undefined") return;

        const observer = new IntersectionObserver(
            ([entry]) => setIsHeroInView(entry.isIntersecting),
            { threshold: 0.05 }
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    // Video plays only once the rendition is known, while the hero is on screen, and until a clip
    // has run dry too often. Scrolling away unmounts the panels, which stops the downloads.
    const isVideoActive = isMobileRendition !== null && isHeroInView && !hasVideoStalledOut;
    const parallaxActive = isParallaxEnabled && !shouldReduceMotion;
    const dropVideo = () => setHasVideoStalledOut(true);

    return (
        <section
            ref={heroRef}
            className={`relative overflow-hidden ${
                source !== "supabase" ? "h-[82vh] sm:h-[90vh]" : "h-[90vh] sm:h-screen"
            }`}
        >
            <motion.div
                // Keys stay present when parallax is off (a static value): removing a key from a
                // motion style leaves its last inline value behind instead of resetting it.
                style={{ y: parallaxActive ? heroY : 0 }}
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
                {isVideoActive &&
                    (isMobileRendition ? (
                        <HeroVideoPanel sources={HERO_MOBILE_CLIPS} onStalledOut={dropVideo} />
                    ) : (
                        // Three portrait panels, each in a cell of its own: where a panel's clip
                        // cannot play, the hero image underneath shows through that third of the
                        // screen and the other two stay where they are.
                        <div
                            className="absolute inset-0 grid grid-cols-3"
                            data-testid="hero-panels"
                        >
                            <div className="relative h-full">
                                <HeroVideoPanel
                                    sources={HERO_LEFT_CLIPS}
                                    onStalledOut={dropVideo}
                                />
                            </div>
                            <div className="relative h-full">
                                <HeroVideoPanel
                                    sources={HERO_MIDDLE_CLIPS}
                                    onStalledOut={dropVideo}
                                />
                            </div>
                            <div className="relative h-full">
                                <HeroVideoPanel
                                    sources={HERO_RIGHT_CLIPS}
                                    onStalledOut={dropVideo}
                                />
                            </div>
                        </div>
                    ))}
                <div className="absolute inset-0 hero-gradient-mesh" />
                {/* A plain warm tint. Blend modes (soft-light, multiply grain) over a playing video
                    had to be recomposited on every frame. */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#fbe4db_0%,_#fefbea_45%,_#f5e48a_100%)] opacity-15" />
                <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80" />
            </motion.div>
            <motion.div
                style={{ opacity: parallaxActive ? heroTextOverlayOpacity : 0 }}
                className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-cream/20 to-cream/80"
            />

            <motion.div
                style={{ opacity: parallaxActive ? heroOpacity : 1 }}
                className="relative z-10 h-full flex flex-col items-center justify-center text-center px-4"
            >
                {/* The badge is part of the h1 so the heading says what and where ("Creative
                    workshops in Pune") to search engines. The h1 only lays the two out: the badge
                    and the headline keep the exact classes they had as separate elements. */}
                <h1 className="mb-6 flex flex-col items-center">
                    <span
                        style={{ "--reveal-delay": "0.2s" } as React.CSSProperties}
                        className="reveal-scale inline-flex items-center gap-2 bg-white/20 border border-white/20 rounded-full px-5 py-2 mb-8 hover-lift"
                    >
                        <Sparkles className="w-4 h-4 text-terracotta-300" aria-hidden="true" />
                        <span className="text-sm font-inter font-medium text-white/90">
                            Creative workshops in Pune
                        </span>
                    </span>{" "}
                    <span className="heading-xl block text-white max-w-4xl text-balance text-glow-soft">
                        {/* A real space after each word (not a margin): otherwise the heading's text,
                            which search engines and screen readers read, is "ABetterWeekend". */}
                        {headlineWords.map((word, i) => (
                            <Fragment key={word}>
                                <span
                                    style={
                                        {
                                            "--reveal-delay": `${0.3 + i * 0.12}s`,
                                        } as React.CSSProperties
                                    }
                                    className="reveal-up inline-block"
                                >
                                    {word}
                                </span>{" "}
                            </Fragment>
                        ))}
                        <br />
                        <span
                            style={{ "--reveal-delay": "0.66s" } as React.CSSProperties}
                            className="reveal-up text-terracotta-300 inline-block"
                        >
                            Awaits.
                        </span>
                    </span>
                </h1>

                <div className="overflow-hidden mb-10">
                    <p
                        style={{ "--reveal-delay": "0.45s" } as React.CSSProperties}
                        className="reveal-up text-lg sm:text-xl font-inter text-white/80 max-w-xl"
                    >
                        Celebrate through experience. Connect through creativity.
                    </p>
                </div>

                <div
                    style={{ "--reveal-delay": "0.7s" } as React.CSSProperties}
                    className="reveal-up flex flex-col sm:flex-row items-center gap-4"
                >
                    <Link
                        href="/explore"
                        className="btn-primary btn-animated text-base !px-10 !py-4 shadow-lg shadow-terracotta/25 hover:shadow-xl hover:shadow-terracotta/40 hover:ring-4 hover:ring-terracotta/20"
                    >
                        Explore Workshops
                        <ArrowRight className="w-5 h-5" />
                    </Link>
                </div>
            </motion.div>

            {!shouldReduceMotion && (
                <motion.div
                    {...scrollIndicatorMotionProps}
                    className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
                    aria-hidden="true"
                >
                    <div className="scroll-cue w-6 h-10 rounded-full border-2 border-white/40 flex items-start justify-center p-2">
                        <div className="w-1.5 h-1.5 bg-white rounded-full" />
                    </div>
                </motion.div>
            )}
        </section>
    );
}
