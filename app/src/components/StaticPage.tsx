"use client";

import { Children } from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { RevealGroup, RevealItem } from "@/components/ui";
import { fadeUp, standardTransition, revealViewport } from "@/lib/motion-presets";

interface StaticPageProps {
    title: string;
    description: string;
    icon?: ReactNode;
    children?: ReactNode;
}

export default function StaticPage({ title, description, icon, children }: StaticPageProps) {
    const prefersReducedMotion = useReducedMotion();
    const childSections = Children.toArray(children);

    return (
        <main className="min-h-screen bg-cream">
            <Navbar />
            <section className="pt-28 pb-16 section-padding">
                <div className="max-w-3xl mx-auto">
                    <motion.div
                        variants={prefersReducedMotion ? undefined : fadeUp}
                        initial={prefersReducedMotion ? undefined : "hidden"}
                        whileInView={prefersReducedMotion ? undefined : "visible"}
                        viewport={prefersReducedMotion ? undefined : revealViewport}
                        transition={prefersReducedMotion ? { duration: 0 } : standardTransition}
                    >
                        {icon ? (
                            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-terracotta shadow-soft">
                                {icon}
                            </div>
                        ) : null}
                        <h1 className="heading-lg mb-3">{title}</h1>
                        <p className="text-body text-dark-muted mb-8">{description}</p>
                    </motion.div>

                    {childSections.length > 0 ? (
                        <RevealGroup
                            className="space-y-5 text-body text-dark-secondary"
                            stagger={0.1}
                        >
                            {childSections.map((child, index) => (
                                <RevealItem
                                    key={index}
                                    className="rounded-2xl border-l-4 border-terracotta/20 bg-white/70 p-6 pl-5 shadow-soft"
                                    preset={index % 2 === 0 ? "fade-up" : "slide-right"}
                                >
                                    {child}
                                </RevealItem>
                            ))}
                        </RevealGroup>
                    ) : (
                        <div className="interactive-surface bg-white rounded-2xl border border-gray-100 shadow-soft p-6">
                            <p className="text-body text-dark-muted">
                                This page is being prepared for launch.
                            </p>
                        </div>
                    )}
                    <div className="mt-10">
                        <Link href="/explore" className="btn-primary">
                            Explore Workshops
                        </Link>
                    </div>
                </div>
            </section>
            <Footer />
        </main>
    );
}
