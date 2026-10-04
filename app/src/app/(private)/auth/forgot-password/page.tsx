"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2, Mail, CheckCircle, AlertCircle } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { getClientAppUrl } from "@/lib/client-url";
import { getAuthNotice, getFriendlyAuthError } from "@/lib/auth-notices";

/**
 * The reset email returns through /auth/confirm, which signs the visitor in and sends them to
 * /auth/reset-password. `flow=recovery` makes a stale link come back here with a notice.
 * Must be allow-listed under Supabase > Authentication > URL Configuration.
 */
const RESET_REDIRECT_PATH = "/auth/confirm?flow=recovery&next=/auth/reset-password";
import { cardReveal, standardTransition, useMotionProps } from "@/lib/motion-presets";

export default function ForgotPasswordPage() {
    const prefersReducedMotion = useReducedMotion();
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const cardMotionProps = useMotionProps(prefersReducedMotion, cardReveal, standardTransition, {
        whileInView: false,
    });

    // /auth/confirm sends a stale or already-used reset link back here with ?notice=link-expired.
    // Read once from the URL (not useSearchParams, which would need a Suspense boundary).
    useEffect(() => {
        const notice = getAuthNotice(new URLSearchParams(window.location.search).get("notice"));
        if (notice?.tone === "error") setError(notice.text);
    }, []);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setSuccess(false);

        if (!isSupabaseConfigured) {
            setError("Authentication is not configured. Add Supabase env vars first.");
            return;
        }

        setLoading(true);
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: getClientAppUrl(RESET_REDIRECT_PATH),
        });
        setLoading(false);

        if (resetError) {
            setError(getFriendlyAuthError(resetError.message));
            return;
        }

        setSuccess(true);
    };

    return (
        <main className="min-h-screen bg-cream flex items-center justify-center px-6 py-12">
            <motion.div
                {...cardMotionProps}
                className="w-full max-w-md bg-white rounded-2xl shadow-soft p-6 sm:p-8"
            >
                <h1 className="heading-md mb-2">Reset your password</h1>
                <p className="text-body text-dark-muted mb-6">
                    Enter your account email and we will send you a reset link.
                </p>

                {error && (
                    <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-inter">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                    </div>
                )}

                {success && (
                    <div className="mb-4 flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm font-inter">
                        <CheckCircle className="w-4 h-4" />
                        If an account exists for that email, a reset link is on its way. Check your
                        inbox and spam folder.
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-muted" />
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="your@email.com"
                            className="w-full bg-cream-100 border border-gray-200 rounded-xl pl-12 pr-4 py-3.5 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-primary w-full !py-3.5 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Sending...
                            </>
                        ) : (
                            "Send reset link"
                        )}
                    </button>
                </form>

                <p className="text-sm font-inter text-dark-muted mt-6">
                    Remembered your password?{" "}
                    <Link
                        href="/auth/login"
                        className="text-terracotta font-semibold hover:underline"
                    >
                        Back to login
                    </Link>
                </p>
            </motion.div>
        </main>
    );
}
