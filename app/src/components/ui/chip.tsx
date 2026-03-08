import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Chip({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border border-clay/40 bg-cream-100 px-2.5 py-1.5 text-xs font-inter font-medium text-dark-secondary",
                className
            )}
            {...props}
        />
    );
}
