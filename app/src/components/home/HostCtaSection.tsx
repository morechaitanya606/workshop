"use client";

import { motion } from "framer-motion";
import { Mail, Phone } from "lucide-react";
import { fadeInUp, standardTransition, useMotionProps } from "@/lib/motion-presets";

export default function HostCtaSection({ shouldReduceMotion }: { shouldReduceMotion: boolean }) {
    const hostSectionMotionProps = useMotionProps(shouldReduceMotion, fadeInUp, standardTransition);

    return (
        <section className="section-padding mt-24 sm:mt-20">
            <motion.div
                {...hostSectionMotionProps}
                className="relative bg-gradient-to-br from-terracotta to-terracotta-700 rounded-3xl p-10 sm:p-16 text-center overflow-hidden"
            >
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />

                <div className="relative z-10">
                    <h2 className="heading-lg text-white mb-4">Want to Host a Workshop?</h2>
                    <p className="text-lg font-inter text-white/80 max-w-lg mx-auto mb-8">
                        Are you a creative professional? Get in touch with our team and we will help
                        you set up your workshop.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
                        <a
                            href="mailto:hello@onlyworkshop.com"
                            className="inline-flex items-center gap-2.5 bg-white text-terracotta font-inter font-semibold px-8 py-4 rounded-full hover:shadow-lg motion-safe:hover:scale-[1.02] transition-all duration-300"
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
    );
}
