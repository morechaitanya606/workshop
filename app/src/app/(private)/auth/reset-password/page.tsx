"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, CheckCircle, Loader2, Lock } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { getFriendlyAuthError } from "@/lib/auth-notices";
import { cardReveal, standardTransition, useMotionProps } from "@/lib/motion-presets";

/** Same rule as the signup form, so a reset cannot set a weaker password than signup allows. */
function getPasswordProblem(password: string) {
    if (password.length < 8 || !/[A-Z]/.test(password) || !/\d/.test(password)) {
        return "Password must be at least 8 characters and include one uppercase letter and one number.";
    }
    return null;
}

/**
 * Reached from the reset email via /auth/confirm, which signs the visitor in first. Without
 * that session updateUser can only fail ("Auth session missing"), so the page checks for it
 * up front and offers a new link instead of a form that cannot work.
 */
export default function ResetPasswordPage() {
    const prefersReducedMotion = useReducedMotion();
    const [status, setStatus] = useState<"checking" | "ready" | "invalid">(
        isSupabaseConfigured ? "checking" : "ready"
    );
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const cardMotionProps = useMotionProps(prefersReducedMotion, cardReveal, standardTransition, {
        whileInView: false,
    });

    useEffect(() => {
        if (!isSupabaseConfigured) return;
        let active = true;

        // getSession waits for the client to finish reading any session in the URL, so its
        // answer is final for links that went through /auth/confirm.
        supabase.auth.getSession().then(({ data }) => {
            if (active) setStatus(data.session ? "ready" : "invalid");
        });

        // Older links that carry the session in the URL hash are read a moment later.
        const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
            if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN")) {
                setStatus("ready");
            }
        });

        return () => {
            active = false;
            listener.subscription.unsubscribe();
        };
    }, []);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setSuccess(false);

        if (!isSupabaseConfigured) {
            setError("Authentication is not configured. Add Supabase env vars first.");
            return;
        }

        const problem = getPasswordProblem(password);
        if (problem) {
            setError(problem);
            return;
        }
        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setLoading(true);
        const { error: updateError } = await supabase.auth.updateUser({
            password,
        });
        setLoading(false);

        if (updateError) {
            setError(getFriendlyAuthError(updateError.message));
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
                <h1 className="heading-md mb-2">Set new password</h1>

                {status === "checking" && (
                    <p className="flex items-center gap-2 text-body text-dark-muted" role="status">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Checking your reset link...
                    </p>
                )}

                {status === "invalid" && (
                    <>
                        <div className="mb-6 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-inter">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            This reset link has expired, was already used, or was opened in a
                            different browser. Request a new one and open it from the email.
                        </div>
                        <Link href="/auth/forgot-password" className="btn-primary w-full !py-3.5">
                            Request a new link
                        </Link>
                    </>
                )}

                {status === "ready" && success && (
                    <>
                        <div className="mb-6 flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm font-inter">
                            <CheckCircle className="w-4 h-4" />
                            Password updated. You are signed in.
                        </div>
                        <Link href="/" className="btn-primary w-full !py-3.5">
                            Continue to Only Workshops
                        </Link>
                    </>
                )}

                {status === "ready" && !success && (
                    <>
                        <p className="text-body text-dark-muted mb-6">
                            Enter a new password for your account. Use at least 8 characters, with
                            one uppercase letter and one number.
                        </p>

                        {error && (
                            <div
                                id="reset-error"
                                className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-inter"
                                role="alert"
                            >
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-muted" />
                                <input
                                    type="password"
                                    required
                                    autoComplete="new-password"
                                    aria-label="New password"
                                    aria-describedby={error ? "reset-error" : undefined}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="New password"
                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl pl-12 pr-4 py-3.5 text-sm font-inter text-dark outline-none focus:border-terracotta transition-colors"
                                />
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-muted" />
                                <input
                                    type="password"
                                    required
                                    autoComplete="new-password"
                                    aria-label="Confirm new password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm new password"
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
                                        Updating...
                                    </>
                                ) : (
                                    "Update password"
                                )}
                            </button>
                        </form>
                    </>
                )}

                <p className="text-sm font-inter text-dark-muted mt-6">
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
