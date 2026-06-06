"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { getFaqs, type FaqItem } from "@/lib/api-client";

export default function WorkshopFAQ() {
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const [faqs, setFaqs] = useState<FaqItem[]>([]);
    const prefersReducedMotion = Boolean(useReducedMotion());

    useEffect(() => {
        let cancelled = false;

        const loadFaqData = async () => {
            try {
                const result = await getFaqs();
                if (!cancelled) {
                    setFaqs(result.faqs);
                }
            } catch {
                if (!cancelled) {
                    setFaqs([]);
                }
            }
        };

        void loadFaqData();

        return () => {
            cancelled = true;
        };
    }, []);

    if (faqs.length === 0) {
        return null;
    }

    return (
        <div className="card-section">
            <span className="eyebrow-label">FAQ</span>
            <h2 className="heading-sm font-inter mb-4">Frequently asked questions</h2>
            <div className="space-y-2">
                {faqs.map((faq, i) => (
                    <div
                        key={faq.id}
                        className="rounded-xl border border-clay/30 bg-cream-100/50 overflow-hidden"
                    >
                        <button
                            type="button"
                            onClick={() => setOpenIndex(openIndex === i ? null : i)}
                            className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
                            aria-expanded={openIndex === i}
                        >
                            <span className="text-sm font-inter font-semibold text-dark">
                                {faq.question}
                            </span>
                            <ChevronDown
                                className={`w-4 h-4 text-dark-muted flex-shrink-0 transition-transform duration-200 ${
                                    openIndex === i ? "rotate-180" : ""
                                }`}
                            />
                        </button>
                        <AnimatePresence initial={false}>
                            {openIndex === i && (
                                <motion.div
                                    initial={
                                        prefersReducedMotion
                                            ? { opacity: 0 }
                                            : {
                                                  height: 0,
                                                  opacity: 0,
                                              }
                                    }
                                    animate={
                                        prefersReducedMotion
                                            ? { opacity: 1 }
                                            : {
                                                  height: "auto",
                                                  opacity: 1,
                                              }
                                    }
                                    exit={
                                        prefersReducedMotion
                                            ? { opacity: 0 }
                                            : {
                                                  height: 0,
                                                  opacity: 0,
                                              }
                                    }
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                >
                                    <p className="px-4 pb-4 text-sm font-inter text-dark-muted leading-relaxed">
                                        {faq.answer}
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                ))}
            </div>
        </div>
    );
}
