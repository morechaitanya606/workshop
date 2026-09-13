"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

export default function HostError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        Sentry.captureException(error, {
            tags: {
                route: "host",
                layer: "web",
            },
        });
    }, [error]);

    return (
        <section className="section-padding pt-32 pb-20">
            <div className="mx-auto max-w-2xl rounded-[2rem] border border-red-200 bg-white p-8 text-center shadow-soft sm:p-12">
                <h1 className="heading-md">Host dashboard error</h1>
                <p className="mt-4 text-body text-dark-muted">
                    Something went wrong loading this part of your host dashboard. Your workshops
                    and bookings are unaffected.
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                    <button onClick={reset} className="btn-primary">
                        Try again
                    </button>
                    <Link href="/host/dashboard" className="btn-secondary">
                        Back to dashboard
                    </Link>
                </div>
            </div>
        </section>
    );
}
