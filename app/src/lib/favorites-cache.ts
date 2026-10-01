/**
 * In-memory favourites cache shared by `WorkshopCard` and the auth provider.
 *
 * It lives in its own module so `auth-context` (which wraps the whole app in the root layout)
 * can clear it on sign-out without importing the heavy `WorkshopCard` component into the root
 * bundle.
 */
export const favoritesCache = new Map<string, string[]>();
export const favoritesRequests = new Map<string, Promise<string[]>>();

export function clearFavoritesCache() {
    favoritesCache.clear();
    favoritesRequests.clear();
}
