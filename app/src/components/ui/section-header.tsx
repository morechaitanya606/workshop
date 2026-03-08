import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionHeaderProps = {
    title: string;
    subtitle?: string;
    actionHref?: string;
    actionLabel?: string;
    trailing?: ReactNode;
    className?: string;
};

export function SectionHeader({
    title,
    subtitle,
    actionHref,
    actionLabel,
    trailing,
    className,
}: SectionHeaderProps) {
    return (
        <div className={cn("mb-6 flex items-end justify-between gap-4", className)}>
            <div>
                <h2 className="font-playfair text-3xl font-bold text-dark">{title}</h2>
                {subtitle ? (
                    <p className="mt-1 text-sm font-inter text-dark-muted">{subtitle}</p>
                ) : null}
            </div>
            {trailing ? (
                trailing
            ) : actionHref && actionLabel ? (
                <Link
                    href={actionHref}
                    className="inline-flex items-center gap-1 text-sm font-inter font-semibold text-terracotta hover:gap-2 transition-all"
                >
                    {actionLabel}
                    <ArrowRight className="h-4 w-4" />
                </Link>
            ) : null}
        </div>
    );
}
