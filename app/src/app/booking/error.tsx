"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function BookingError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        Sentry.captureException(error, {
            tags: {
                route: "booking_page",
                layer: "web",
            },
        });
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
                    <button onClick={reset} className="btn-primary mt-8">
                        Try again
                    </button>
                </div>
            </section>
            <Footer />
        </main>
    );
}
