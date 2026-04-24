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
            <body
                className="min-h-screen bg-cream flex items-center justify-center p-6"
                style={{
                    minHeight: "100vh",
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "1.5rem",
                    backgroundColor: "#fefbea",
                    color: "#1f1f1f",
                    fontFamily: 'var(--font-inter, "Inter", "Helvetica Neue", Arial, sans-serif)',
                }}
            >
                <div
                    className="max-w-md w-full bg-white rounded-2xl shadow-soft p-8 text-center"
                    style={{
                        width: "100%",
                        maxWidth: "28rem",
                        padding: "2rem",
                        borderRadius: "1rem",
                        backgroundColor: "#ffffff",
                        boxShadow: "0 24px 45px -28px rgba(24, 21, 15, 0.34)",
                        textAlign: "center",
                    }}
                >
                    <h1
                        className="heading-md mb-3"
                        style={{
                            margin: 0,
                            marginBottom: "0.75rem",
                            fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
                            fontSize: "1.875rem",
                            fontWeight: 500,
                            lineHeight: 1.2,
                            color: "#1f1f1f",
                        }}
                    >
                        Something went wrong
                    </h1>
                    <p
                        className="text-body text-dark-muted mb-6"
                        style={{
                            margin: 0,
                            marginBottom: "1.5rem",
                            fontSize: "1rem",
                            lineHeight: 1.7,
                            color: "#666666",
                        }}
                    >
                        An unexpected error occurred. Please try again.
                    </p>
                    <button
                        type="button"
                        onClick={() => reset()}
                        className="btn-primary"
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.5rem",
                            minHeight: "44px",
                            padding: "0.875rem 2rem",
                            border: "none",
                            borderRadius: "9999px",
                            backgroundColor: "#c76b4f",
                            color: "#ffffff",
                            font: "inherit",
                            fontWeight: 600,
                            cursor: "pointer",
                            boxShadow: "0 12px 24px -18px rgba(199, 107, 79, 0.75)",
                        }}
                    >
                        Try again
                    </button>
                </div>
            </body>
        </html>
    );
}
