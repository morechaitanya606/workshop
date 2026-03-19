const STORAGE_KEY = "ow_recently_viewed";
const MAX_ITEMS = 8;

export function addRecentlyViewed(workshopId: string): void {
    if (typeof window === "undefined") return;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        let ids: string[] = raw ? JSON.parse(raw) : [];

        // Remove if already exists (dedup), then add to front
        ids = ids.filter((id) => id !== workshopId);
        ids.unshift(workshopId);

        // Trim to max
        if (ids.length > MAX_ITEMS) {
            ids = ids.slice(0, MAX_ITEMS);
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
        // silently fail if localStorage is unavailable
    }
}

export function getRecentlyViewed(): string[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function clearRecentlyViewed(): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // silently fail
    }
}
