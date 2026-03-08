"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { fadeUp, standardTransition, revealViewport } from "@/lib/motion-presets";

interface StaticPageProps {
    title: string;
    description: string;
    children?: ReactNode;
}

export default function StaticPage({ title, description, children }: StaticPageProps) {
    const prefersReducedMotion = useReducedMotion();

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
                        <h1 className="heading-lg mb-3">{title}</h1>
                        <p className="text-body text-dark-muted mb-8">{description}</p>
                    </motion.div>

                    {children ? (
                        <div className="space-y-6">
                            {/* Each child section gets a left border + subtle bg for better scanability */}
                            <div className="space-y-5 text-body text-dark-secondary [&>section]:border-l-4 [&>section]:border-terracotta/20 [&>section]:bg-white/50 [&>section]:rounded-xl [&>section]:p-6 [&>section]:pl-5">
                                {children}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-6">
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
