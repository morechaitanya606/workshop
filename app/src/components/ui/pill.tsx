import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type PillVariant = "active" | "default";

const variantClassName: Record<PillVariant, string> = {
    active: "bg-terracotta text-white border-terracotta",
    default: "bg-white text-dark border-gray-200 hover:border-terracotta hover:text-terracotta",
};

export function Pill({
    className,
    variant = "default",
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: PillVariant }) {
    return (
        <button
            className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-inter font-medium transition-colors",
                variantClassName[variant],
                className
            )}
            {...props}
        />
    );
}
