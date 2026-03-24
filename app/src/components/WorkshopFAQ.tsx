"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

const DEFAULT_FAQS = [
    {
        question: "Do I need any prior experience?",
        answer: "Not at all! Our workshops are designed for complete beginners as well as hobbyists. The host will guide you step-by-step.",
    },
    {
        question: "What should I bring?",
        answer: "Just bring yourself and your enthusiasm! All core materials are provided at the venue. You might want to wear comfortable clothes that you don't mind getting a little messy.",
    },
    {
        question: "Is parking available at the venue?",
        answer: "Parking availability varies by venue. We recommend checking the location details on the workshop page or contacting the host directly for specific parking information.",
    },
    {
        question: "What if I need to cancel or reschedule?",
        answer: "Bookings are generally non-refundable. If you booked during the first 2 days after a workshop was listed, you may be eligible for up to an 80% refund as long as you cancel more than 48 hours before the session. After that, refund requests are reviewed case by case and are not guaranteed, and there are no cancellations or refunds within 48 hours of the workshop. Host cancellations are always fully refunded.",
    },
    {
        question: "Can I bring a friend who hasn't booked?",
        answer: "Each attendee needs their own booking to participate. You can easily book multiple spots when reserving. Just increase the guest count.",
    },
];

export default function WorkshopFAQ() {
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const prefersReducedMotion = Boolean(useReducedMotion());

    return (
        <div className="card-section">
            <span className="eyebrow-label">FAQ</span>
            <h2 className="heading-sm font-inter mb-4">Frequently asked questions</h2>
            <div className="space-y-2">
                {DEFAULT_FAQS.map((faq, i) => (
                    <div
                        key={i}
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
