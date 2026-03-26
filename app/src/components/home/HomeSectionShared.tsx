"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { fadeInUp, standardTransition, useMotionProps } from "@/lib/motion-presets";

export function AnimatedCounter({
    value,
    suffix = "",
    reduceMotion = false,
    className = "",
}: {
    value: number;
    suffix?: string;
    reduceMotion?: boolean;
    className?: string;
}) {
    const [count, setCount] = useState(0);
    const ref = useRef<HTMLDivElement>(null);
    const isInView = useInView(ref, { once: true, margin: "-100px" });

    useEffect(() => {
        if (!isInView) return;
        if (reduceMotion) {
            setCount(value);
            return;
        }

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
    }, [isInView, reduceMotion, value]);

    return (
        <div
            ref={ref}
            className={`font-playfair text-4xl sm:text-5xl lg:text-6xl font-bold leading-none text-dark ${className}`}
        >
            {count.toLocaleString()}
            {suffix}
        </div>
    );
}

export function SectionHeader({
    title,
    eyebrow,
    action,
    href = "#",
    reduceMotion = false,
}: {
    title: string;
    eyebrow?: string;
    action?: string;
    href?: string;
    reduceMotion?: boolean;
}) {
    const headerMotionProps = useMotionProps(reduceMotion, fadeInUp, standardTransition);

    return (
        <motion.div
            {...headerMotionProps}
            className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-3"
        >
            <div>
                {eyebrow && <span className="eyebrow-label">{eyebrow}</span>}
                <h2 className="heading-lg">{title}</h2>
            </div>
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

export function EmptyWorkshopState({
    title,
    description,
    showTryAnotherCategory,
    onTryAnotherCategory,
}: {
    title: string;
    description: string;
    showTryAnotherCategory: boolean;
    onTryAnotherCategory: () => void;
}) {
    return (
        <div className="col-span-full rounded-2xl border border-dashed border-clay/60 bg-white/80 p-8 text-center">
            <h3 className="font-playfair text-2xl font-bold text-dark mb-3">{title}</h3>
            <p className="text-sm font-inter text-dark-muted max-w-xl mx-auto">
                {description} Brew a cup of chai and explore a different category or weekend slot.
            </p>
            {showTryAnotherCategory && (
                <button
                    type="button"
                    onClick={onTryAnotherCategory}
                    className="btn-secondary mt-6 !px-6 !py-2.5 text-sm"
                >
                    Try another category
                </button>
            )}
        </div>
    );
}
