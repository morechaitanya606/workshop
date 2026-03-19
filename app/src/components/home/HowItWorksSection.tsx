"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Search, Ticket, PartyPopper } from "lucide-react";
import {
    fadeInUp,
    staggerContainer,
    standardTransition,
    revealViewport,
} from "@/lib/motion-presets";

const STEPS = [
    {
        icon: Search,
        title: "Discover",
        description:
            "Browse 50+ curated weekend workshops across cities — from pottery to mixology.",
        gradient: "from-terracotta/10 to-orange-50",
        iconColor: "text-terracotta",
    },
    {
        icon: Ticket,
        title: "Reserve",
        description: "Hold your seats instantly. Pay securely via UPI, cards, or net banking.",
        gradient: "from-emerald-50 to-teal-50",
        iconColor: "text-emerald-600",
    },
    {
        icon: PartyPopper,
        title: "Experience",
        description: "Show up, create something amazing, and take home memories that last.",
        gradient: "from-violet-50 to-indigo-50",
        iconColor: "text-violet-600",
    },
];

export default function HowItWorksSection() {
    const prefersReducedMotion = Boolean(useReducedMotion());

    return (
        <section className="section-padding mt-10 sm:mt-14">
            <motion.div
                variants={prefersReducedMotion ? undefined : fadeInUp}
                initial={prefersReducedMotion ? undefined : "hidden"}
                whileInView={prefersReducedMotion ? undefined : "visible"}
                viewport={prefersReducedMotion ? undefined : revealViewport}
                transition={prefersReducedMotion ? { duration: 0 } : standardTransition}
                className="text-center mb-8"
            >
                <span className="eyebrow-label">How It Works</span>
                <h2 className="heading-lg">Book Your Weekend in 3 Simple Steps</h2>
            </motion.div>

            <motion.div
                variants={prefersReducedMotion ? undefined : staggerContainer}
                initial={prefersReducedMotion ? undefined : "hidden"}
                whileInView={prefersReducedMotion ? undefined : "visible"}
                viewport={prefersReducedMotion ? undefined : revealViewport}
                className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6"
            >
                {STEPS.map((step, i) => (
                    <motion.div
                        key={step.title}
                        variants={prefersReducedMotion ? undefined : fadeInUp}
                        transition={
                            prefersReducedMotion
                                ? { duration: 0 }
                                : { ...standardTransition, delay: i * 0.12 }
                        }
                        className={`relative group rounded-2xl border border-clay/30 bg-gradient-to-br ${step.gradient} p-6 sm:p-8 text-center shadow-soft hover-lift transition-all duration-300`}
                    >
                        {/* Step number */}
                        <div className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/80 border border-clay/40 flex items-center justify-center">
                            <span className="text-xs font-inter font-bold text-dark-muted">
                                {i + 1}
                            </span>
                        </div>

                        {/* Icon */}
                        <div
                            className={`w-14 h-14 mx-auto mb-5 rounded-2xl bg-white/80 backdrop-blur-sm border border-white/60 shadow-soft flex items-center justify-center ${step.iconColor} group-hover:scale-110 transition-transform duration-300`}
                        >
                            <step.icon className="w-6 h-6" />
                        </div>

                        <h3 className="font-playfair text-xl font-bold text-dark mb-2">
                            {step.title}
                        </h3>
                        <p className="text-sm font-inter text-dark-muted leading-relaxed">
                            {step.description}
                        </p>
                    </motion.div>
                ))}
            </motion.div>
        </section>
    );
}
