"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
    Mail,
    Lock,
    ArrowRight,
    Eye,
    EyeOff,
    Loader2,
    AlertCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";

function LoginContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { signIn, signInWithGoogle } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const rawRedirect = searchParams.get("redirect");
    let redirectPath = "/";
    if (rawRedirect) {
        try {
            const decoded = decodeURIComponent(rawRedirect);
            if (decoded.startsWith("/")) {
                redirectPath = decoded;
            }
        } catch {
            redirectPath = "/";
        }
    }

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setLoading(true);

        const { error: authError } = await signIn(email, password);
        if (authError) {
            setError(authError);
            setLoading(false);
        } else {
            // Check role after successful login
            try {
                const {
                    data: { session },
                } = await supabase.auth.getSession();
                const accessToken = session?.access_token;
                const res = await fetch("/api/auth/me", {
                    headers: accessToken
                        ? { Authorization: `Bearer ${accessToken}` }
                        : undefined,
                    cache: "no-store",
                });
                if (res.ok && accessToken) {
                    const data = await res.json();
                    if (data.role === "admin") {
                        router.push("/admin/dashboard");
                        return;
                    }
                }
            } catch (err) {
                console.error("Failed to check role during login:", err);
            }
            router.push(redirectPath);
        }
    };

    const handleGoogleSignIn = async () => {
        setError(null);
        const { error: oauthError } = await signInWithGoogle(redirectPath);
        if (oauthError) {
            setError(oauthError);
        }
    };

    return (
        <main className="min-h-screen bg-cream flex">
            <div className="flex-1 flex items-center justify-center px-6 py-12">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full max-w-md"
                >
                    <Link href="/" className="flex items-center gap-2.5 mb-10">
                        <div className="relative w-10 h-10 rounded-xl overflow-hidden">
                            <Image
                                src="/images/logo-black.jpeg"
                                alt="Only Workshop"
                                fill
                                className="object-cover"
                            />
                        </div>
                        <span className="font-playfair text-2xl font-bold text-dark">
                            Only Workshop
                        </span>
                    </Link>

                    <h1 className="heading-lg mb-2">Welcome back</h1>
                    <p className="text-body text-dark-muted mb-8">
                        Log in to discover and book your next creative adventure.
                    </p>

                    {error && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm font-inter rounded-xl px-4 py-3 mb-6">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                Email Address
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-muted" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    placeholder="your@email.com"
                                    required
                                    className="w-full bg-white border border-gray-200 rounded-xl pl-12 pr-4 py-3.5 text-sm font-inter text-dark outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/10 transition-all"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-muted" />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    placeholder="********"
                                    required
                                    className="w-full bg-white border border-gray-200 rounded-xl pl-12 pr-12 py-3.5 text-sm font-inter text-dark outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/10 transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2"
                                >
                                    {showPassword ? (
                                        <EyeOff className="w-5 h-5 text-dark-muted" />
                                    ) : (
                                        <Eye className="w-5 h-5 text-dark-muted" />
                                    )}
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded border-gray-300 accent-terracotta"
                                />
                                <span className="text-sm font-inter text-dark-muted">
                                    Remember me
                                </span>
                            </label>
                            <Link
                                href="/auth/forgot-password"
                                className="text-sm font-inter font-medium text-terracotta hover:underline"
                            >
                                Forgot password?
                            </Link>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary w-full !py-4 text-base mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    Log In
                                    <ArrowRight className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="relative my-8">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-clay/50" />
                        </div>
                        <div className="relative flex justify-center">
                            <span className="bg-cream px-4 text-sm font-inter text-dark-muted">
                                or continue with
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={handleGoogleSignIn}
                        className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-xl py-3.5 text-sm font-inter font-medium text-dark hover:border-terracotta/40 transition-colors"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path
                                fill="#4285F4"
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                            />
                            <path
                                fill="#34A853"
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                                fill="#FBBC05"
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            />
                            <path
                                fill="#EA4335"
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            />
                        </svg>
                        Continue with Google
                    </button>

                    <p className="text-center text-sm font-inter text-dark-muted mt-8">
                        {"Don't have an account?"}{" "}
                        <Link
                            href="/auth/signup"
                            className="text-terracotta font-semibold hover:underline"
                        >
                            Sign up
                        </Link>
                    </p>
                </motion.div>
            </div>

            <div className="hidden lg:block w-[45%] relative">
                <Image
                    src="/images/background.webp"
                    alt="Creative workshops"
                    fill
                    className="object-cover"
                    priority
                />
                <div className="absolute inset-0 bg-gradient-to-l from-terracotta/20 to-black/40" />
                <div className="absolute inset-0 flex items-end p-12">
                    <div>
                        <blockquote className="font-playfair text-2xl text-white font-semibold leading-relaxed mb-4">
                            &ldquo;The best workshops I have ever been to. Met amazing people and
                            learned skills I never thought I could.&rdquo;
                        </blockquote>
                        <p className="text-sm font-inter text-white/70">
                            - Priya S., Workshop Enthusiast
                        </p>
                    </div>
                </div>
            </div>
        </main>
    );
}

export default function LoginPage() {
    return (
        <Suspense
            fallback={
                <main className="min-h-screen flex items-center justify-center bg-cream">
                    <Loader2 className="w-8 h-8 animate-spin text-terracotta" />
                </main>
            }
        >
            <LoginContent />
        </Suspense>
    );
}
