"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type SheetSide = "left" | "right" | "bottom";

type SheetProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title?: string;
    side?: SheetSide;
    children: React.ReactNode;
    className?: string;
    overlayClassName?: string;
};

function sideClassName(side: SheetSide) {
    if (side === "left") {
        return "left-0 border-r border-gray-200";
    }
    if (side === "bottom") {
        return "bottom-0 inset-x-0 border-t border-gray-200 rounded-t-2xl max-h-[85vh] overflow-y-auto";
    }
    return "right-0 border-l border-gray-200";
}

function panelBaseClassName(side: SheetSide) {
    if (side === "bottom") {
        return "absolute w-full bg-white p-5 shadow-card";
    }
    return "absolute top-0 h-full w-full max-w-md bg-white p-5 shadow-card";
}

export function Sheet({
    open,
    onOpenChange,
    title,
    side = "right",
    children,
    className,
    overlayClassName,
}: SheetProps) {
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
            className={cn("fixed inset-0 z-[120] bg-black/45", overlayClassName)}
            onClick={() => onOpenChange(false)}
            role="dialog"
            aria-modal="true"
            aria-label={title || "Sheet"}
        >
            <aside
                className={cn(panelBaseClassName(side), sideClassName(side), className)}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="mb-4 flex items-center justify-between">
                    <p className="font-playfair text-lg font-semibold text-dark">{title}</p>
                    <button
                        onClick={() => onOpenChange(false)}
                        aria-label="Close sheet"
                        className="rounded-full p-1 text-dark-muted hover:bg-gray-100"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                {children}
            </aside>
        </div>
    );
}
