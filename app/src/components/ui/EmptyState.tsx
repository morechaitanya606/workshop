import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description: string;
    actionLabel?: string;
    actionHref?: string;
}

export default function EmptyState({
    icon: Icon,
    title,
    description,
    actionLabel,
    actionHref,
}: EmptyStateProps) {
    return (
        <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-clay/60 bg-white/80 p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-terracotta/10 flex items-center justify-center mb-5">
                <Icon className="w-6 h-6 text-terracotta" />
            </div>
            <h3 className="font-playfair text-xl font-bold text-dark mb-2">{title}</h3>
            <p className="text-sm font-inter text-dark-muted max-w-md mx-auto mb-5 leading-relaxed">
                {description}
            </p>
            {actionLabel && actionHref && (
                <Link href={actionHref} className="btn-primary !px-6 !py-2.5 text-sm">
                    {actionLabel}
                </Link>
            )}
        </div>
    );
}
