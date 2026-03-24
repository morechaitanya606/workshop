"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

const variantClassName: Record<ButtonVariant, string> = {
    primary: "bg-terracotta text-white hover:bg-terracotta-600 focus-visible:ring-terracotta/50",
    secondary:
        "bg-white text-dark border border-dark/20 hover:border-terracotta hover:text-terracotta focus-visible:ring-dark/20",
    ghost: "bg-transparent text-dark hover:bg-dark/5 focus-visible:ring-dark/20",
    destructive: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-400/50",
};

const sizeClassName: Record<ButtonSize, string> = {
    sm: "px-3 py-2 text-xs",
    md: "px-5 py-2.5 text-sm",
    lg: "px-6 py-3 text-base",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, type = "button", variant = "primary", size = "md", ...props }, ref) => {
        return (
            <button
                ref={ref}
                type={type}
                className={cn(
                    "interactive-surface inline-flex items-center justify-center gap-2 rounded-full font-inter font-semibold transition-colors btn-animated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-cream disabled:cursor-not-allowed disabled:opacity-60",
                    variantClassName[variant],
                    sizeClassName[size],
                    className
                )}
                {...props}
            />
        );
    }
);

Button.displayName = "Button";
