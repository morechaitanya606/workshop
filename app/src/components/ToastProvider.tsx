"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

type ToastVariant = "success" | "error" | "info" | "warning";

type ToastInput = {
    title: string;
    description?: string;
    variant?: ToastVariant;
    durationMs?: number;
};

type ToastItem = ToastInput & {
    id: number;
    variant: ToastVariant;
    durationMs: number;
};

type ToastContextValue = {
    showToast: (input: ToastInput) => void;
    success: (title: string, description?: string) => void;
    error: (title: string, description?: string) => void;
    info: (title: string, description?: string) => void;
    warning: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 4200;

function toastVariantClassName(variant: ToastVariant) {
    if (variant === "success") {
        return "border-emerald-200 bg-emerald-50 text-emerald-900";
    }
    if (variant === "error") {
        return "border-red-200 bg-red-50 text-red-900";
    }
    if (variant === "warning") {
        return "border-amber-200 bg-amber-50 text-amber-900";
    }
    return "border-gray-200 bg-white text-dark";
}

function toastProgressColor(variant: ToastVariant) {
    if (variant === "success") return "bg-emerald-500";
    if (variant === "error") return "bg-red-500";
    if (variant === "warning") return "bg-amber-500";
    return "bg-terracotta";
}

function toastIcon(variant: ToastVariant) {
    if (variant === "success") {
        return <CheckCircle2 className="h-4 w-4 text-emerald-700" />;
    }
    if (variant === "error") {
        return <XCircle className="h-4 w-4 text-red-700" />;
    }
    if (variant === "warning") {
        return <Info className="h-4 w-4 text-amber-700" />;
    }
    return <Info className="h-4 w-4 text-dark-muted" />;
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const dismissToast = useCallback((id: number) => {
        setToasts((current) => current.filter((item) => item.id !== id));
    }, []);

    const showToast = useCallback((input: ToastInput) => {
        const nextToast: ToastItem = {
            ...input,
            id: Date.now() + Math.floor(Math.random() * 1000),
            variant: input.variant ?? "info",
            durationMs: input.durationMs ?? DEFAULT_DURATION_MS,
        };
        setToasts((current) => [...current, nextToast]);
    }, []);

    useEffect(() => {
        const timers = toasts.map((toast) =>
            window.setTimeout(() => {
                dismissToast(toast.id);
            }, toast.durationMs)
        );

        return () => {
            timers.forEach((timer) => window.clearTimeout(timer));
        };
    }, [dismissToast, toasts]);

    const value = useMemo<ToastContextValue>(
        () => ({
            showToast,
            success: (title, description) => showToast({ title, description, variant: "success" }),
            error: (title, description) => showToast({ title, description, variant: "error" }),
            info: (title, description) => showToast({ title, description, variant: "info" }),
            warning: (title, description) => showToast({ title, description, variant: "warning" }),
        }),
        [showToast]
    );

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div
                aria-live="polite"
                aria-atomic="true"
                className="pointer-events-none fixed inset-x-0 top-4 z-[120] flex justify-center px-4 sm:justify-end"
            >
                <div className="flex w-full max-w-sm flex-col gap-2">
                    {toasts.map((toast) => (
                        <div
                            key={toast.id}
                            className={`pointer-events-auto rounded-xl border px-4 py-3 shadow-soft backdrop-blur-sm toast-enter overflow-hidden ${toastVariantClassName(
                                toast.variant
                            )}`}
                            role="status"
                        >
                            <div className="flex items-start gap-2.5">
                                <div className="mt-0.5">{toastIcon(toast.variant)}</div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-inter font-semibold leading-tight">
                                        {toast.title}
                                    </p>
                                    {toast.description ? (
                                        <p className="mt-1 text-xs font-inter text-current/80 leading-relaxed">
                                            {toast.description}
                                        </p>
                                    ) : null}
                                </div>
                                <button
                                    aria-label="Dismiss toast"
                                    onClick={() => dismissToast(toast.id)}
                                    className="rounded-full p-1 text-current/70 transition-colors hover:bg-black/5 hover:text-current"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                            <div className="mt-2 h-0.5 w-full rounded-full bg-black/5 overflow-hidden">
                                <div
                                    className={`h-full rounded-full toast-progress ${toastProgressColor(toast.variant)}`}
                                    style={{ animationDuration: `${toast.durationMs}ms` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error("useToast must be used within ToastProvider.");
    }
    return context;
}
