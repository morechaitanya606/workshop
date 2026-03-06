"use client";

import { useEffect } from "react";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Global error:", error);
    }, [error]);

    return (
        <html lang="en">
            <body className="min-h-screen bg-cream flex items-center justify-center p-6">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-soft p-8 text-center">
                    <h1 className="heading-md mb-3">Something went wrong</h1>
                    <p className="text-body text-dark-muted mb-6">
                        An unexpected error occurred. Please try again.
                    </p>
                    <button onClick={() => reset()} className="btn-primary">
                        Try again
                    </button>
                </div>
            </body>
        </html>
    );
}
