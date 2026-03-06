"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle, Loader2, Lock } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setSuccess(false);

        if (!isSupabaseConfigured) {
            setError(
                "Authentication is not configured. Add Supabase env vars first."
            );
            return;
        }

        if (password.length < 6) {
            setError("Password must be at least 6 characters.");
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
            setError(updateError.message);
            return;
        }

        setSuccess(true);
    };

    return (
        <main className="min-h-screen bg-cream flex items-center justify-center px-6 py-12">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-soft p-6 sm:p-8">
                <h1 className="heading-md mb-2">Set new password</h1>
                <p className="text-body text-dark-muted mb-6">
                    Enter a new password for your account.
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
                        Password updated successfully.
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-muted" />
                        <input
                            type="password"
                            required
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

                <p className="text-sm font-inter text-dark-muted mt-6">
                    <Link href="/auth/login" className="text-terracotta font-semibold hover:underline">
                        Back to login
                    </Link>
                </p>
            </div>
        </main>
    );
}
