"use client";

import { Loader2, Heart, HeartOff } from "lucide-react";
import type { Workshop } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";

type ProfileWishlistPanelProps = {
    favoriteWorkshops: Workshop[];
    loadingFavorites: boolean;
    onExplore: () => void;
    onUnsaveWorkshop: (workshopId: string) => Promise<void>;
    onViewWorkshop: (workshopId: string) => void;
    removingFavoriteId: string | null;
};

export default function ProfileWishlistPanel({
    favoriteWorkshops,
    loadingFavorites,
    onExplore,
    onUnsaveWorkshop,
    onViewWorkshop,
    removingFavoriteId,
}: ProfileWishlistPanelProps) {
    if (loadingFavorites) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-dark/60">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-terracotta" />
                <p>Loading your wishlist...</p>
            </div>
        );
    }

    if (favoriteWorkshops.length === 0) {
        return (
            <div className="bg-white rounded-2xl p-12 text-center shadow-soft border border-dark/5">
                <div className="w-16 h-16 bg-cream rounded-full flex items-center justify-center mx-auto mb-6 text-terracotta">
                    <Heart className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-medium mb-2">No saved workshops yet</h3>
                <p className="text-dark/60 mb-8 max-w-md mx-auto">
                    Save workshops from the detail page to see them here.
                </p>
                <button onClick={onExplore} className="btn-primary">
                    Explore Workshops
                </button>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {favoriteWorkshops.map((workshop) => (
                <div
                    key={workshop.id}
                    className="rounded-2xl bg-white p-5 shadow-soft border border-dark/5 hover:border-terracotta/40 transition-colors"
                >
                    <div className="mb-3 flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-terracotta">
                            {workshop.category}
                        </p>
                        <button
                            type="button"
                            onClick={() => void onUnsaveWorkshop(workshop.id)}
                            disabled={removingFavoriteId === workshop.id}
                            aria-label={`Remove ${workshop.title} from wishlist`}
                            className="inline-flex items-center gap-1 rounded-full border border-dark/10 px-3 py-1 text-xs font-medium text-dark/70 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {removingFavoriteId === workshop.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <HeartOff className="h-3.5 w-3.5" />
                            )}
                            Unsave
                        </button>
                    </div>
                    <h3 className="font-playfair text-xl text-dark mb-2">{workshop.title}</h3>
                    <p className="text-sm text-dark/70 mb-2">
                        {workshop.location}, {workshop.city}
                    </p>
                    <p className="text-sm text-dark/70 mb-4">
                        {formatDate(workshop.date)} | {workshop.time}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-dark">{formatCurrency(workshop.price)}</p>
                        <button
                            type="button"
                            onClick={() => onViewWorkshop(workshop.id)}
                            className="text-sm font-semibold text-terracotta hover:underline"
                        >
                            View workshop
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
