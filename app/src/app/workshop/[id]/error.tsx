"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function WorkshopDetailError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        Sentry.captureException(error, {
            tags: {
                route: "workshop_detail",
                layer: "web",
            },
        });
    }, [error]);

    return (
        <section className="section-padding pt-32 pb-20">
            <div className="mx-auto max-w-2xl rounded-[2rem] border border-red-200 bg-white p-8 text-center shadow-soft sm:p-12">
                <h1 className="heading-md">Workshop unavailable</h1>
                <p className="mt-4 text-body text-dark-muted">
                    We could not load this workshop right now. Please try again in a moment.
                </p>
                <button onClick={reset} className="btn-primary mt-8">
                    Try again
                </button>
            </div>
        </section>
    );
}
