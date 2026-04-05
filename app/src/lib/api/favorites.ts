import { apiRequest } from "./client";

export type FavoritesResponse = {
    favorites: string[];
    source: "supabase" | "memory";
};

export function getFavorites(accessToken: string) {
    return apiRequest<FavoritesResponse>("/api/favorites", {
        accessToken,
        cache: "no-store",
    });
}

export function addFavorite(accessToken: string, workshopId: string) {
    return apiRequest<FavoritesResponse>("/api/favorites", {
        method: "POST",
        accessToken,
        body: { workshopId },
    });
}

export function removeFavorite(accessToken: string, workshopId: string) {
    return apiRequest<FavoritesResponse>("/api/favorites", {
        method: "DELETE",
        accessToken,
        body: { workshopId },
    });
}
