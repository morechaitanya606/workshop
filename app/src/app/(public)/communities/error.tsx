"use client";

import { useEffect } from "react";
import { retryAfterError } from "@/lib/chunk-load-recovery";
import { reportError } from "@/lib/sentry-client";

export default function CommunitiesError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        reportError(error, { route: "communities", layer: "web" });
    }, [error]);

    return (
        <section className="section-padding pt-32 pb-20">
            <div className="mx-auto max-w-2xl rounded-[2rem] border border-red-200 bg-white p-8 text-center shadow-soft sm:p-12">
                <h1 className="heading-md">Communities unavailable</h1>
                <p className="mt-4 text-body text-dark-muted">
                    We could not load communities right now. Please try again shortly.
                </p>
                <button onClick={() => retryAfterError(error, reset)} className="btn-primary mt-8">
                    Try again
                </button>
            </div>
        </section>
    );
}
