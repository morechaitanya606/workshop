"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type DialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    children: React.ReactNode;
    className?: string;
};

export function Dialog({
    open,
    onOpenChange,
    title,
    description,
    children,
    className,
}: DialogProps) {
    useEffect(() => {
        if (!open) return;

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onOpenChange(false);
            }
        };

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", handleEscape);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleEscape);
        };
    }, [onOpenChange, open]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
            onClick={() => onOpenChange(false)}
            role="dialog"
            aria-modal="true"
            aria-label={title}
        >
            <div
                className={cn("w-full max-w-lg rounded-2xl bg-white p-5 shadow-card", className)}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                        <h3 className="font-playfair text-xl font-semibold text-dark">{title}</h3>
                        {description ? (
                            <p className="mt-1 text-sm font-inter text-dark-muted">{description}</p>
                        ) : null}
                    </div>
                    <button
                        onClick={() => onOpenChange(false)}
                        aria-label="Close dialog"
                        className="rounded-full p-1 text-dark-muted hover:bg-gray-100"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}
