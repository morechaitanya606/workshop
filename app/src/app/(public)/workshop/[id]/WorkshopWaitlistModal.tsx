"use client";

import { BellRing, X } from "lucide-react";

export interface WorkshopWaitlistModalProps {
    showWaitlistModal: boolean;
    setShowWaitlistModal: (show: boolean) => void;
    waitlistEmail: string;
    setWaitlistEmail: (email: string) => void;
    waitlistLoading: boolean;
    waitlistError: string | null;
    setWaitlistError: (error: string | null) => void;
    waitlistSuccess: boolean;
    onJoinWaitlist: (e: React.FormEvent) => void;
}

export default function WorkshopWaitlistModal({
    showWaitlistModal,
    setShowWaitlistModal,
    waitlistEmail,
    setWaitlistEmail,
    waitlistLoading,
    waitlistError,
    setWaitlistError,
    waitlistSuccess,
    onJoinWaitlist,
}: WorkshopWaitlistModalProps) {
    if (!showWaitlistModal) return null;

    return (
        <div
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowWaitlistModal(false)}
        >
            <div
                id="waitlist-modal"
                className="bg-white rounded-2xl p-6 sm:p-8 w-full max-w-md shadow-card relative"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                <button
                    onClick={() => setShowWaitlistModal(false)}
                    className="absolute top-4 right-4 p-2 rounded-full hover:bg-cream-100 text-dark-muted transition-colors"
                    aria-label="Close modal"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-terracotta/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <BellRing className="w-6 h-6 text-terracotta" />
                    </div>
                    <h3 className="heading-sm mb-2">Join the Waitlist</h3>
                    <p className="text-sm font-inter text-dark-secondary">
                        This workshop is currently full. We&apos;ll email you immediately if a spot
                        opens up.
                    </p>
                </div>

                {waitlistSuccess ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                        <p className="text-sm font-inter font-semibold text-emerald-800">
                            You&apos;re on the list!
                        </p>
                        <p className="text-xs font-inter text-emerald-700 mt-1">
                            We&apos;ll notify {waitlistEmail} if seats become available.
                        </p>
                        <button
                            onClick={() => setShowWaitlistModal(false)}
                            className="btn-primary w-full mt-4 !py-2.5"
                        >
                            Close
                        </button>
                    </div>
                ) : (
                    <form onSubmit={onJoinWaitlist} className="space-y-4">
                        <div>
                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                Email Address
                            </label>
                            <input
                                type="email"
                                value={waitlistEmail}
                                onChange={(e) => {
                                    setWaitlistEmail(e.target.value);
                                    setWaitlistError(null);
                                }}
                                required
                                placeholder="Enter your email"
                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter focus:outline-none focus:border-terracotta/50 focus:ring-1 focus:ring-terracotta/30"
                            />
                            {waitlistError && (
                                <p className="text-xs font-inter text-red-600 mt-1.5">
                                    {waitlistError}
                                </p>
                            )}
                        </div>
                        <button
                            type="submit"
                            disabled={waitlistLoading}
                            className="btn-primary w-full !py-3 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {waitlistLoading ? "Joining..." : "Join Waitlist"}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
