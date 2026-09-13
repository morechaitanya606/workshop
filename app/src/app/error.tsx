"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

/**
 * Root boundary.
 *
 * Without one, any route group that has no `error.tsx` of its own escalates straight to
 * `global-error.tsx` — which replaces the entire document, header and navigation included,
 * so a crash in one section left the visitor on a bare page with no way back into the site.
 * This catches everything below the root layout and keeps the chrome.
 */
export default function RootError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        Sentry.captureException(error, {
            tags: {
                route: "root",
                layer: "web",
            },
        });
    }, [error]);

    return (
        <section className="section-padding pt-32 pb-20">
            <div className="mx-auto max-w-2xl rounded-[2rem] border border-red-200 bg-white p-8 text-center shadow-soft sm:p-12">
                <h1 className="heading-md">Something went wrong</h1>
                <p className="mt-4 text-body text-dark-muted">
                    This page could not be loaded. Please try again in a moment.
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                    <button onClick={reset} className="btn-primary">
                        Try again
                    </button>
                    <Link href="/" className="btn-secondary">
                        Back to home
                    </Link>
                </div>
            </div>
        </section>
    );
}
