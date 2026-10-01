"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useModalA11y } from "@/lib/use-modal-a11y";

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
    const [isMounted, setIsMounted] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const titleId = useId();
    const descriptionId = useId();

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Focus trap, initial focus, Escape, scroll lock and focus restore. `open` is gated on the
    // portal being mounted so the hook never runs before the dialog element exists.
    useModalA11y({
        open: open && isMounted,
        containerRef,
        onClose: () => onOpenChange(false),
    });

    if (!open || !isMounted) return null;

    return createPortal(
        <div
            ref={containerRef}
            className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-2 outline-none sm:items-center sm:p-4"
            onClick={() => onOpenChange(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
        >
            <div
                className={cn(
                    "w-full max-w-lg max-h-[calc(100vh-1rem)] overflow-y-auto rounded-2xl bg-white p-4 shadow-card sm:max-h-[calc(100vh-2rem)] sm:p-5",
                    className
                )}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                        <h3 id={titleId} className="font-playfair text-xl font-semibold text-dark">
                            {title}
                        </h3>
                        {description ? (
                            <p
                                id={descriptionId}
                                className="mt-1 text-sm font-inter text-dark-muted"
                            >
                                {description}
                            </p>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        aria-label="Close dialog"
                        className="rounded-full p-1 text-dark-muted hover:bg-gray-100"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                {children}
            </div>
        </div>,
        document.body
    );
}
