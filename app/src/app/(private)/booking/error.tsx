"use client";

import { useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { retryAfterError } from "@/lib/chunk-load-recovery";
import { reportError } from "@/lib/sentry-client";

export default function BookingError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        reportError(error, { route: "booking_page", layer: "web" });
    }, [error]);

    return (
        <main className="min-h-screen bg-cream">
            <Navbar />
            <section className="section-padding pt-32 pb-20">
                <div className="mx-auto max-w-2xl rounded-[2rem] border border-red-200 bg-white p-8 text-center shadow-soft sm:p-12">
                    <h1 className="heading-md">Checkout hit an unexpected snag</h1>
                    <p className="mt-4 text-body text-dark-muted">
                        Your booking has not been confirmed from this screen. Please retry the page
                        before attempting payment again.
                    </p>
                    <button
                        onClick={() => retryAfterError(error, reset)}
                        className="btn-primary mt-8"
                    >
                        Try again
                    </button>
                </div>
            </section>
            <Footer />
        </main>
    );
}
