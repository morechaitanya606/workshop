import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type StatProps = {
    label: string;
    value: string | number;
    icon?: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

export function Stat({ label, value, icon, className, ...props }: StatProps) {
    return (
        <div
            className={cn("rounded-2xl border border-gray-100 bg-white p-5 shadow-soft", className)}
            {...props}
        >
            <p className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                {label}
            </p>
            <p className="mt-2 inline-flex items-center gap-2 font-playfair text-2xl font-bold text-dark">
                {icon}
                {value}
            </p>
        </div>
    );
}
